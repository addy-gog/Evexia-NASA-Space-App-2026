/**
 * Authentication and authorisation.
 * - Passwords: scrypt (node:crypto) with a random 16-byte salt, compared in constant time.
 * - Sessions: random 32-byte token in an HttpOnly, SameSite=Lax cookie; only its SHA-256
 *   hash is stored server-side, with an expiry (default 12 h).
 * - Roles: "astronaut" (own crew record only) and "surgeon" (every crew record).
 */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export const COOKIE = 'evexia_session';
const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 12;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export function newSession() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: tokenHash(token), expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString() };
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, req, maxAgeSeconds = SESSION_HOURS * 3600) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https' || process.env.COOKIE_SECURE === 'true';
  const sameSite = process.env.COOKIE_SAMESITE || 'Lax';
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

/** Express middleware: attaches req.user ({ id, username, role, crewId, name, avatar }) when signed in. */
export function sessionMiddleware(repo) {
  return (req, _res, next) => {
    const token = parseCookies(req.get('cookie'))[COOKIE];
    if (token) {
      const user = repo.userForSession(tokenHash(token));
      if (user) req.user = user;
    }
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated', message: 'Sign in first.' });
  return next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated', message: 'Sign in first.' });
    if (req.user.role !== role) return res.status(403).json({ error: 'forbidden', message: `Only the ${role} role can do this.` });
    return next();
  };
}

/** Astronauts may only touch their own crew record; the flight surgeon may touch all. */
export function canAccessCrew(user, crewId) {
  if (!user) return false;
  if (user.role === 'surgeon') return true;
  return user.role === 'astronaut' && user.crewId === crewId;
}
