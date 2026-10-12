"""Build every dataset in data/clean, then validate it.

Usage (from the repo root):
    .venv/Scripts/python pipeline/run.py            # reuse earlier downloads in data/raw
    .venv/Scripts/python pipeline/run.py --refresh  # download everything again
    .venv/Scripts/python pipeline/run.py --refresh fec,wikipedia  # only the sources that change daily
"""

from __future__ import annotations

import argparse
import sys

import common
from build_races import build_races
from extras import build_extras
from hexmap import build_hexmap
from medsl import build_house_history
import validate


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--refresh",
        nargs="?",
        const="all",
        default="",
        metavar="GROUPS",
        help="download sources again: all of them, or a comma-separated list of data/raw folders (fec,wikipedia)",
    )
    args = parser.parse_args()
    groups = {g.strip() for g in args.refresh.split(",") if g.strip()}
    args.refresh = "all" in groups
    if not args.refresh:
        common.REFRESH_GROUPS.update(groups)

    print("Building hex map ...")
    build_hexmap(args.refresh)
    print("Building House history ...")
    build_house_history(args.refresh)
    print("Building races and ratings ...")
    meta = build_races(args.refresh)
    print(f"  national 2024 margin {meta['national_2024']['margin']:+.2f}, counts {meta['counts']}")
    print("Building polling average, Senate composition, 2024 lines and money ...")
    build_extras(args.refresh)
    print("Validating ...")
    return validate.main()


if __name__ == "__main__":
    sys.exit(main())
