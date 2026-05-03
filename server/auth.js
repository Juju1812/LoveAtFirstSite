import crypto from 'node:crypto';

/**
 * Minimal auth: scrypt for password hashing, HMAC-signed tokens for sessions.
 * No external dependencies.
 *
 * IMPORTANT: set JWT_SECRET in env or all tokens become invalid on every
 * server restart. The fallback random secret is fine for dev only.
 */

const TOKEN_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET not set — using ephemeral secret. Set this in env for stable sessions.');
}

export function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt.toString('hex')}:${derivedKey.toString('hex')}`);
    });
  });
}

export function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    if (typeof stored !== 'string' || !stored.includes(':')) return resolve(false);
    const [saltHex, hashHex] = stored.split(':');
    let salt, expected;
    try {
      salt = Buffer.from(saltHex, 'hex');
      expected = Buffer.from(hashHex, 'hex');
    } catch { return resolve(false); }
    if (expected.length !== 64) return resolve(false);
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return resolve(false);
      try { resolve(crypto.timingSafeEqual(expected, derivedKey)); }
      catch { resolve(false); }
    });
  });
}

export function signToken(userId) {
  const payload = { uid: userId, exp: Date.now() + TOKEN_TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payloadB64).digest('base64url');
  // timingSafeEqual requires equal lengths
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (typeof payload.uid !== 'number' || Date.now() > payload.exp) return null;
    return payload.uid;
  } catch { return null; }
}

/** Express middleware: extracts userId from Bearer token, attaches to req.userId. */
export function authMiddleware(req, _res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (match) {
    const userId = verifyToken(match[1]);
    if (userId) req.userId = userId;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'auth required' });
  next();
}
