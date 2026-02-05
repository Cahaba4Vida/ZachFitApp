import type { Handler } from '@netlify/functions';
import { withTopLevelError, json, forbidden, getAuth } from './_shared/http';
import { upsertUser } from './_shared/user_upsert';
import { many } from './_shared/db_helpers';

export const handler: Handler = withTopLevelError(async (event, context) => {
  const auth = await getAuth(event, context);
  if (!auth) return forbidden('Login required');
  const userRow = await upsertUser(auth);

  const weekly = await many<any>(
    `select date_trunc('week', w.created_at)::date as week_start,
            coalesce(sum(ws.reps * ws.load),0)::float as volume
     from workouts w
     join workout_sets ws on ws.workout_id = w.id
     where w.user_id = $1
       and w.created_at >= now() - interval '56 days'
     group by 1
     order by 1 asc`,
    [userRow.id]
  ).catch(() => []);

  const top = await many<any>(
    `select e.slug, e.name,
            coalesce(sum(ws.reps * ws.load),0)::float as volume
     from workouts w
     join workout_sets ws on ws.workout_id = w.id
     join exercises e on e.id = ws.exercise_id
     where w.user_id = $1
       and w.created_at >= now() - interval '28 days'
     group by e.slug, e.name
     order by volume desc
     limit 8`,
    [userRow.id]
  ).catch(() => []);

  return json(200, { weekly, top });
});
