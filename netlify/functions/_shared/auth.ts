import { jwtVerify, createRemoteJWKSet } from 'jose';

export type AuthUser = {
  sub: string;
  email: string;
};

// Netlify Identity / GoTrue exposes JWKS at: /.netlify/identity/.well-known/jwks.json
// Allow override via IDENTITY_JWKS_URL.
const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || null;
const jwksUrl =
  process.env.IDENTITY_JWKS_URL ||
  (baseUrl ? `${baseUrl}/.netlify/identity/.well-known/jwks.json` : null);

const jwks = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null;

export async function requireAuth(authorization?: string, contextUser?: any): Promise<AuthUser | null> {
  // Prefer Netlify-provided decoded user (avoids JWKS/network issues).
  if (contextUser?.sub) {
    return { sub: String(contextUser.sub), email: String(contextUser.email || '') };
  }

  if (!authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  try {
    if (!jwks) return null;
    const { payload } = await jwtVerify(token, jwks);
    return {
      sub: payload.sub as string,
      email: (payload.email as string) || ''
    };
  } catch {
    return null;
  }
}

export function requireRole(role: string, userRole: string): boolean {
  const order = ['user', 'coach', 'admin', 'super_admin'];
  return order.indexOf(userRole) >= order.indexOf(role);
}
