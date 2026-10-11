"""The 50 states: postal code, name, FIPS code and House seats (2020 apportionment)."""

from __future__ import annotations

# (postal, name, fips, house_seats)
STATES = [
    ("AL", "Alabama", "01", 7),
    ("AK", "Alaska", "02", 1),
    ("AZ", "Arizona", "04", 9),
    ("AR", "Arkansas", "05", 4),
    ("CA", "California", "06", 52),
    ("CO", "Colorado", "08", 8),
    ("CT", "Connecticut", "09", 5),
    ("DE", "Delaware", "10", 1),
    ("FL", "Florida", "12", 28),
    ("GA", "Georgia", "13", 14),
    ("HI", "Hawaii", "15", 2),
    ("ID", "Idaho", "16", 2),
    ("IL", "Illinois", "17", 17),
    ("IN", "Indiana", "18", 9),
    ("IA", "Iowa", "19", 4),
    ("KS", "Kansas", "20", 4),
    ("KY", "Kentucky", "21", 6),
    ("LA", "Louisiana", "22", 6),
    ("ME", "Maine", "23", 2),
    ("MD", "Maryland", "24", 8),
    ("MA", "Massachusetts", "25", 9),
    ("MI", "Michigan", "26", 13),
    ("MN", "Minnesota", "27", 8),
    ("MS", "Mississippi", "28", 4),
    ("MO", "Missouri", "29", 8),
    ("MT", "Montana", "30", 2),
    ("NE", "Nebraska", "31", 3),
    ("NV", "Nevada", "32", 4),
    ("NH", "New Hampshire", "33", 2),
    ("NJ", "New Jersey", "34", 12),
    ("NM", "New Mexico", "35", 3),
    ("NY", "New York", "36", 26),
    ("NC", "North Carolina", "37", 14),
    ("ND", "North Dakota", "38", 1),
    ("OH", "Ohio", "39", 15),
    ("OK", "Oklahoma", "40", 5),
    ("OR", "Oregon", "41", 6),
    ("PA", "Pennsylvania", "42", 17),
    ("RI", "Rhode Island", "44", 2),
    ("SC", "South Carolina", "45", 7),
    ("SD", "South Dakota", "46", 1),
    ("TN", "Tennessee", "47", 9),
    ("TX", "Texas", "48", 38),
    ("UT", "Utah", "49", 4),
    ("VT", "Vermont", "50", 1),
    ("VA", "Virginia", "51", 11),
    ("WA", "Washington", "53", 10),
    ("WV", "West Virginia", "54", 2),
    ("WI", "Wisconsin", "55", 8),
    ("WY", "Wyoming", "56", 1),
]

POSTAL_BY_NAME = {name: postal for postal, name, _, _ in STATES}
NAME_BY_POSTAL = {postal: name for postal, name, _, _ in STATES}
SEATS_BY_POSTAL = {postal: seats for postal, _, _, seats in STATES}

# States voting on new congressional maps in 2026. Missouri also passed one,
# but the US Supreme Court ruled it must use its 2024 map.
REDRAWN_2026 = {"AL", "CA", "FL", "LA", "NC", "OH", "TN", "TX", "UT"}

# States that elect members of Congress by ranked-choice voting.
RANKED_CHOICE = {"AK", "ME"}

# States whose general election can pit two candidates of the same party (top-two primaries).
TOP_TWO = {"CA", "WA"}


def race_id(postal: str, district: int) -> str:
    """House race id: 'PA-07', or 'AK-AL' for an at-large seat."""
    return f"{postal}-AL" if SEATS_BY_POSTAL[postal] == 1 else f"{postal}-{district:02d}"


assert sum(SEATS_BY_POSTAL.values()) == 435
