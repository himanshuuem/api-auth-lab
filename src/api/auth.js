import { createHmac, randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";

/** In-memory user/key store. Passwords are hashed with scrypt + per-user salt — never stored in plain text. */
export function createAuthStore(secret = randomBytes(32).toString("hex")) {
  const users = new Map();
  const apiKeys = new Set();

  const hash = (password, salt) => scryptSync(password, salt, 32);

  return {
    register(username, password) {
      if (!/^[a-z0-9_]{3,24}$/i.test(username ?? "")) throw Object.assign(new Error("Username must be 3–24 letters, digits or _."), { status: 400 });
      if (typeof password !== "string" || password.length < 8) throw Object.assign(new Error("Password must be at least 8 characters."), { status: 400 });
      if (users.has(username)) throw Object.assign(new Error("Username already taken."), { status: 409 });
      const salt = randomBytes(16);
      users.set(username, { salt, hash: hash(password, salt) });
    },

    verifyPassword(username, password) {
      const user = users.get(username);
      if (!user || typeof password !== "string") return false;
      return timingSafeEqual(hash(password, user.salt), user.hash);
    },

    issueApiKey() {
      const key = randomUUID();
      apiKeys.add(key);
      return key;
    },

    hasApiKey(key) {
      return apiKeys.has(key);
    },

    /** Compact signed token: base64url(payload).signature — a JWT-shaped idea without the dependency. */
    issueToken(username, ttlSeconds = 3600) {
      const payload = Buffer.from(JSON.stringify({ sub: username, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
      const signature = createHmac("sha256", secret).update(payload).digest("base64url");
      return `${payload}.${signature}`;
    },

    verifyToken(token) {
      const [payload, signature] = String(token ?? "").split(".");
      if (!payload || !signature) return null;
      const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("base64url"));
      const given = Buffer.from(signature);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
      return claims.exp > Date.now() / 1000 ? claims : null;
    },
  };
}
