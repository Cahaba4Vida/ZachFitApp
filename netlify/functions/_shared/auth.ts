import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';

export type AuthUser = {
  sub: string;
  email: string;
};

const jwksUrl = process.env.IDENTITY_JWKS_URL || (process.env.URL ? `${process.env.URL}/.netlify/identity/jwks` : null);
const jwks = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null;

export async function requireAuth(authorization?: string): Promise<AuthUser | null> {
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
