/**
 * Structured flight-surgeon escalation report: build, validate and render as
 * plain text. Shared by client (preview / copy / download) and server.
 */
import { ENVIRONMENTS, INDICATORS, DISCLAIMER } from '../config/thresholds.js';
import { formatDelay, commsPolicy } from './comms.js';
import { worstOf } from './severity.js';

export function buildEscalationReport({
  crew,
  status,
  environment,
  delaySeconds,
  focusIndicator = null,
  actionsTaken = [],
  note = '',
  priority = 'routine',
  createdAt = new Date().toISOString(),
}) {
  const { results = {}, snapshot = {}, hazards = [], score, missionDay = null, spe = null, cumulative = null } = status;
  const severities = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.severity]));
  const overall = worstOf(Object.values(severities));
  const policy = commsPolicy(priority === 'emergency' ? 'red' : overall, delaySeconds, environment);
  const readings = {};
  for (const m of INDICATORS) {
    const s = snapshot[m.id];
    if (!s) continue;
    readings[m.id] = { value: s.value, unit: m.unit, measuredAt: s.ts, source: s.source ?? null, device: s.device ?? null, stale: Boolean(s.stale) };
    if (m.id === 'radiation' && results.radiation) readings.radiation.estimatedMsvPerDay = results.radiation.estMsv;
  }
  return {
    version: 2,
    priority,
    crew: { id: crew.id, name: crew.name, role: crew.role },
    createdAt,
    missionDay,
    environment: { id: environment, label: ENVIRONMENTS[environment]?.label ?? environment },
    delay: { seconds: delaySeconds, text: formatDelay(delaySeconds), arrival: policy.arrivalText },
    overallSeverity: priority === 'emergency' ? 'red' : overall,
    score: score?.score ?? null,
    focusIndicator,
    readings,
    severities,
    reasons: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.reason])),
    hazardInsights: hazards.map((h) => ({ id: h.id, hazard: h.hazard, severity: h.severity, title: h.title })),
    radiation: { cumulativeMsv: cumulative ? Number(cumulative.value.toFixed(1)) : null, speEventMsv: spe ? Number(spe.value.toFixed(1)) : null },
    actionsTaken,
    note,
    disclaimer: DISCLAIMER,
  };
}

export function validateEscalationPayload(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return ['Payload must be an object.'];
  if (!p.crew || typeof p.crew.id !== 'string') errors.push('crew.id is required.');
  if (typeof p.createdAt !== 'string' || Number.isNaN(new Date(p.createdAt).getTime())) errors.push('createdAt must be an ISO timestamp.');
  if (!p.environment || typeof p.environment.id !== 'string') errors.push('environment.id is required.');
  if (!p.readings || typeof p.readings !== 'object') errors.push('readings are required.');
  if (!p.severities || typeof p.severities !== 'object') errors.push('severities are required.');
  if (p.priority !== undefined && !['routine', 'emergency'].includes(p.priority)) errors.push('priority must be "routine" or "emergency".');
  return errors;
}

const SEV_TEXT = { green: 'NOMINAL', amber: 'CAUTION', red: 'CRITICAL (act now)' };

export function formatStamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

export function reportToText(r) {
  const lines = [];
  lines.push(r.priority === 'emergency' ? '*** EMERGENCY *** EVEXIA FLIGHT SURGEON REPORT' : 'EVEXIA FLIGHT SURGEON ESCALATION REPORT');
  lines.push('='.repeat(46));
  lines.push(`Crew:          ${r.crew.name} (${r.crew.role}, ${r.crew.id})`);
  lines.push(`Sent:          ${formatStamp(r.createdAt)}${r.missionDay ? ` (mission day ${r.missionDay})` : ''}`);
  lines.push(`Environment:   ${r.environment.label}`);
  lines.push(`Earth link:    ${r.delay.text} one-way. ${r.delay.arrival}`);
  lines.push(`Overall:       ${SEV_TEXT[r.overallSeverity]}${r.score != null ? `, health score ${r.score}` : ''}`);
  if (r.focusIndicator) lines.push(`Reason:        ${r.focusIndicator}`);
  lines.push('');
  lines.push('LATEST READINGS (value · status · measured at · source)');
  for (const m of INDICATORS) {
    const rd = r.readings[m.id];
    if (!rd) continue;
    const sev = r.severities[m.id];
    const extra = m.id === 'radiation' && rd.estimatedMsvPerDay != null ? ` (≈${rd.estimatedMsvPerDay} mSv/day est.)` : '';
    lines.push(`- ${m.label}: ${rd.value} ${m.unit}${extra}  [${sev ? SEV_TEXT[sev] : 'STALE: not evaluated'}]  ${formatStamp(rd.measuredAt)}  ${rd.device || rd.source || ''}`.trimEnd());
    if (r.reasons?.[m.id]) lines.push(`    ${r.reasons[m.id]}`);
  }
  if (r.radiation?.cumulativeMsv != null) lines.push(`- Cumulative dose (estimated): ${r.radiation.cumulativeMsv} mSv of 600 mSv career limit`);
  if (r.radiation?.speEventMsv != null) lines.push(`- Solar particle event dose (estimated): ${r.radiation.speEventMsv} mSv of 250 mSv per-event limit`);
  lines.push('');
  lines.push('HAZARD INSIGHTS');
  if (!r.hazardInsights.length) lines.push('- None');
  for (const h of r.hazardInsights) lines.push(`- [${h.severity.toUpperCase()}] ${h.title}`);
  lines.push('');
  lines.push('ACTIONS ALREADY TAKEN');
  if (!r.actionsTaken.length) lines.push('- None recorded');
  for (const a of r.actionsTaken) lines.push(`- ${a}`);
  if (r.note) {
    lines.push('');
    lines.push(`NOTE FROM CREW: ${r.note}`);
  }
  lines.push('');
  lines.push(r.disclaimer);
  return lines.join('\n');
}
