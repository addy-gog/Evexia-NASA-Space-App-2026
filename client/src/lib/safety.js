/**
 * Safety screen: step 1 of the assistant's safety ladder. Runs on the
 * astronaut's own words BEFORE any AI call, in the browser and on the server,
 * so danger signs always lead to emergency mode, online or offline.
 *
 * It is a keyword screen, not a diagnosis. It errs towards false alarms:
 * a wrong "open emergency mode" costs a tap, a missed one could cost a life.
 */
const SIGNS = [
  { id: 'chest_pain', label: 'chest pain or pressure', re: /\bchest\s+(pain|pressure|tightness|hurts?|is\s+tight)|\bpain\s+in\s+(my|the)\s+chest/i },
  { id: 'breathing', label: 'trouble breathing', re: /\b(can'?t|cannot|can\s+not|struggling\s+to|hard\s+to|trouble|difficulty)\s+(breath(e|ing)?)|\bshort(ness)?\s+of\s+breath|\bgasping\b|\bchoking\b/i },
  { id: 'fainting', label: 'fainting or collapse', re: /\b(fainted|fainting|passed\s+out|blacked\s+out|lost\s+consciousness|unconscious|unresponsive|collapsed?)\b/i },
  { id: 'seizure', label: 'seizure', re: /\b(seizure|seizing|convuls\w*|fitting)\b/i },
  { id: 'confusion', label: 'sudden confusion', re: /\b(confused|confusion|disoriented|can'?t\s+think\s+straight|doesn'?t\s+know\s+where)\b/i },
  { id: 'stroke', label: 'stroke warning signs', re: /\b(slurred\s+speech|face\s+(is\s+)?droop\w*|drooping\s+face|one\s+side\s+(of\s+(my|the)\s+body\s+)?(is\s+)?(weak|numb)|sudden\s+numbness)\b/i },
  { id: 'bleeding', label: 'heavy bleeding', re: /\b(won'?t\s+stop\s+bleeding|bleeding\s+(heavily|a\s+lot|badly)|heavy\s+bleeding|(coughing|vomiting|throwing\s+up)\s+blood)\b/i },
  { id: 'allergy', label: 'severe allergic reaction', re: /\b(throat\s+(is\s+)?(swelling|closing|tight)|swollen\s+(lips|tongue|throat)|lips?\s+(are\s+|is\s+)?swelling|anaphyla\w*)\b/i },
  { id: 'blue', label: 'blue lips or skin', re: /\b(blue|grey|gray)\s+(lips|skin|face)|\b(lips|skin|face)(\s+(are|is|looks?|turning|turned|going|gone))*\s+(blue|grey|gray)\b/i },
  { id: 'headache', label: 'sudden severe headache', re: /\b(worst\s+headache|thunderclap|sudden\s+severe\s+headache)\b/i },
  { id: 'self_harm', label: 'thoughts of self-harm', re: /\b(suicid\w*|kill\s+myself|end\s+my\s+life|want\s+to\s+die|hurt\s+myself)\b/i },
];

// "no chest pain", "not fainting", "without trouble breathing" do not trigger.
const NEGATED = /\b(no|not|never|without|denies|deny|none\s+of)\s+(\w+\s+){0,2}$/i;

/**
 * @param {string} text
 * @returns {{ id: string, label: string }[]} danger signs found, in list order
 */
export function screenDangerSigns(text) {
  const s = String(text ?? '');
  const out = [];
  for (const sign of SIGNS) {
    const re = new RegExp(sign.re.source, 'gi');
    let m;
    while ((m = re.exec(s))) {
      const before = s.slice(Math.max(0, m.index - 30), m.index);
      if (!NEGATED.test(before)) {
        out.push({ id: sign.id, label: sign.label });
        break;
      }
    }
  }
  return out;
}

export const EMERGENCY_LINE = 'If this is happening now, open emergency mode and alert the crew medical officer straight away. Do not wait for Earth.';
