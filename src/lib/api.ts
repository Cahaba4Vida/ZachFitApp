import netlifyIdentity from 'netlify-identity-widget';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => {
      window.clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      window.clearTimeout(t);
      reject(e);
    });
  });
}

async function getToken(): Promise<string | null> {
  const user: any = netlifyIdentity.currentUser();
  if (!user) return null;

  // Fast path: many Identity builds keep the access token here.
  const access = user?.token?.access_token || user?.tokenDetails?.access_token || user?.token?.accessToken || user?.tokenDetails?.accessToken;
  if (typeof access === 'string' && access.length > 0) return access;

  // GoTrue-style API: jwt(forceRefresh?) -> Promise<string>
  if (typeof user.jwt === 'function') {
    try {
      const tok = await withTimeout(Promise.resolve(user.jwt(true)), 5000);
      return typeof tok === 'string' && tok.length > 0 ? tok : null;
    } catch {
      return null;
    }
  }

  return null;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let token: string | null = null;
  try {
    token = await withTimeout(getToken(), 5000);
  } catch {
    token = null;
  }

  const controller = new AbortController();
  const abortT = window.setTimeout(() => controller.abort(), 12000);

  let res: Response;
  try {
    res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: controller.signal
  }).finally(() => window.clearTimeout(abortT));
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('timeout');
    throw e;
  }

  if (!res.ok) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const j: any = await res.json().catch(() => null);
    throw new Error(j?.error || j?.message || res.statusText);
  }
  const text = await res.text();
  throw new Error(text || res.statusText);
}
  return (await res.json()) as T;
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body: unknown) => request<T>('POST', url, body)
};
