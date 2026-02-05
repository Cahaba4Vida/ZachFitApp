import type { Handler } from '@netlify/functions';
import { withTopLevelError, json, forbidden, getAuth } from './_shared/http';
import { upsertUser } from './_shared/user_upsert';
import { many } from './_shared/db_helpers';

export const handler: Handler = withTopLevelError(async (event, context) => {
  const auth = await getAuth(event, context);
  if (!auth) return forbidden('Login required');
  const userRow = await upsertUser(auth);

  const rows = await many<any>(
    `select w.id, w.status, w.created_at, w.program_day_id
     from workouts w
     where w.user_id = $1
     order by w.created_at desc
     limit 30`,
    [userRow.id]
  ).catch(() => []);

  return json(200, { workouts: rows });
});
