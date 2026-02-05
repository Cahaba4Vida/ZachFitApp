export type AuthUser = {
  sub: string;
  email: string;
};

function getOriginFromHeaders(headers: Record<string, string | undefined>): string | null {
  const proto = headers['x-forwarded-proto'] || 'https';
  const host = headers['host'] || headers['x-forwarded-host'];
  if (!host) return null;
  return `${proto}://${host}`;
}

async function validateWithIdentity(origin: string, token: string): Promise<AuthUser | null> {
  // Netlify Identity endpoint that returns the current user for a valid access token.
  // Uses the request origin (works for production, branch deploys, deploy previews).
  const url = `${origin}/.netlify/identity/user`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (!data?.id) return null;
    return { sub: String(data.id), email: String(data.email || '') };
  } catch {
    return null;
  }
}

export async function requireAuth(
  authorization: string | undefined,
  contextUser: any,
  headers: Record<string, string | undefined>
): Promise<AuthUser | null> {
  // Prefer Netlify-provided decoded user (most reliable).
  if (contextUser?.sub) {
    return { sub: String(contextUser.sub), email: String(contextUser.email || '') };
  }

  if (!authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const origin = getOriginFromHeaders(headers);
  if (!origin) return null;

  return await validateWithIdentity(origin, token);
}

export function requireRole(role: string, userRole: string): boolean {
  const order = ['user', 'coach', 'admin', 'super_admin'];
  return order.indexOf(userRole) >= order.indexOf(role);
}
