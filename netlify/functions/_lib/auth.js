const crypto = require("crypto");
const https = require("https");
const { error } = require("./response");

// ---- Base64URL helpers ----
const base64UrlToBuffer = (b64url) => {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64");
};

const decodeJwtParts = (token) => {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(base64UrlToBuffer(parts[0]).toString("utf-8"));
    const payload = JSON.parse(base64UrlToBuffer(parts[1]).toString("utf-8"));
    const signature = base64UrlToBuffer(parts[2]);
    return { header, payload, signature, signingInput: `${parts[0]}.${parts[1]}` };
  } catch (e) {
    return null;
  }
};

const httpsGetJson = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });

// ---- JWKS cache (per-issuer) ----
const jwksCache = new Map(); // iss -> { fetchedAt, jwks }

const getJwksForIssuer = async (iss) => {
  // Netlify Identity (GoTrue) uses: <site>/.netlify/identity as issuer
  const jwksUrl = `${iss.replace(/\/+$/, "")}/.well-known/jwks.json`;
  const cached = jwksCache.get(jwksUrl);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < 10 * 60 * 1000) return cached.jwks; // 10 min
  const jwks = await httpsGetJson(jwksUrl);
  jwksCache.set(jwksUrl, { fetchedAt: now, jwks });
  return jwks;
};

const verifyJwt = async (token) => {
  const parts = decodeJwtParts(token);
  if (!parts) return null;

  const { header, payload, signature, signingInput } = parts;

  // Basic token validity checks
  const nowSec = Math.floor(Date.now() / 1000);
  const skew = 60; // 60s clock skew tolerance

  if (payload?.exp && nowSec > payload.exp + skew) return null;
  if (payload?.nbf && nowSec + skew < payload.nbf) return null;

  // Require an issuer to find keys
  const iss = payload?.iss;
  if (!iss) return null;

  // Only support RS256 (Netlify Identity default)
  const alg = header?.alg;
  if (alg !== "RS256") return null;

  let jwks;
  try {
    jwks = await getJwksForIssuer(iss);
  } catch (e) {
    console.error("Failed to fetch JWKS", e?.message || e);
    return null;
  }

  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  const kid = header?.kid;
  const jwk = kid ? keys.find((k) => k.kid === kid) : keys[0];
  if (!jwk) return null;

  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  } catch (e) {
    console.error("Failed to create public key from JWK", e?.message || e);
    return null;
  }

  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(signingInput),
    publicKey,
    signature
  );
  if (!ok) return null;

  return payload;
};

const getTokenFromEvent = (event) => {
  const header = event?.headers?.authorization || event?.headers?.Authorization;
  if (!header) return null;
  return header.replace("Bearer ", "");
};

const getUser = async (event) => {
  const token = getTokenFromEvent(event);
  if (!token) return null;

  const payload = await verifyJwt(token);
  if (!payload) return null;

  return {
    userId: payload.sub,
    email: payload.email,
    token,
  };
};

const requireAuth = async (event) => {
  const user = await getUser(event);
  if (!user) {
    return { error: error(401, "Unauthorized"), user: null };
  }
  return { user };
};

const isAdmin = (user) => {
  const allowlist =
    process.env.ADMIN_EMAIL_ALLOWLIST || "edwardszachary647@gmail.com";
  return allowlist
    .split(",")
    .map((item) => item.trim())
    .includes(user.email);
};

module.exports = { getUser, requireAuth, isAdmin };
