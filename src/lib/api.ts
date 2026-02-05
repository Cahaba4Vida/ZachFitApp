import netlifyIdentity from 'netlify-identity-widget';

async function getToken(): Promise<string | null> {
  const user = netlifyIdentity.currentUser();
  if (!user) return null;
  return await new Promise((resolve) => user.jwt(true, (err: any, token: string) => resolve(err ? null : token)));
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown) => request<T>('POST', url, body)
};
