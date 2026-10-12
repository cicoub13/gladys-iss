// -----------------------------------------------------------------------------
// The house the passes are computed for.
//
// The user picks it in the configuration (`house`, a `source: "houses"` select:
// the stored value is the house selector, the identifier getHouses() returns).
// Nothing chosen (installs that predate the field), or a choice gone stale
// (house deleted, location removed), falls back to the first located house:
// what the integration always did, so existing installs need no action.
// -----------------------------------------------------------------------------

const isLocated = (house) => house.latitude != null && house.longitude != null;

/**
 * Pick the house to compute the passes for.
 * @param {Array<{selector: string, latitude: number|null, longitude: number|null}>} houses - getHouses() result.
 * @param {string|null} selector - The house chosen in the configuration, if any.
 * @returns {object|null} The chosen located house, else the first located one, else null.
 * @example
 * selectHouse(await gladys.getHouses(), config.house);
 */
export function selectHouse(houses, selector) {
  const located = houses.filter(isLocated);
  const chosen = selector ? located.find((house) => house.selector === selector) : undefined;
  return chosen ?? located[0] ?? null;
}

/**
 * Fetch the houses and return the coordinates of the one to use.
 * @param {() => Promise<object[]>} getHouses - gladys.getHouses (needs `location: true`).
 * @param {string|null} selector - The house chosen in the configuration, if any.
 * @param {{warn: Function}} logger - Told when the chosen house cannot be used.
 * @returns {Promise<{latitude: number, longitude: number}>} The observer coordinates.
 * @example
 * await fetchHouse(() => gladys.getHouses(), config.house, logger);
 */
export async function fetchHouse(getHouses, selector, logger) {
  const house = selectHouse(await getHouses(), selector);
  if (!house) {
    throw new Error('No house with a known location');
  }
  if (selector && house.selector !== selector) {
    logger.warn(`The chosen house "${selector}" is unknown or has no location, using "${house.selector}" instead`);
  }
  return { latitude: house.latitude, longitude: house.longitude };
}

/**
 * Re-fetch the house after a configuration change, keeping the current one when
 * that fails: the other settings of the update must still apply.
 * @param {{current: object|null, getHouses: () => Promise<object[]>, selector: string|null, logger: {warn: Function, error: Function}}} options - Current house and fetch inputs.
 * @returns {Promise<{latitude: number, longitude: number}|null>} The house to use from now on.
 * @example
 * house = await refreshHouse({ current: house, getHouses: () => gladys.getHouses(), selector: config.house, logger });
 */
export async function refreshHouse({ current, getHouses, selector, logger }) {
  try {
    return await fetchHouse(getHouses, selector, logger);
  } catch (err) {
    logger.error('Could not read the house after a configuration change, keeping the previous one', err);
    return current;
  }
}
