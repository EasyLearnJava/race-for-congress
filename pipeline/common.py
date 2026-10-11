"""Shared helpers for the data pipeline: paths, downloads, provenance and Wikipedia access."""

from __future__ import annotations

import json
import re
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path

import requests
import truststore
from lxml import html as lxml_html

# Use the operating system's certificate store so HTTPS works behind antivirus
# or company proxies that inspect traffic (Python's bundled certificates don't).
truststore.inject_into_ssl()

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CLEAN = ROOT / "data" / "clean"
SOURCES_FILE = RAW / "sources.json"

USER_AGENT = "race-for-congress-pipeline/0.1 (https://github.com/EasyLearnJava/race-for-congress)"
WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"

session = requests.Session()
session.headers["User-Agent"] = USER_AGENT


def today() -> str:
    return datetime.now(UTC).date().isoformat()


def fetch(url: str, dest: Path, *, refresh: bool = False, params: dict | None = None) -> Path:
    """Download url to dest, reusing an earlier download unless refresh is set."""
    if dest.exists() and not refresh:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    response = session.get(url, params=params, timeout=180)
    response.raise_for_status()
    dest.write_bytes(response.content)
    return dest


def record_source(key: str, **meta: str | int) -> None:
    """Remember where a dataset came from; build_races.py copies this into data/clean/meta.json."""
    sources = json.loads(SOURCES_FILE.read_text("utf-8")) if SOURCES_FILE.exists() else {}
    sources[key] = {"retrieved": today(), **meta}
    SOURCES_FILE.parent.mkdir(parents=True, exist_ok=True)
    SOURCES_FILE.write_text(json.dumps(sources, indent=2, sort_keys=True), "utf-8")


def load_sources() -> dict:
    return json.loads(SOURCES_FILE.read_text("utf-8")) if SOURCES_FILE.exists() else {}


def wikipedia_page(title: str, *, refresh: bool = False) -> tuple[lxml_html.HtmlElement, int]:
    """Return the parsed HTML of a Wikipedia article and the revision it came from."""
    dest = RAW / "wikipedia" / f"{title}.json"
    fetch(
        WIKIPEDIA_API,
        dest,
        refresh=refresh,
        params={
            "action": "parse",
            "page": title,
            "prop": "text|revid",
            "format": "json",
            "formatversion": 2,
        },
    )
    parsed = json.loads(dest.read_text("utf-8"))["parse"]
    return lxml_html.fromstring(parsed["text"]), parsed["revid"]


def tables_by_heading(doc: lxml_html.HtmlElement, level: int = 2) -> dict[str, list]:
    """Group every wikitable in an article under the nearest heading of the given level."""
    groups: dict[str, list] = {}
    current = None
    for el in doc.iter("h2", "h3", "h4", "table"):
        if el.tag == f"h{level}":
            current = re.sub(r"\[\s*edit\s*\]", "", " ".join(el.text_content().split())).strip()
            groups.setdefault(current, [])
        elif el.tag == "table" and current and "wikitable" in (el.get("class") or ""):
            groups[current].append(el)
    return groups


def table_grid(table) -> list[list]:
    """Expand a wikitable into a rectangular grid of cells, repeating row- and colspans."""
    grid: list[list] = []
    pending: dict[int, tuple[object, int]] = {}  # column -> (cell, rows still to fill)
    for tr in table.xpath("./tr|./tbody/tr|./thead/tr"):
        row: list = []
        cells = iter(tr.xpath("./th|./td"))
        col = 0
        while True:
            if col in pending:
                cell, left = pending[col]
                row.append(cell)
                if left > 1:
                    pending[col] = (cell, left - 1)
                else:
                    del pending[col]
                col += 1
                continue
            cell = next(cells, None)
            if cell is None:
                break
            rowspan = int(cell.get("rowspan", "1") or 1)
            colspan = int(cell.get("colspan", "1") or 1)
            for offset in range(colspan):
                row.append(cell)
                if rowspan > 1:
                    pending[col + offset] = (cell, rowspan - 1)
            col += colspan
        grid.append(row)
    return grid


def cell_text(cell) -> str:
    """Visible text of a table cell, without footnote markers, styles or hidden sort keys."""
    cell = deepcopy(cell)
    for junk in cell.xpath(".//sup[contains(@class,'reference')]|.//style|.//*[contains(@style,'display:none')]"):
        junk.drop_tree()
    for br in cell.iter("br"):
        br.tail = " " + (br.tail or "")
    return " ".join(cell.text_content().replace("▌", " ").split())
