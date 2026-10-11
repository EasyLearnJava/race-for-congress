"""Build every dataset in data/clean, then validate it.

Usage (from the repo root):
    .venv/Scripts/python pipeline/run.py            # reuse earlier downloads in data/raw
    .venv/Scripts/python pipeline/run.py --refresh  # download everything again
"""

from __future__ import annotations

import argparse
import sys

from build_races import build_races
from extras import build_extras
from hexmap import build_hexmap
from medsl import build_house_history
import validate


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--refresh", action="store_true", help="download every source again")
    args = parser.parse_args()

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
