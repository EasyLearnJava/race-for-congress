"""Campaign money for the 2026 general-election nominees, from the Federal Election Commission (FEC).

- load_candidate_money: each nominee's receipts, spending, cash on hand and debts, from the FEC's
  "House and Senate current campaigns" summary, matched to our nominees by state, office, name and party.
- load_outside_spending: independent expenditures (super PACs, parties, other groups) for or against
  those nominees in the general election, from the FEC's file of 24- and 48-hour reports.

Everything comes from the FEC bulk downloads, which need no API key:
https://www.fec.gov/data/browse-data/?tab=bulk-data

Outside-spending rules, following FEC guidance:
- The independent-expenditure file holds 24- and 48-hour reports only. Every independent expenditure
  is itemized again on the spender's regular report, so the two are never added together (OpenFEC:
  "Aggregates by candidate do not include 24 and 48 hour reports. This ensures we don't double count").
  Expenditures too small to trigger a 24/48-hour report (under $10,000 a race before the final 20 days,
  under $1,000 inside them) appear only on regular reports and are not counted here.
- An amended report replaces the report it amends: only the latest version of each report is kept,
  following the amendment chain (prev_file_num). Transaction ids are not unique across reports
  (many filers restart at "SE.1"), so they are only used to drop exact re-reports of the same line.
- General election only: election code G, plus the Florida and Ohio Senate specials (code S or O after
  their primaries). Primary and runoff spending on the same nominees is reported separately
  (primary_total), because it was not spent for or against a party in November.
"""

from __future__ import annotations

import io
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from common import RAW, fetch, record_source
from states import SEATS_BY_POSTAL, race_id
from wikipedia import party_code

BULK = "https://www.fec.gov/files/bulk-downloads/2026/"
BULK_PAGE = "https://www.fec.gov/data/browse-data/?tab=bulk-data"
FEC_DIR = RAW / "fec"
FEC_TERMS = (
    "Public domain (U.S. government data). 52 U.S.C. 30111(a)(4) bars using individual contributors' "
    "names to solicit contributions or for commercial purposes; only candidate and committee totals are used."
)

# Column layouts from the FEC data dictionaries (the pipe-delimited files have no header row).
# https://www.fec.gov/campaign-finance-data/current-campaigns-house-and-senate-file-description/
WEBL_COLUMNS = [
    "CAND_ID", "CAND_NAME", "CAND_ICI", "PTY_CD", "CAND_PTY_AFFILIATION", "TTL_RECEIPTS", "TRANS_FROM_AUTH",
    "TTL_DISB", "TRANS_TO_AUTH", "COH_BOP", "COH_COP", "CAND_CONTRIB", "CAND_LOANS", "OTHER_LOANS",
    "CAND_LOAN_REPAY", "OTHER_LOAN_REPAY", "DEBTS_OWED_BY", "TTL_INDIV_CONTRIB", "CAND_OFFICE_ST",
    "CAND_OFFICE_DISTRICT", "SPEC_ELECTION", "PRIM_ELECTION", "RUN_ELECTION", "GEN_ELECTION",
    "GEN_ELECTION_PRECENT", "OTHER_POL_CMTE_CONTRIB", "POL_PTY_CONTRIB", "CVG_END_DT", "INDIV_REFUNDS",
    "CMTE_REFUNDS",
]
# https://www.fec.gov/campaign-finance-data/candidate-master-file-description/
CANDIDATE_COLUMNS = [
    "CAND_ID", "CAND_NAME", "CAND_PTY_AFFILIATION", "CAND_ELECTION_YR", "CAND_OFFICE_ST", "CAND_OFFICE",
    "CAND_OFFICE_DISTRICT", "CAND_ICI", "CAND_STATUS", "CAND_PCC", "CAND_ST1", "CAND_ST2", "CAND_CITY",
    "CAND_ST", "CAND_ZIP",
]
# https://www.fec.gov/campaign-finance-data/committee-master-file-description/
COMMITTEE_COLUMNS = [
    "CMTE_ID", "CMTE_NM", "TRES_NM", "CMTE_ST1", "CMTE_ST2", "CMTE_CITY", "CMTE_ST", "CMTE_ZIP", "CMTE_DSGN",
    "CMTE_TP", "CMTE_PTY_AFFILIATION", "CMTE_FILING_FREQ", "ORG_TP", "CONNECTED_ORG_NM", "CAND_ID",
]

# FEC committee type codes, grouped for readers.
SPENDER_TYPES = {
    "O": "Super PAC", "U": "Super PAC",
    "V": "Hybrid PAC", "W": "Hybrid PAC",
    "N": "PAC", "Q": "PAC",
    "X": "Party committee", "Y": "Party committee", "Z": "Party committee",
    "I": "Group or individual (Form 5)",
    "H": "Candidate committee", "S": "Candidate committee", "P": "Candidate committee",
}

FEC_PARTY = {"DEM": "D", "DFL": "D", "DNL": "D", "D/C": "D", "REP": "R", "GOP": "R"}
# Party codes that clearly mean "not a Democrat or Republican". Anything else that is not in FEC_PARTY
# ('', 'UNK', or a data-entry slip such as '08') counts as unknown and is allowed, but never as 'exact'.
OTHER_PARTIES = {
    "IND", "LIB", "GRE", "GRN", "CON", "NPA", "NNE", "NON", "NOP", "NPP", "OTH", "UN", "W", "AIP", "AIC",
    "IAP", "IDP", "AMP", "UST", "UNI", "FWD", "SEP", "REF", "SOC", "SWP", "PSL", "WFP", "ACE", "COM", "PRO",
    "FED", "BDY", "NAP",
}

# Senate specials held with the November general. Their nominees were chosen at these primaries,
# so independent expenditures filed under the special-election code after them are general-election money.
SPECIAL_PRIMARIES = {"FL-SEN": "2026-08-18", "OH-SEN": "2026-05-05"}
LAST_ELECTION_DAY = pd.Timestamp("2024-11-05")  # anything dated on or before it was for the 2024 election
MAX_PLAUSIBLE_AMOUNT = 100_000_000  # single lines of $1 billion+ are junk filings, never real spending
# House special elections held during the cycle (TN-07, VA-11, GA-14, ...) are found from expenditures coded
# S; anything coded G in that district up to the last of them was for the special, not for November.
SPECIAL_SEASON_END = pd.Timestamp("2026-09-01")

# Nominees who won their primary and later withdrew, as described on the Wikipedia pages the pipeline
# reads. General-election spending about them while they were the nominee still counts toward the race.
# (race_id, party, name, FEC candidate id, nominated, withdrew)
REPLACED_NOMINEES = [
    ("ME-SEN", "D", "Graham Platner", "S6ME00373", "2026-06-09", "2026-07-08"),  # replaced by Troy Jackson
    ("NC-11", "R", "Chuck Edwards", "H2NC14050", "2026-03-03", "2026-08-05"),    # replaced by Jennifer Balkcom
]

# Hand-checked matches the automatic rules cannot make: (race_id, our nominee name) -> FEC candidate id.
# Each was checked against the FEC candidate master (same state, office, district and party; the only
# candidate with that surname there). Use None to block an automatic match found to be wrong.
MANUAL_MATCHES: dict[tuple[str, str], str | None] = {
    ("CA-03", "Ami Bera"): "H0CA03078",          # BERA, AMERISH
    ("KY-03", "Maria Rodriquez"): "H6KY03223",   # RODRIGUEZ, MARIA TERESA (Wikipedia spells it Rodriquez)
    ("NC-04", "Max Ganorkar"): "H4NC02150",      # GANORKAR, MAHESH (also filed as H2NC06106; same committee)
    ("NM-01", "Didi Okpareke"): "H6NM01129",     # OKPAREKE, NDIDIAMAKA
    ("PA-16", "Mike Kelly"): "H0PA03271",        # KELLY, GEORGE J JR
    ("TX-06", "Jake Ellzey"): "H8TX06266",       # ELLZEY, JOHN KEVIN SR.
    ("WV-02", "Ace Parsi"): "H6WV02150",         # PARSI, AHSAN
}

# Common nicknames -> formal first names. A shorter name that is a prefix of the longer one
# (Dan/Daniel, Chris/Christopher) is matched without being listed.
NICKNAMES = {
    "abby": "abigail", "al": "albert alan allen alexander alfred", "andy": "andrew anderson",
    "angie": "angela angelica angelina", "barb": "barbara", "becky": "rebecca", "bernie": "bernard",
    "berney": "bernard", "bert": "albert robert herbert", "beth": "elizabeth bethany", "betsy": "elizabeth",
    "beto": "alberto roberto heriberto", "bill": "william", "billy": "william", "bob": "robert", "bobby": "robert",
    "brad": "bradley bradford", "buddy": "earl", "cathy": "catherine cathleen kathleen", "charlie": "charles",
    "chip": "charles", "chuck": "charles", "chuy": "jesus", "cindy": "cynthia lucinda", "dave": "david",
    "debbie": "deborah debra", "dick": "richard", "don": "donald", "doug": "douglas", "drew": "andrew",
    "ed": "edward edwin edmund", "eddie": "edward", "ellie": "elinor eleanor ellen elizabeth",
    "fred": "frederick alfred", "gabe": "gabriel", "gene": "eugene", "gerry": "gerald gerard", "greg": "gregory",
    "hal": "harold henry", "hank": "henry", "jack": "john jackson", "jackie": "jacqueline", "jake": "jacob",
    "jamie": "james", "jay": "james jason john", "jen": "jennifer", "jenny": "jennifer",
    "jerry": "gerald jerome jeremiah", "jim": "james", "jimmy": "james", "joe": "joseph", "joey": "joseph",
    "johnny": "john", "jon": "john jonathan", "josh": "joshua", "kate": "katherine catherine kathleen",
    "kathy": "katherine kathleen", "katie": "katherine kathleen", "ken": "kenneth", "kenny": "kenneth",
    "larry": "lawrence laurence", "len": "leonard", "liz": "elizabeth", "lizzie": "elizabeth", "lou": "louis luis",
    "lucy": "lucia lucille lucinda", "lupe": "guadalupe", "maggie": "margaret", "manny": "manuel emmanuel",
    "marty": "martin", "matt": "matthew", "meg": "margaret megan", "mike": "michael", "mickey": "michael",
    "mitch": "mitchell", "molly": "mary margaret", "nate": "nathan nathaniel", "ned": "edward",
    "nellie": "nelida ellen eleanor helen", "nick": "nicholas", "nikki": "nicole nicola", "pam": "pamela",
    "pat": "patrick patricia", "patty": "patricia", "peggy": "margaret", "pepe": "jose", "pete": "peter",
    "phil": "philip phillip", "randy": "randall randolph", "ray": "raymond", "rich": "richard",
    "rick": "richard eric frederick", "ricky": "richard", "rob": "robert", "robbie": "robert", "ron": "ronald",
    "ronnie": "ronald", "rosie": "rosemary rose rosalind", "rudy": "rudolph", "russ": "russell",
    "sally": "sarah", "sam": "samuel samantha", "sandy": "sandra alexander", "steve": "steven stephen",
    "sue": "susan suzanne", "susie": "susan suzanne", "suzie": "susan suzanne", "ted": "edward theodore",
    "teddy": "theodore", "terry": "terrence teresa", "tim": "timothy", "tom": "thomas", "tommy": "thomas",
    "tony": "anthony antonio", "trish": "patricia", "val": "valerie", "vince": "vincent", "walt": "walter",
    "will": "william", "willie": "william", "zach": "zachary", "zack": "zachary",
}
NICKNAME_PAIRS = {(nick, formal) for nick, formals in NICKNAMES.items() for formal in formals.split()}

SUFFIXES = {"jr", "sr", "ii", "iii", "iv"}
TITLES = {"mr", "mrs", "ms", "miss", "dr", "hon", "rev", "md", "phd", "esq", "jd", "ret", "col", "ltc", "cdr",
          "capt", "sgt", "maj", "gen", "prof"}
QUOTED = re.compile(r"""\(([^()]*)\)|"([^"]*)"|“([^”]*)”|(?:(?<=\s)|^)'([^']+)'(?=[\s,]|$)""")


# ---------------------------------------------------------------- downloads


def _decode(raw: bytes) -> str:
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


def _read_pipe_zip(path: Path, columns: list[str]) -> pd.DataFrame:
    with zipfile.ZipFile(path) as zf:
        text = _decode(zf.read(zf.namelist()[0]))
    return pd.read_csv(io.StringIO(text), sep="|", header=None, names=columns, dtype=str,
                       keep_default_na=False, quoting=3, index_col=False)


_refreshed: set[str] = set()  # files already downloaded again in this run (both loaders share files)


def _bulk(name: str, refresh: bool) -> Path:
    path = fetch(BULK + name, FEC_DIR / name, refresh=refresh and name not in _refreshed)
    if refresh:
        _refreshed.add(name)
    return path


def _candidate_master(refresh: bool) -> pd.DataFrame:
    return _read_pipe_zip(_bulk("cn26.zip", refresh), CANDIDATE_COLUMNS)


def _current_campaigns(refresh: bool) -> pd.DataFrame:
    return _read_pipe_zip(_bulk("webl26.zip", refresh), WEBL_COLUMNS)


def _candidate_summary(refresh: bool) -> pd.DataFrame:
    path = _bulk("candidate_summary_2026.csv", refresh)
    return pd.read_csv(io.StringIO(_decode(path.read_bytes())), dtype=str, keep_default_na=False)


def _committees(refresh: bool) -> pd.DataFrame:
    return _read_pipe_zip(_bulk("cm26.zip", refresh), COMMITTEE_COLUMNS)


def _money(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series.astype("string").str.replace(",", "", regex=False), errors="coerce").astype("float64")


# ---------------------------------------------------------------- names


@dataclass(frozen=True)
class Name:
    surname: tuple[str, ...]   # FEC-style names only; empty when the name is in natural order
    given: tuple[str, ...]
    tokens: tuple[str, ...]    # natural order: given names then surname
    last_word: tuple[str, ...]  # tokens of the final word (a hyphenated surname stays whole)
    nicknames: tuple[str, ...]


def _ascii(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()


def _tokens(text: str) -> list[str]:
    text = _ascii(text).lower()
    text = re.sub(r"(?<=[a-z])['’`](?=[a-z])", "", text)  # O'Rourke -> orourke
    return [t for t in re.sub(r"[^a-z]+", " ", text).split() if t not in TITLES and t not in SUFFIXES]


def _split_nicknames(text: str) -> tuple[str, tuple[str, ...]]:
    nicks = [t for groups in QUOTED.findall(text) for g in groups if g for t in _tokens(g)]
    return QUOTED.sub(" ", text), tuple(nicks)


def parse_name(text: str, fec_style: bool) -> Name:
    """'BEGICH, NICHOLAS III' (FEC: LAST, FIRST MIDDLE) or 'Nick Begich III' (natural order)."""
    text, nicks = _split_nicknames(str(text))
    if fec_style and "," in text:
        last, rest = text.split(",", 1)
        surname, given = _tokens(last), _tokens(rest)
        if surname:
            words = [w for w in last.split() if _tokens(w)]
            return Name(tuple(surname), tuple(given), tuple(given + surname), tuple(_tokens(words[-1])), nicks)
    tokens = _tokens(text)
    words = [w for w in text.split() if _tokens(w)]
    last_word = tuple(_tokens(words[-1])) if words else ()
    if fec_style:  # no comma: treat the final word as the surname
        n = len(last_word) or 1
        return Name(tuple(tokens[-n:]), tuple(tokens[:-n]), tuple(tokens), last_word, nicks)
    return Name((), (), tuple(tokens), last_word, nicks)


def _same_first_name(a: str, b: str) -> bool:
    if a == b:
        return True
    if min(len(a), len(b)) >= 2 and (a.startswith(b) or b.startswith(a)):
        return True
    return (a, b) in NICKNAME_PAIRS or (b, a) in NICKNAME_PAIRS


def name_score(ours: Name, fec: Name) -> tuple[int, bool] | None:
    """Score how well our nominee's name fits an FEC name; None if it cannot be the same person.

    Returns (score, exact) where exact means the same surname and the same first name. Two fallbacks
    cover FEC data-entry habits, scored lower and never exact: names typed in reverse ('NICK, LALOTA')
    and a married surname in front of the one the nominee uses ('ARENHOLZ, ASHLEY HINSON').
    """
    best = _score_as(ours, list(fec.surname), list(fec.given), list(fec.nicknames))
    variants = []
    if len(fec.surname) == 1 and len(fec.given) == 1:
        variants.append((list(fec.given), list(fec.surname)))
    if len(fec.given) >= 2:
        variants.append((list(fec.given[-1:]), list(fec.given[:-1])))
    for surname, given in variants if best is None else []:
        scored = _score_as(ours, surname, given, list(fec.nicknames))
        if scored is not None and (best is None or scored[0] - 8 > best[0]):
            best = (scored[0] - 8, False)
    return best


def _score_as(ours: Name, surname: list[str], fec_given: list[str], nicknames: list[str]) -> tuple[int, bool] | None:
    tokens = list(ours.tokens)
    if not tokens or not surname:
        return None
    n = len(surname)
    if len(tokens) > n and tokens[-n:] == surname and set(ours.last_word) <= set(surname):
        given, surname_exact = tokens[:-n], True
    elif len(tokens) >= 2 and tokens[-1] == surname[-1] and set(ours.last_word) <= set(surname):
        # FEC lists a compound surname ('FETTY ANDERSON'); the nominee uses only its last part
        given, surname_exact = [t for t in tokens[:-1] if t not in surname], False
    else:
        return None
    if not given or not (fec_given or nicknames):
        return None

    first = given[0]
    level, matched_first = 0, False  # matched_first: our first name matched the FEC first name
    for i, token in enumerate(fec_given + nicknames):
        is_first = i == 0 and bool(fec_given)
        if first == token:
            hit = 3 if is_first else 2  # 2: goes by a middle name or a listed nickname
        elif len(first) > 1 and len(token) > 1 and _same_first_name(first, token):
            hit = 2
        elif is_first and (len(first) == 1 or len(token) == 1) and first[0] == token[0]:
            hit = 1  # an initial
        else:
            hit = 0
        level = max(level, hit)
        matched_first |= is_first and hit > 0
    if level == 0:
        return None

    # Middle initials must agree when we give one (Dan S. Sullivan is not Daniel J. Sullivan). A full
    # second word on our side may be part of the surname (Rachel Fetty Anderson), so it only adds points.
    middle_agrees = False
    if matched_first and len(given) >= 2 and len(fec_given) >= 2:
        ours_mid, fec_mid = given[1], fec_given[1]
        if ours_mid[0] == fec_mid[0] and (len(ours_mid) == 1 or len(fec_mid) == 1 or ours_mid == fec_mid):
            middle_agrees = True
        elif len(ours_mid) == 1:
            return None

    score = 10 * level + (5 if surname_exact else 0) + (15 if middle_agrees else 0) + len(surname)
    return score, surname_exact and level == 3


# ---------------------------------------------------------------- nominees and matching


def _split(names: object) -> list[str]:
    return [n.strip() for n in str(names).split(" / ") if n.strip()] if isinstance(names, str) else []


def _others(text: object) -> list[tuple[str, str]]:
    out = []
    for item in str(text).split("; ") if isinstance(text, str) else []:
        m = re.match(r"^(?P<name>.+?)\s*\((?P<party>[^()]*)\)\s*$", item.strip())
        if m:
            out.append((m["name"].strip(), m["party"].strip()))
    return out


def nominees(house: pd.DataFrame, senate: pd.DataFrame) -> pd.DataFrame:
    """One row per general-election nominee: every Democrat and Republican, every independent (Dan Osborn
    in Nebraska, Seth Bodnar in Montana), and the other candidates in races that lack a Democrat or a
    Republican."""
    rows = []
    for chamber, races in (("house", house), ("senate", senate)):
        for r in races.itertuples(index=False):
            base = {
                "race_id": r.race_id,
                "chamber": chamber,
                "state": r.state,
                "district": int(r.district) if chamber == "house" else 0,
                "special": bool(getattr(r, "special", False)),
                "rating_consensus": getattr(r, "rating_consensus", ""),
            }
            dems, reps = _split(r.dem_candidate), _split(r.rep_candidate)
            people = [(n, "D") for n in dems] + [(n, "R") for n in reps]
            for name, label in _others(r.other_candidates):
                code = party_code(label)
                if code == "I" or not dems or not reps:
                    people.append((name, code))
            for name, party in people:
                rows.append({**base, "party": party, "candidate": name})
    return pd.DataFrame(rows)


def _party_fit(ours: str, fec_party: str) -> str:
    """'yes', 'no', or 'unknown' when the FEC party code is blank or not a real code."""
    fec_party = fec_party.strip().upper()
    major = FEC_PARTY.get(fec_party)
    if major:
        return "yes" if (major == ours if ours in ("D", "R") else False) else "no"
    if fec_party in OTHER_PARTIES:
        return "no" if ours in ("D", "R") else "yes"
    return "unknown"


def match_candidates(people: pd.DataFrame, candidates: pd.DataFrame, current_ids: set[str]) -> pd.DataFrame:
    """Attach an FEC candidate id to each nominee: same state and office, compatible name and party.

    House districts are only a tiebreaker because FEC records can predate the 2026 maps. Within a race
    the assignment with the best total score wins, so 'Dan S. Sullivan' and 'Dan J. Sullivan' get the two
    different Alaska Senate records. An FEC id claimed by two races is dropped unless its district decides.
    """
    pool = candidates[candidates["CAND_OFFICE"].isin(["H", "S"])].copy()
    pool = pool[(pool["CAND_ELECTION_YR"] == "2026") | pool["CAND_ID"].isin(current_ids)]
    pool["parsed"] = pool["CAND_NAME"].map(lambda s: parse_name(s, fec_style=True))
    by_key = {key: grp for key, grp in pool.groupby(["CAND_OFFICE_ST", "CAND_OFFICE"])}
    names = dict(zip(candidates["CAND_ID"], candidates["CAND_NAME"]))

    office_state = {r.CAND_ID: (r.CAND_OFFICE, r.CAND_OFFICE_ST) for r in candidates.itertuples(index=False)}
    chosen: dict[int, tuple[str, int, str]] = {}
    for race_id, race in people.groupby("race_id", sort=False):
        office = "S" if race["chamber"].iloc[0] == "senate" else "H"
        options: dict[int, list[tuple[int, str, str]]] = {}
        for idx, person in race.iterrows():
            manual = MANUAL_MATCHES.get((race_id, person["candidate"]), "")
            if manual is None:
                continue
            if manual and office_state.get(manual) == (office, person["state"]):
                chosen[idx] = (manual, 1000, "manual")
                continue
            ours = parse_name(person["candidate"], fec_style=False)
            opts = []
            for cand in by_key.get((person["state"], office), pd.DataFrame()).itertuples(index=False):
                fit = _party_fit(person["party"], cand.CAND_PTY_AFFILIATION)
                if fit == "no":
                    continue
                scored = name_score(ours, cand.parsed)
                if scored is None:
                    continue
                score, exact = scored
                if fit == "unknown":
                    score, exact = score - 5, False
                if office == "H" and cand.CAND_OFFICE_DISTRICT.isdigit() and int(cand.CAND_OFFICE_DISTRICT) == person["district"]:
                    score += 3
                score += 2 if cand.CAND_ELECTION_YR == "2026" else 0
                score += 1 if cand.CAND_ID in current_ids else 0
                opts.append((score, cand.CAND_ID, "exact" if exact else "fuzzy"))
            if opts:
                options[idx] = sorted(opts, reverse=True)[:6]

        # Best joint assignment within the race (a handful of nominees, so exhaustive search is cheap).
        taken = {v[0] for k, v in chosen.items() if k in race.index}
        keys = list(options)
        best: tuple[int, dict] = (-1, {})

        def search(i: int, used: set[str], total: int, picked: dict) -> None:
            nonlocal best
            if i == len(keys):
                if total > best[0]:
                    best = (total, dict(picked))
                return
            idx = keys[i]
            for score, cid, method in options[idx]:
                if cid not in used:
                    picked[idx] = (cid, score, method)
                    search(i + 1, used | {cid}, total + score, picked)
                    del picked[idx]
            search(i + 1, used, total, picked)

        search(0, set(taken), 0, {})
        chosen.update(best[1])

    out = people.copy()
    out["fec_candidate_id"] = pd.Series({k: v[0] for k, v in chosen.items()}, dtype="object").reindex(out.index)
    out["match_score"] = pd.Series({k: v[1] for k, v in chosen.items()}, dtype="float64").reindex(out.index)
    out["match_method"] = pd.Series({k: v[2] for k, v in chosen.items()}, dtype="object").reindex(out.index)

    # One FEC id, one race: keep a doubly claimed id only where its district matches.
    district = dict(zip(candidates["CAND_ID"], candidates["CAND_OFFICE_DISTRICT"]))
    claimed = out[out["fec_candidate_id"].notna()]
    for cid, grp in claimed.groupby("fec_candidate_id"):
        if grp["race_id"].nunique() > 1:
            d = district.get(cid, "")
            keep = grp[(grp["chamber"] == "house") & (grp["district"] == (int(d) if d.isdigit() else -1))]
            drop = grp.index.difference(keep.index if len(keep) == 1 else [])
            out.loc[drop, ["fec_candidate_id", "match_method"]] = pd.NA
            out.loc[drop, "match_score"] = float("nan")
    out["fec_name"] = out["fec_candidate_id"].map(names)
    return out


def _matched_nominees(house: pd.DataFrame, senate: pd.DataFrame, refresh: bool) -> tuple[pd.DataFrame, pd.DataFrame]:
    candidates = _candidate_master(refresh)
    webl = _current_campaigns(refresh)
    people = match_candidates(nominees(house, senate), candidates, set(webl["CAND_ID"]))
    return people, webl


# ---------------------------------------------------------------- candidate money


def load_candidate_money(house: pd.DataFrame, senate: pd.DataFrame, refresh: bool = False) -> pd.DataFrame:
    """One row per nominee matched to an FEC candidate, with their campaign's totals for 2025-26.

    Totals run from Jan 1, 2025 to each campaign's latest processed report (coverage_end). Money columns
    are blank when the candidate is registered but the FEC has no processed report yet. Unmatched
    nominees are listed in df.attrs['unmatched'] (a list of dicts).
    """
    people, webl = _matched_nominees(house, senate, refresh)
    summary = _candidate_summary(refresh)
    record_source(
        "fec_candidates",
        name="Federal Election Commission: House and Senate current campaigns, candidate master and candidate summary (2025-2026)",
        url=BULK_PAGE,
        files="webl26.zip, cn26.zip, candidate_summary_2026.csv",
        license=FEC_TERMS,
    )

    money = pd.DataFrame({"fec_candidate_id": webl["CAND_ID"]})
    money["receipts"] = _money(webl["TTL_RECEIPTS"])
    money["disbursements"] = _money(webl["TTL_DISB"])
    money["cash_on_hand"] = _money(webl["COH_COP"])
    money["individual_contributions"] = _money(webl["TTL_INDIV_CONTRIB"])
    money["pac_contributions"] = _money(webl["OTHER_POL_CMTE_CONTRIB"])
    money["party_contributions"] = _money(webl["POL_PTY_CONTRIB"])
    money["candidate_self_funding"] = _money(webl["CAND_CONTRIB"]).fillna(0) + _money(webl["CAND_LOANS"]).fillna(0)
    money["debts"] = _money(webl["DEBTS_OWED_BY"])
    money["coverage_end"] = pd.to_datetime(webl["CVG_END_DT"], format="%m/%d/%Y", errors="coerce").dt.strftime("%Y-%m-%d")

    # Small-dollar money (unitemized: donors giving $200 or less) is only in the candidate summary file.
    # Use it only where that file agrees with webl on total individual contributions.
    small = pd.DataFrame({
        "fec_candidate_id": summary["Cand_Id"],
        "small_dollar_contributions": _money(summary["Individual_Unitemized_Contribution"]),
        "check": _money(summary["Individual_Contribution"]),
    }).drop_duplicates("fec_candidate_id")
    money = money.merge(small, on="fec_candidate_id", how="left")
    agrees = (money["check"] - money["individual_contributions"]).abs() < 0.01
    money["small_dollar_contributions"] = money["small_dollar_contributions"].where(agrees)
    money = money.drop(columns="check")

    matched = people[people["fec_candidate_id"].notna()].astype({"fec_candidate_id": str, "match_method": str})
    matched = matched.merge(money, on="fec_candidate_id", how="left")
    columns = [
        "race_id", "chamber", "party", "candidate", "fec_candidate_id", "fec_name",
        "receipts", "disbursements", "cash_on_hand", "individual_contributions", "small_dollar_contributions",
        "pac_contributions", "party_contributions", "candidate_self_funding", "debts", "coverage_end", "match_method",
    ]
    party_order = {"D": 0, "R": 1}
    out = (
        matched.assign(_p=matched["party"].map(party_order).fillna(2))
        .sort_values(["chamber", "race_id", "_p", "candidate"])[columns]
        .reset_index(drop=True)
    )
    unmatched = people[people["fec_candidate_id"].isna()]
    out.attrs["unmatched"] = unmatched[["race_id", "chamber", "party", "candidate", "rating_consensus"]].to_dict("records")
    return out


# ---------------------------------------------------------------- independent expenditures


def _latest_report_versions(ie: pd.DataFrame) -> pd.DataFrame:
    """Keep each report's most recent version: an amendment replaces the whole report it amends."""
    filings = ie.drop_duplicates("file_num")
    spender = dict(zip(filings["file_num"], filings["spe_id"]))
    parent = {
        f: p for f, p in zip(filings["file_num"], filings["prev_file_num"])
        if p and p != f and spender.get(p, spender[f]) == spender[f]
    }

    def root(f: str) -> str:
        seen = {f}
        while f in parent and parent[f] not in seen:
            f = parent[f]
            seen.add(f)
        return f

    report = ie["file_num"].map({f: root(f) for f in filings["file_num"]})
    number = pd.to_numeric(ie["file_num"])
    latest = number.groupby(report).transform("max")  # FEC filing numbers rise with time of receipt
    return ie[number == latest].assign(report=report)


def _ie_date(ie: pd.DataFrame) -> pd.Series:
    """Date the communication reached voters: dissemination date, else expenditure date, else the date
    the FEC received the report. Typo dates (before 2023 or more than a week after receipt) are skipped,
    and dates a filer gave in advance are capped at the receipt date, so no date lies in the future."""
    received = pd.to_datetime(ie["receipt_dat"], format="%d-%b-%y", errors="coerce")
    out = received.copy()
    for column in ("exp_date", "dissem_dt"):  # later assignment wins, so dissemination date has priority
        d = pd.to_datetime(ie[column], format="%d-%b-%y", errors="coerce")
        ok = d.notna() & (d >= pd.Timestamp("2023-01-01")) & (received.isna() | (d <= received + pd.Timedelta(days=7)))
        out = out.where(~ok, d)
    return out.where(received.isna() | (out <= received), received)


def independent_expenditures(refresh: bool = False) -> pd.DataFrame:
    """Every 2025-26 independent expenditure on a 24/48-hour report, de-duplicated (see module notes)."""
    path = _bulk("independent_expenditure_2026.csv", refresh)
    raw = pd.read_csv(io.StringIO(_decode(path.read_bytes())), dtype=str, keep_default_na=False)
    raw = raw.apply(lambda s: s.str.strip())
    stats = {"rows": len(raw)}

    ie = _latest_report_versions(raw)
    stats["superseded_by_amendments"] = len(raw) - len(ie)
    # The same line re-reported on a later report (same spender, transaction id and content).
    ie = ie.assign(_n=pd.to_numeric(ie["file_num"])).sort_values("_n")
    key = ["spe_id", "tran_id", "cand_id", "sup_opp", "exp_amo", "exp_date", "dissem_dt", "ele_type"]
    before = len(ie)
    ie = ie.drop_duplicates(key, keep="last").drop(columns="_n")
    stats["exact_rereports"] = before - len(ie)

    ie["amount"] = _money(ie["exp_amo"])
    junk = ie["amount"].isna() | (ie["amount"].abs() >= MAX_PLAUSIBLE_AMOUNT)
    stats["implausible_amounts"] = int(junk.sum())
    ie = ie[~junk].copy()
    ie["date"] = _ie_date(ie)
    stats["kept"] = len(ie)
    ie.attrs["stats"] = stats
    ie.attrs["as_of"] = pd.to_datetime(raw["receipt_dat"], format="%d-%b-%y", errors="coerce").max()
    return ie.reset_index(drop=True)


def _special_cutoffs(ie: pd.DataFrame) -> dict[str, pd.Timestamp]:
    """Last date of special-election spending (code S) in each House district before the fall campaign."""
    code = ie["ele_type"].str.upper().str[:1]
    s = ie[code.eq("S") & ie["can_office"].eq("H") & (ie["date"] < SPECIAL_SEASON_END)
           & ie["can_office_state"].isin(SEATS_BY_POSTAL) & ie["can_office_dis"].str.fullmatch(r"\d{1,2}")]
    races = [race_id(st, int(d)) for st, d in zip(s["can_office_state"], s["can_office_dis"])]
    return s.groupby(pd.Series(races, index=s.index))["date"].max().to_dict()


def _election(ie: pd.DataFrame, special_races: set[str], special_cutoff: dict[str, pd.Timestamp]) -> pd.Series:
    """'general', 'primary' (primaries, runoffs, conventions) or '' for anything else."""
    code = ie["ele_type"].str.upper().str[:1]
    after_2024 = ie["date"] > LAST_ELECTION_DAY
    general = code.eq("G")
    for race, primary in SPECIAL_PRIMARIES.items():
        if race in special_races:
            general |= ie["race_id"].eq(race) & code.isin(["S", "O"]) & (ie["date"] > pd.Timestamp(primary))
    # Coded G but dated during a special election for the same House seat: spending for the special.
    cutoff = pd.to_datetime(ie["race_id"].map(special_cutoff))
    general &= ~(ie["chamber"].eq("house") & cutoff.notna() & (ie["date"] <= cutoff))
    # A replaced nominee counts only while they were the nominee, and never toward primary_total.
    former = ie["former"].astype(bool)
    in_office = (ie["date"] >= pd.to_datetime(ie["former_from"])) & (ie["date"] <= pd.to_datetime(ie["former_to"]))
    general &= ~former | in_office
    out = pd.Series("", index=ie.index)
    out = out.mask(after_2024 & code.isin(["P", "R", "C"]) & ~former, "primary")
    return out.mask(after_2024 & general, "general")


def _with_former_nominees(people: pd.DataFrame) -> pd.DataFrame:
    """Add REPLACED_NOMINEES (for linking outside spending only) with the dates they were the nominee."""
    races = people.drop_duplicates("race_id").set_index("race_id")
    rows = [
        {**races.loc[race, ["chamber", "state", "district", "special", "rating_consensus"]].to_dict(),
         "race_id": race, "party": party, "candidate": name, "fec_candidate_id": cid, "match_method": "manual",
         "former": True, "former_from": start, "former_to": end}
        for race, party, name, cid, start, end in REPLACED_NOMINEES if race in races.index
    ]
    current = people.assign(former=False, former_from=None, former_to=None)
    return pd.concat([current, pd.DataFrame(rows)], ignore_index=True) if rows else current


def _aliases(people: pd.DataFrame, candidates: pd.DataFrame) -> dict[str, int]:
    """Other FEC ids of our nominees: same office and state, and the same principal campaign committee or
    exactly the same name and party (people registered more than once, e.g. Casey Askar's 2020 id)."""
    matched = people[people["fec_candidate_id"].notna()]
    own = dict(zip(matched["fec_candidate_id"], matched.index))
    c = candidates[candidates["CAND_OFFICE"].isin(["H", "S"])].drop_duplicates("CAND_ID").copy()
    c["name_key"] = c["CAND_NAME"].map(lambda s: " ".join(_tokens(_split_nicknames(s)[0])))
    groups: dict[tuple, set[str]] = {}
    for r in c.itertuples(index=False):
        place = (r.CAND_OFFICE, r.CAND_OFFICE_ST)
        if r.CAND_PCC:
            groups.setdefault(place + ("pcc", r.CAND_PCC), set()).add(r.CAND_ID)
        groups.setdefault(place + ("name", r.name_key, r.CAND_PTY_AFFILIATION), set()).add(r.CAND_ID)
    info = c.set_index("CAND_ID")
    out: dict[str, int] = {}
    conflicts: set[str] = set()
    for cid, idx in own.items():
        if cid not in info.index:
            continue
        r = info.loc[cid]
        place = (r["CAND_OFFICE"], r["CAND_OFFICE_ST"])
        same = set(groups.get(place + ("name", r["name_key"], r["CAND_PTY_AFFILIATION"]), set()))
        if r["CAND_PCC"]:
            same |= groups.get(place + ("pcc", r["CAND_PCC"]), set())
        for other in same - set(own):
            if out.get(other, idx) != idx:
                conflicts.add(other)
            out[other] = idx
    return {k: v for k, v in out.items() if k not in conflicts}


def _assign_races(ie: pd.DataFrame, people: pd.DataFrame, candidates: pd.DataFrame) -> pd.DataFrame:
    """Link each expenditure to one of our nominees: by FEC candidate id (or another id of the same person),
    or, when the filer left the id blank or used one that is not a candidate for that office, by state,
    office and name."""
    matched = people[people["fec_candidate_id"].notna()]
    own = dict(zip(matched["fec_candidate_id"], matched.index))
    aliases = _aliases(people, candidates)
    ie = ie.copy()
    hit = ie["cand_id"].isin(own) | ie["cand_id"].isin(aliases)
    idx = pd.Series(pd.NA, index=ie.index, dtype="object")
    idx[hit] = ie.loc[hit, "cand_id"].map({**aliases, **own})
    by_alias = int(ie["cand_id"].isin(aliases).sum())

    office_of = dict(zip(candidates["CAND_ID"], candidates["CAND_OFFICE"]))
    known_office = ie["cand_id"].map(office_of)
    fallback = ~hit & ie["can_office"].isin(["H", "S"]) & (known_office.isna() | (known_office != ie["can_office"]))
    # Our name for each nominee and, when matched, the FEC's ('Jon Ossoff' and 'OSSOFF, T. JONATHAN').
    parsed_people = {
        i: [parse_name(n, fec_style=False)] + ([parse_name(f, fec_style=True)] if isinstance(f, str) and f else [])
        for i, n, f in zip(people.index, people["candidate"], people.get("fec_name", pd.Series(index=people.index)))
    }
    groups = {k: list(g.index) for k, g in people.groupby([people["state"], people["chamber"]])}
    cache: dict[tuple, object] = {}
    for i, row in ie[fallback].iterrows():
        chamber = "senate" if row["can_office"] == "S" else "house"
        key = (row["can_office_state"], chamber, row["cand_name"], row["cand_pty_aff"], row["can_office_dis"])
        if key not in cache:
            fec = parse_name(row["cand_name"], fec_style=True)
            party = party_code(row["cand_pty_aff"]) if row["cand_pty_aff"] else ""
            scored = []
            for p in groups.get((row["can_office_state"], chamber), []):
                if party and party != people.at[p, "party"]:
                    continue
                fits = [s[0] for s in (name_score(name, fec) for name in parsed_people[p]) if s is not None]
                if fits:
                    bonus = 3 if chamber == "house" and row["can_office_dis"].isdigit() and int(row["can_office_dis"]) == people.at[p, "district"] else 0
                    scored.append((max(fits) + bonus, p))
            scored.sort(reverse=True)
            unique = scored and (len(scored) == 1 or scored[0][0] > scored[1][0])
            cache[key] = scored[0][1] if unique else pd.NA
        idx[i] = cache[key]
    ie["nominee"] = idx
    ie.attrs.update(by_name=int(ie.loc[fallback, "nominee"].notna().sum()), by_alias=by_alias)
    return ie


def load_outside_spending(house: pd.DataFrame, senate: pd.DataFrame, refresh: bool = False) -> tuple[pd.DataFrame, pd.DataFrame]:
    """General-election independent expenditures for or against our nominees, by race and by spender.

    by_race: support/oppose totals for each side, pro_dem (support D + oppose R), pro_rep (support R +
    oppose D), spending in the last 30 days, the latest date, and primary_total (primaries and runoffs,
    not included in the other columns). Expenditures about other nominees (independents) are in
    support_other / oppose_other and included in total.
    by_spender: one row per race, spender, nominee and support/oppose.
    """
    people, _ = _matched_nominees(house, senate, refresh)
    candidates = _candidate_master(refresh)
    committees = _committees(refresh)
    ie = independent_expenditures(refresh)
    stats, as_of = dict(ie.attrs["stats"]), ie.attrs["as_of"]
    record_source(
        "fec_independent_expenditures",
        name="Federal Election Commission: independent expenditures from 24- and 48-hour reports (2025-2026)",
        url=BULK + "independent_expenditure_2026.csv",
        license=FEC_TERMS,
        as_of=as_of.date().isoformat() if pd.notna(as_of) else "",
    )

    special_cutoff = _special_cutoffs(ie)
    people = _with_former_nominees(people)
    ie = _assign_races(ie, people, candidates)
    stats["linked_by_other_id"] = ie.attrs["by_alias"]
    stats["linked_by_name"] = ie.attrs["by_name"]
    ie = ie[ie["nominee"].notna()].copy()
    nominee = people.loc[ie["nominee"].astype(int)]
    for column in ("race_id", "chamber", "party", "candidate", "fec_candidate_id", "former", "former_from", "former_to"):
        ie[column] = nominee[column].to_numpy()
    special_races = set(people.loc[people["special"].astype(bool), "race_id"])
    ie["election"] = _election(ie, special_races, special_cutoff)
    ie["support_oppose"] = ie["sup_opp"].str.upper().str[:1]
    bad_so = ~ie["support_oppose"].isin(["S", "O"])
    stats["missing_support_oppose"] = int(bad_so.sum())
    ie = ie[~bad_so]

    primary = ie[ie["election"] == "primary"].groupby("race_id")["amount"].sum()
    gen = ie[ie["election"] == "general"].copy()
    stats["general_rows"] = len(gen)
    window_start = as_of - pd.Timedelta(days=29)  # 30 days including the as-of date
    gen["last_30"] = gen["amount"].where(gen["date"] >= window_start, 0.0)
    side = gen["party"].where(gen["party"].isin(["D", "R"]), "other").map({"D": "dem", "R": "rep", "other": "other"})
    gen["column"] = gen["support_oppose"].map({"S": "support_", "O": "oppose_"}) + side

    by_race = gen.pivot_table(index=["race_id", "chamber"], columns="column", values="amount", aggfunc="sum", fill_value=0.0)
    columns = ["support_dem", "oppose_dem", "support_rep", "oppose_rep", "support_other", "oppose_other"]
    by_race = by_race.reindex(columns=columns, fill_value=0.0).reset_index()
    by_race.columns.name = None
    by_race["pro_dem"] = by_race["support_dem"] + by_race["oppose_rep"]
    by_race["pro_rep"] = by_race["support_rep"] + by_race["oppose_dem"]
    by_race["total"] = by_race[columns].sum(axis=1)
    g = gen.groupby("race_id")
    pro = gen.assign(
        _d=gen["last_30"].where(gen["column"].isin(["support_dem", "oppose_rep"]), 0.0),
        _r=gen["last_30"].where(gen["column"].isin(["support_rep", "oppose_dem"]), 0.0),
    ).groupby("race_id")
    by_race = by_race.merge(
        pd.DataFrame({
            "last_30_days_total": g["last_30"].sum(),
            "last_30_days_pro_dem": pro["_d"].sum(),
            "last_30_days_pro_rep": pro["_r"].sum(),
            "latest_expenditure_date": g["date"].max().dt.strftime("%Y-%m-%d"),
            "spenders": g["spe_id"].nunique(),
        }).reset_index(),
        on="race_id", how="left",
    )
    # Races with only primary spending still get a row, with zeros for the general election.
    primary_only = sorted(set(primary.index) - set(by_race["race_id"]))
    if primary_only:
        chamber_of = dict(zip(people["race_id"], people["chamber"]))
        extra = pd.DataFrame({"race_id": primary_only, "chamber": [chamber_of[r] for r in primary_only]})
        by_race = pd.concat([by_race, extra], ignore_index=True)
    by_race["primary_total"] = by_race["race_id"].map(primary).fillna(0.0)
    money_cols = columns + ["pro_dem", "pro_rep", "total", "last_30_days_total", "last_30_days_pro_dem",
                            "last_30_days_pro_rep", "primary_total"]
    by_race[money_cols] = by_race[money_cols].fillna(0.0).round(2)
    by_race["spenders"] = by_race["spenders"].fillna(0).astype(int)
    by_race = by_race[["race_id", "chamber", "support_dem", "oppose_dem", "support_rep", "oppose_rep", "pro_dem",
                       "pro_rep", "total", "last_30_days_total", "latest_expenditure_date", "support_other",
                       "oppose_other", "last_30_days_pro_dem", "last_30_days_pro_rep", "spenders", "primary_total"]]
    by_race = by_race.sort_values(["total", "primary_total"], ascending=False).reset_index(drop=True)

    cm = committees.set_index("CMTE_ID")
    latest_name = gen.sort_values("date").groupby("spe_id")["spe_nam"].last()
    keys = ["race_id", "chamber", "spe_id", "support_oppose", "party", "candidate", "fec_candidate_id", "former"]
    by_spender = gen.groupby(keys).agg(
        amount=("amount", "sum"), last_30_days=("last_30", "sum"), latest_date=("date", "max"), transactions=("amount", "size")
    ).reset_index()
    by_spender = by_spender.rename(columns={"spe_id": "spender_id", "party": "candidate_party", "former": "former_nominee"})
    by_spender["spender"] = by_spender["spender_id"].map(cm["CMTE_NM"]).where(lambda s: s.fillna("") != "", by_spender["spender_id"].map(latest_name))
    by_spender["spender_type"] = by_spender["spender_id"].map(cm["CMTE_TP"]).map(SPENDER_TYPES).fillna("Other")
    by_spender["latest_date"] = by_spender["latest_date"].dt.strftime("%Y-%m-%d")
    by_spender[["amount", "last_30_days"]] = by_spender[["amount", "last_30_days"]].round(2)
    by_spender = by_spender[["race_id", "chamber", "spender", "spender_id", "support_oppose", "candidate_party", "amount",
                             "latest_date", "candidate", "fec_candidate_id", "former_nominee", "spender_type",
                             "last_30_days", "transactions"]]
    by_spender = by_spender.sort_values(["race_id", "amount"], ascending=[True, False]).reset_index(drop=True)

    stats["as_of"] = as_of.date().isoformat() if pd.notna(as_of) else ""
    by_race.attrs["stats"] = stats
    return by_race, by_spender


# ---------------------------------------------------------------- self-test

if __name__ == "__main__":
    import sys

    from common import CLEAN

    pd.set_option("display.width", 200)
    pd.set_option("display.max_columns", 30)
    pd.set_option("display.max_colwidth", 40)
    refresh = "--refresh" in sys.argv
    house = pd.read_csv(CLEAN / "races_house_2026.csv")
    senate = pd.read_csv(CLEAN / "races_senate_2026.csv")

    money = load_candidate_money(house, senate, refresh=refresh)
    unmatched = pd.DataFrame(money.attrs["unmatched"], columns=["race_id", "chamber", "party", "candidate", "rating_consensus"])
    everyone = nominees(house, senate)
    print(f"Nominees: {len(everyone)}; matched to the FEC: {len(money)} ({len(money) / len(everyone):.1%})")
    for chamber in ("house", "senate"):
        for label, parties in (("D/R", ["D", "R"]), ("other", ["I", "L", "G", "O"])):
            n_all = int((everyone["chamber"].eq(chamber) & everyone["party"].isin(parties)).sum())
            hit = money[money["chamber"].eq(chamber) & money["party"].isin(parties)]
            print(f"  {chamber} {label}: {len(hit)}/{n_all} matched ({len(hit) / max(n_all, 1):.1%}); "
                  f"with FEC financial reports {int(hit['receipts'].notna().sum())}")
    print("  match methods:", money["match_method"].value_counts().to_dict())
    print("  coverage_end (latest report) counts:", money["coverage_end"].value_counts().head(6).to_dict())
    competitive = unmatched[~unmatched["rating_consensus"].fillna("").str.startswith("Safe")]
    print(f"Unmatched nominees: {len(unmatched)} ({unmatched['party'].value_counts().to_dict()}); "
          f"in competitive races: {len(competitive)}, of them Democrats or Republicans: "
          f"{int(competitive['party'].isin(['D', 'R']).sum())}")
    for r in competitive.itertuples():
        print(f"  {r.race_id:6} {r.party} {r.candidate} ({r.rating_consensus})")
    rating = dict(zip(everyone["race_id"], everyone["rating_consensus"].fillna("")))
    no_reports = money[money["receipts"].isna() & money["party"].isin(["D", "R"])]
    close = [f"{r.race_id} {r.candidate}" for r in no_reports.itertuples() if not rating.get(r.race_id, "").startswith("Safe")]
    print(f"Matched D/R nominees with no processed FEC report yet: {len(no_reports)}; "
          f"in competitive races: {', '.join(close) or 'none'}")
    print("Fuzzy matches (check by hand):")
    for r in money[money["match_method"] == "fuzzy"].itertuples():
        print(f"  {r.race_id:6} {r.party} {r.candidate!r:32} -> {r.fec_name} [{r.fec_candidate_id}]")

    print("Spot values (Senate):")
    for race in ("TX-SEN", "OH-SEN", "NC-SEN", "ME-SEN", "AK-SEN"):
        for r in money[money["race_id"] == race].itertuples():
            print(f"  {r.race_id} {r.party} {r.candidate:20} {r.fec_candidate_id} receipts ${r.receipts:,.0f} "
                  f"cash ${r.cash_on_hand:,.0f} through {r.coverage_end}")

    by_race, by_spender = load_outside_spending(house, senate, refresh=refresh)
    stats = by_race.attrs["stats"]
    print("Independent expenditures:", stats)
    print(f"Races with general-election outside spending: {(by_race['total'] != 0).sum()} "
          f"(house {((by_race['total'] != 0) & (by_race['chamber'] == 'house')).sum()}, "
          f"senate {((by_race['total'] != 0) & (by_race['chamber'] == 'senate')).sum()}); "
          f"total ${by_race['total'].sum():,.0f}; pro-D ${by_race['pro_dem'].sum():,.0f}; "
          f"pro-R ${by_race['pro_rep'].sum():,.0f}; last 30 days ${by_race['last_30_days_total'].sum():,.0f}; "
          f"primary ${by_race['primary_total'].sum():,.0f}")
    print("Top 10 races by general-election outside spending:")
    top = by_race.head(10).copy()
    for c in ("pro_dem", "pro_rep", "total", "last_30_days_total"):
        top[c] = top[c].map(lambda v: f"${v / 1e6:,.1f}M")
    print(top[["race_id", "pro_dem", "pro_rep", "total", "last_30_days_total", "latest_expenditure_date", "spenders"]].to_string(index=False))
    print("Top spenders in the top race:")
    first = by_race.iloc[0]["race_id"]
    print(by_spender[by_spender["race_id"] == first].head(8)[["spender", "spender_type", "support_oppose", "candidate", "amount", "latest_date"]].to_string(index=False))
    check = by_spender.groupby("race_id")["amount"].sum().reindex(by_race["race_id"]).fillna(0).round(2)
    print("by_spender sums equal by_race totals:", bool((check.to_numpy() - by_race["total"].to_numpy() < 0.05).all()))
