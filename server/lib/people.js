/**
 * Fictional crew and flight-surgeon accounts for the demo.
 * Names and profiles are invented; portraits are generated illustrations
 * (DiceBear "Personas" by Draftbit, CC BY 4.0), never photos of real people.
 *
 * Demo passwords are documented in the README. Change them (DEMO_PASSWORD_SUFFIX
 * or edit this file) before any real deployment.
 */
const SUFFIX = process.env.DEMO_PASSWORD_SUFFIX || '2026';

export const CREW = [
  { id: 'c1', name: 'Cdr. Ada Okafor', role: 'Commander', username: 'okafor', born: '1986-03-14', sex: 'Female', bloodType: 'O+', heightCm: 172, massKg: 66, callsign: 'ATLAS' },
  { id: 'c2', name: 'Leo Marchetti', role: 'Pilot', username: 'marchetti', born: '1984-07-02', sex: 'Male', bloodType: 'A+', heightCm: 180, massKg: 78, callsign: 'VECTOR' },
  { id: 'c3', name: 'Mei Tanaka', role: 'Flight Engineer', username: 'tanaka', born: '1990-11-21', sex: 'Female', bloodType: 'B+', heightCm: 163, massKg: 55, callsign: 'TORQUE' },
  { id: 'c4', name: 'Sam Rivera', role: 'Mission Specialist', username: 'rivera', born: '1988-01-09', sex: 'Male', bloodType: 'O-', heightCm: 176, massKg: 72, callsign: 'ORBIT' },
  { id: 'c5', name: 'Priya Nair', role: 'Science Officer (Crew Medical Officer)', username: 'nair', born: '1987-05-27', sex: 'Female', bloodType: 'AB+', heightCm: 167, massKg: 60, callsign: 'HELIX' },
].map((c) => ({ ...c, avatar: `/avatars/${c.id}.svg` }));

export const SURGEON = {
  id: 's1',
  name: 'Dr. Jonas Lindqvist',
  role: 'Flight Surgeon',
  username: 'surgeon',
  avatar: '/avatars/s1.svg',
};

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Demo accounts: { username, password, role, crewId, name }. */
export function demoAccounts() {
  return [
    ...CREW.map((c) => ({ username: c.username, password: `${cap(c.username)}-${SUFFIX}`, role: 'astronaut', crewId: c.id, name: c.name, avatar: c.avatar })),
    { username: SURGEON.username, password: `Surgeon-${SUFFIX}`, role: 'surgeon', crewId: null, name: SURGEON.name, avatar: SURGEON.avatar },
  ];
}

export function ageOn(born, now = new Date()) {
  const b = new Date(born);
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a -= 1;
  return a;
}
