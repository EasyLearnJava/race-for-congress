// Canonical URLs. Paths are lowercase: /house/pa-07, /senate/tx, /states/tx.

export const houseHref = (id: string) => `/house/${id.toLowerCase()}`;
export const senateHref = (postal: string) => `/senate/${postal.slice(0, 2).toLowerCase()}`;
export const stateHref = (postal: string) => `/states/${postal.toLowerCase()}`;

/** The race page for any race id: "PA-07" (House) or "TX-SEN" (Senate). */
export const raceHref = (id: string) => (id.endsWith("-SEN") ? senateHref(id) : houseHref(id));

/** Explorer filtered to a set of districts. */
export const explorerHref = (ids: string[]) => `/house?ids=${ids.join(",")}`;
