// The 50 states with their House seats (2020 apportionment). Mirrors pipeline/states.py.

export interface StateInfo {
  postal: string;
  name: string;
  seats: number;
  /** Position on the standard 11 x 8 tile-grid map of the US. */
  tile: [col: number, row: number];
}

export const STATES: StateInfo[] = [
  { postal: "AK", name: "Alaska", seats: 1, tile: [0, 0] },
  { postal: "ME", name: "Maine", seats: 2, tile: [10, 0] },
  { postal: "VT", name: "Vermont", seats: 1, tile: [9, 1] },
  { postal: "NH", name: "New Hampshire", seats: 2, tile: [10, 1] },
  { postal: "WA", name: "Washington", seats: 10, tile: [0, 2] },
  { postal: "ID", name: "Idaho", seats: 2, tile: [1, 2] },
  { postal: "MT", name: "Montana", seats: 2, tile: [2, 2] },
  { postal: "ND", name: "North Dakota", seats: 1, tile: [3, 2] },
  { postal: "MN", name: "Minnesota", seats: 8, tile: [4, 2] },
  { postal: "IL", name: "Illinois", seats: 17, tile: [5, 2] },
  { postal: "WI", name: "Wisconsin", seats: 8, tile: [6, 2] },
  { postal: "MI", name: "Michigan", seats: 13, tile: [7, 2] },
  { postal: "NY", name: "New York", seats: 26, tile: [8, 2] },
  { postal: "RI", name: "Rhode Island", seats: 2, tile: [9, 2] },
  { postal: "MA", name: "Massachusetts", seats: 9, tile: [10, 2] },
  { postal: "OR", name: "Oregon", seats: 6, tile: [0, 3] },
  { postal: "NV", name: "Nevada", seats: 4, tile: [1, 3] },
  { postal: "WY", name: "Wyoming", seats: 1, tile: [2, 3] },
  { postal: "SD", name: "South Dakota", seats: 1, tile: [3, 3] },
  { postal: "IA", name: "Iowa", seats: 4, tile: [4, 3] },
  { postal: "IN", name: "Indiana", seats: 9, tile: [5, 3] },
  { postal: "OH", name: "Ohio", seats: 15, tile: [6, 3] },
  { postal: "PA", name: "Pennsylvania", seats: 17, tile: [7, 3] },
  { postal: "NJ", name: "New Jersey", seats: 12, tile: [8, 3] },
  { postal: "CT", name: "Connecticut", seats: 5, tile: [9, 3] },
  { postal: "CA", name: "California", seats: 52, tile: [0, 4] },
  { postal: "UT", name: "Utah", seats: 4, tile: [1, 4] },
  { postal: "CO", name: "Colorado", seats: 8, tile: [2, 4] },
  { postal: "NE", name: "Nebraska", seats: 3, tile: [3, 4] },
  { postal: "MO", name: "Missouri", seats: 8, tile: [4, 4] },
  { postal: "KY", name: "Kentucky", seats: 6, tile: [5, 4] },
  { postal: "WV", name: "West Virginia", seats: 2, tile: [6, 4] },
  { postal: "VA", name: "Virginia", seats: 11, tile: [7, 4] },
  { postal: "MD", name: "Maryland", seats: 8, tile: [8, 4] },
  { postal: "DE", name: "Delaware", seats: 1, tile: [9, 4] },
  { postal: "AZ", name: "Arizona", seats: 9, tile: [1, 5] },
  { postal: "NM", name: "New Mexico", seats: 3, tile: [2, 5] },
  { postal: "KS", name: "Kansas", seats: 4, tile: [3, 5] },
  { postal: "AR", name: "Arkansas", seats: 4, tile: [4, 5] },
  { postal: "TN", name: "Tennessee", seats: 9, tile: [5, 5] },
  { postal: "NC", name: "North Carolina", seats: 14, tile: [6, 5] },
  { postal: "SC", name: "South Carolina", seats: 7, tile: [7, 5] },
  { postal: "OK", name: "Oklahoma", seats: 5, tile: [3, 6] },
  { postal: "LA", name: "Louisiana", seats: 6, tile: [4, 6] },
  { postal: "MS", name: "Mississippi", seats: 4, tile: [5, 6] },
  { postal: "AL", name: "Alabama", seats: 7, tile: [6, 6] },
  { postal: "GA", name: "Georgia", seats: 14, tile: [7, 6] },
  { postal: "HI", name: "Hawaii", seats: 2, tile: [0, 7] },
  { postal: "TX", name: "Texas", seats: 38, tile: [3, 7] },
  { postal: "FL", name: "Florida", seats: 28, tile: [8, 7] },
];

export const STATE_BY_POSTAL: Record<string, StateInfo> = Object.fromEntries(STATES.map((s) => [s.postal, s]));

/** States voting on new congressional maps in 2026 (Missouri's new map was blocked). */
export const REDRAWN_2026 = ["AL", "CA", "FL", "LA", "NC", "OH", "TN", "TX", "UT"];

export const HOUSE_SEATS = 435;
export const HOUSE_MAJORITY = 218;
export const SENATE_SEATS = 100;
export const ELECTION_DAY = "2026-11-03";
