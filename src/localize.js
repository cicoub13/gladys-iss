// -----------------------------------------------------------------------------
// Human-readable pass values for the scene trigger variables and the scene
// action outputs.
//
// Unlike a widget request, a scene hands the integration no language: event
// data and action outputs are flat scalars, never `{ en, fr }` objects. So
// the language is a configuration choice, and these values are ready to drop
// into a notification or a text-to-speech message as they are. Dates and
// times use the process time zone (the `TZ` Gladys injects).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr'];

const DIRECTION_NAMES = {
  en: {
    N: 'north',
    NE: 'north-east',
    E: 'east',
    SE: 'south-east',
    S: 'south',
    SW: 'south-west',
    W: 'west',
    NW: 'north-west',
  },
  fr: {
    N: 'nord',
    NE: 'nord-est',
    E: 'est',
    SE: 'sud-est',
    S: 'sud',
    SW: 'sud-ouest',
    W: 'ouest',
    NW: 'nord-ouest',
  },
};

// Compact compass points for the widget rows, as the manifest's `direction`
// filter labels them.
const DIRECTION_CODES = {
  en: { N: 'N', NE: 'NE', E: 'E', SE: 'SE', S: 'S', SW: 'SW', W: 'W', NW: 'NW' },
  fr: { N: 'N', NE: 'NE', E: 'E', SE: 'SE', S: 'S', SW: 'SO', W: 'O', NW: 'NO' },
};

/**
 * Snap a requested language to a supported one, English otherwise.
 * @param {string} [language] - ISO 639-1 code, e.g. from a widget request.
 * @returns {'en'|'fr'} A supported language.
 * @example
 * resolveLanguage('de'); // 'en'
 */
export function resolveLanguage(language) {
  return LANGUAGES.includes(language) ? language : 'en';
}

/**
 * Compact, localized pass values for a widget row.
 * @param {import('./pass-predictor.js').Pass} pass - The pass to describe.
 * @param {string} [language] - Language of the viewer (unsupported ones fall back to English).
 * @returns {{when: string, direction: string}} The localized values.
 * @example
 * localizeWidgetPass(pass, 'fr'); // { when: '28/09 19:49', direction: 'O' }
 */
export function localizeWidgetPass(pass, language) {
  const resolved = resolveLanguage(language);
  return {
    when: pass.startTime.toLocaleString(resolved, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
    direction: DIRECTION_CODES[resolved][pass.direction],
  };
}

/**
 * Localized, human-readable pass values.
 * @param {import('./pass-predictor.js').Pass} pass - The pass to describe.
 * @param {'en'|'fr'} language - The configured language.
 * @returns {{start_date: string, start_hour: string, direction_name: string}} The localized values.
 * @example
 * localizePass(pass, 'fr'); // { start_date: 'lundi 28 septembre', start_hour: '19:49', direction_name: 'ouest' }
 */
export function localizePass(pass, language) {
  return {
    start_date: pass.startTime.toLocaleDateString(language, { weekday: 'long', day: 'numeric', month: 'long' }),
    start_hour: pass.startTime.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }),
    direction_name: DIRECTION_NAMES[language][pass.direction],
  };
}
