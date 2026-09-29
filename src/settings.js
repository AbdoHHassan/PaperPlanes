// Flight experience settings: how fast, how sharp, how much help, how busy
// the sky is, and how the camera behaves. Remembered between visits.

const STORE = 'paperplanes.flight';

export const OPTIONS = {
  speed: { label: 'Speed', choices: { calm: 0.82, normal: 1, brisk: 1.2 } },
  steering: { label: 'Steering', choices: { gentle: 0.75, normal: 1, sharp: 1.25 } },
  assist: { label: 'Assist', choices: { low: 0.4, normal: 1, high: 1.6 } },
  spacing: { label: 'Ring spacing', choices: { relaxed: 1.25, normal: 1, busy: 0.8 } },
  camera: { label: 'Camera', choices: { close: 0.8, classic: 1, wide: 1.3 } },
  motion: { label: 'Camera motion', choices: { calm: 0.35, normal: 1 } },
};

const DEFAULTS = { speed: 'normal', steering: 'normal', assist: 'normal', spacing: 'normal', camera: 'classic', motion: 'normal' };

export const settings = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
  for (const [k, v] of Object.entries(saved)) if (OPTIONS[k]?.choices[v] !== undefined) settings[k] = v;
} catch {
  /* storage unavailable */
}

const listeners = [];
export const onSettingsChange = (fn) => listeners.push(fn);

/** Numeric value of a setting (e.g. value('speed') -> 1.2). */
export const value = (key) => OPTIONS[key].choices[settings[key]];

export function setSetting(key, choice) {
  if (OPTIONS[key]?.choices[choice] === undefined || settings[key] === choice) return;
  settings[key] = choice;
  try {
    localStorage.setItem(STORE, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
  for (const fn of listeners) fn(key, choice);
}
