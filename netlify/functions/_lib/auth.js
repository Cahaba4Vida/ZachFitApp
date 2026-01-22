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
  const issTrim = String(iss || "").replace(/\/+$/, "");
  const candidates = [];

  // Common cases:
  // 1) iss = https://<site>/.netlify/identity  -> JWKS at <iss>/.well-known/jwks.json
  // 2) iss = https://<site>                  -> JWKS at <site>/.netlify/identity/.well-known/jwks.json
  const hasIdentitySuffix = /\/\.netlify\/identity$/.test(issTrim);

  // Always try the direct path first.
  candidates.push(`${issTrim}/.well-known/jwks.json`);

  // Also try the Netlify Identity well-known path (handles iss without /.netlify/identity).
  if (!hasIdentitySuffix) {
    candidates.push(`${issTrim}/.netlify/identity/.well-known/jwks.json`);
  } else {
    // In case issuer already ends with /.netlify/identity but JWKS is hosted at site root identity path
    const siteRoot = issTrim.replace(/\/\.netlify\/identity$/, "");
    candidates.push(`${siteRoot}/.netlify/identity/.well-known/jwks.json`);
  }

  const now = Date.now();
  let lastErr = null;

  for (const jwksUrl of candidates) {
    const cached = jwksCache.get(jwksUrl);
    if (cached && now - cached.fetchedAt < 10 * 60 * 1000) return cached.jwks; // 10 min

    try {
      const jwks = await httpsGetJson(jwksUrl);
      jwksCache.set(jwksUrl, { fetchedAt: now, jwks });
      return jwks;
    } catch (e) {
      lastErr = e;
    }
  }

  const err = new Error("JWKS fetch failed");
  err.reason = "JWKS_FETCH_FAILED";
  err.details = { iss: issTrim };
  err.cause = lastErr;
  throw err;
};

const verifyJwt = async (token) => {
  const parts = decodeJwtParts(token);
  if (!parts) {
    const err = new Error("JWT malformed");
    err.reason = "JWT_MALFORMED";
    throw err;
  }

  const { header, payload, signature, signingInput } = parts;

  const nowSec = Math.floor(Date.now() / 1000);
  const skew = 60; // 60s clock skew tolerance

  if (payload?.exp && nowSec > payload.exp + skew) {
    const err = new Error("JWT expired");
    err.reason = "JWT_EXPIRED";
    throw err;
  }
  if (payload?.nbf && nowSec + skew < payload.nbf) {
    const err = new Error("JWT not active");
    err.reason = "JWT_NOT_ACTIVE";
    throw err;
  }

  const iss = payload?.iss;
  if (!iss) {
    const err = new Error("JWT missing issuer");
    err.reason = "JWT_NO_ISSUER";
    throw err;
  }

  const alg = header?.alg;
  if (alg !== "RS256") {
    const err = new Error("Unsupported JWT alg");
    err.reason = "JWT_UNSUPPORTED_ALG";
    err.details = { alg };
    throw err;
  }

  const jwks = await getJwksForIssuer(iss);

  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  const kid = header?.kid;
  const jwk = kid ? keys.find((k) => k.kid === kid) : keys[0];
  if (!jwk) {
    const err = new Error("No matching JWK");
    err.reason = "JWKS_KEY_NOT_FOUND";
    err.details = { kid: kid || null };
    throw err;
  }

  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  } catch (e) {
    const err = new Error("Invalid JWK");
    err.reason = "JWKS_KEY_INVALID";
    err.cause = e;
    throw err;
  }

  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(signingInput),
    publicKey,
    signature
  );
  if (!ok) {
    const err = new Error("Bad JWT signature");
    err.reason = "JWT_BAD_SIG";
    throw err;
  }

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

  try {
    const payload = await verifyJwt(token);
    return {
      userId: payload.sub,
      email: payload.email,
      token,
    };
  } catch (e) {
    // Stash a non-sensitive reason for diagnostics.
    event.__authReason = e?.reason || "JWT_INVALID";
    return null;
  }
};

};

const requireAuth = async (event) => {
  const user = await getUser(event);
  if (!user) {
    return {
      error: error(401, "Unauthorized", null, { reason: event.__authReason }),
      user: null,
    };
  }
  return { user };
};

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
