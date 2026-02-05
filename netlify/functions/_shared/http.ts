import type { HandlerResponse } from '@netlify/functions';

export function json(statusCode: number, body: unknown): HandlerResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

export function badRequest(message: string, extra?: unknown) {
  return json(400, { error: message, ...(extra ? { extra } : {}) });
}

export function forbidden(message: string) {
  return json(403, { error: message });
}

export function notFound() {
  return json(404, { error: 'Not found' });
}
