/**
 * Ask before downloading the realistic body (several MB) on a slow link or with Save-Data on.
 * Once someone has said yes on this device, remember it (a per-device convenience only).
 * Same rule and storage key as the Body page, so one "yes" covers both the Console and the Body page.
 */
export const CONSENT_KEY = 'evexia-body-3d';

export function shouldAskFirst() {
  try {
    if (window.localStorage.getItem(CONSENT_KEY) === 'yes') return false;
  } catch {
    /* storage blocked: just ask */
  }
  const c = typeof navigator !== 'undefined' ? navigator.connection : undefined;
  return Boolean(c && (c.saveData || ['slow-2g', '2g', '3g'].includes(c.effectiveType)));
}

export function rememberConsent() {
  try {
    window.localStorage.setItem(CONSENT_KEY, 'yes');
  } catch {
    /* storage blocked: we will ask again next time */
  }
}
