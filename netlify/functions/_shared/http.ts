import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { requireAuth } from './auth';

export function json(statusCode: number, body: any, headers: Record<string,string> = {}) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    body: JSON.stringify(body),
  };
}


export function badRequest(message: string, details?: any) {
  return json(400, { error: 'bad_request', message, details });
}

export function notFound(message: string) {
  return json(404, { error: 'not_found', message });
}

export function forbidden(message: string) {
  return json(403, { error: 'forbidden', message });
}

export function methodNotAllowed() {
  return json(405, { error: 'method_not_allowed' });
}

export async function getAuth(event: HandlerEvent, context: HandlerContext) {
  const authHeader = (event.headers?.authorization || (event.headers as any)?.Authorization) as string | undefined;
  return await requireAuth(authHeader, (context as any)?.clientContext?.user, (event.headers || {}) as any);
}

export function withTopLevelError(handler: Handler): Handler {
  return async (event, context) => {
    try { return await handler(event, context); }
    catch (e: any) {
      console.error('[fn] server_error', { path: event.path, method: event.httpMethod, message: e?.message, stack: e?.stack });
      return json(500, { error: 'server_error', message: e?.message || 'unknown' });
    }
  };
}
