import type { Handler } from '@netlify/functions';
import { sql } from './_shared/db';

export const config = {
  schedule: '@daily'
};

export const handler: Handler = async () => {
  await sql('delete from admin_assistant_threads where expires_at < now()');
  return {
    statusCode: 200,
    body: 'ok'
  };
};
