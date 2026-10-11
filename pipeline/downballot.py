"""2020 and 2024 presidential results for every House district used in 2026, from The Downballot."""

from __future__ import annotations

import pandas as pd

from common import RAW, fetch, record_source
from states import SEATS_BY_POSTAL

SHEET = "1eZfaFI-c-PFOoKx1-zZA2MP0_dxRq_LVK0re3BOQqy0"
VOTE_TOTALS_GID = "1491069057"
PAGE = "https://the-db.co/presbycd"

COLUMNS = {
    0: "race_id",
    1: "incumbent",
    2: "incumbent_party",
    4: "harris_24",
    5: "trump_24",
    6: "total_24",
    11: "biden_20",
    12: "trump_20",
    13: "total_20",
}


def _votes(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series.astype("string").str.replace(",", "", regex=False), errors="coerce").astype("Int64")


def load_presidential(refresh: bool = False) -> pd.DataFrame:
    path = fetch(
        f"https://docs.google.com/spreadsheets/d/{SHEET}/export",
        RAW / "downballot" / "presidential_by_district_2026.csv",
        refresh=refresh,
        params={"format": "csv", "gid": VOTE_TOTALS_GID},
    )
    record_source(
        "downballot_presidential",
        name="The Downballot: 2020 & 2024 presidential results for congressional districts used in the 2026 elections",
        url=PAGE,
        license="Free to use with credit to The Downballot",
    )

    raw = pd.read_csv(path, header=None, dtype="string")
    df = raw[list(COLUMNS)].rename(columns=COLUMNS)
    df = df[df["race_id"].str.fullmatch(r"[A-Z]{2}-(\d{2}|AL)", na=False)].copy()

    df["state"] = df["race_id"].str[:2]
    df["district"] = df["race_id"].str[3:].replace("AL", "0").astype(int)
    df["incumbent_party"] = df["incumbent_party"].str.strip("()").str.strip()
    for col in ("harris_24", "trump_24", "total_24", "biden_20", "trump_20", "total_20"):
        df[col] = _votes(df[col])

    unknown = set(df["state"]) - set(SEATS_BY_POSTAL)
    if unknown:
        raise ValueError(f"Unexpected states in Downballot sheet: {sorted(unknown)}")
    return df.reset_index(drop=True)
