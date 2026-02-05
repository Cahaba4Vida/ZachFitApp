import type { HandlerEvent } from '@netlify/functions';
import { z } from 'zod';
import crypto from 'node:crypto';

export async function handleWorkoutLog(opts: {
  event: HandlerEvent;
  userId: string;
  sql: (q: string, params?: any[]) => Promise<any>;
  one: <T>(q: string, params?: any[]) => Promise<T>;
  many: <T>(q: string, params?: any[]) => Promise<T[]>;
  json: (code: number, body: any) => any;
}) {
  const { event, userId, sql, one, many, json } = opts;

  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const body = JSON.parse(event.body || '{}');
  const schema = z.object({
    program_day_id: z.string().uuid().optional().nullable(),
    status: z.enum(['completed','partial','skipped']).default('completed'),
    log_as_prescribed: z.boolean().optional().default(false),
    sets: z.array(z.object({
      exercise_slug: z.string(),
      set_index: z.number().int().min(1),
      reps: z.number().int().min(0),
      load: z.number(),
      rpe: z.number().optional().nullable()
    })).optional().default([]),
    deviations: z.array(z.object({
      type: z.string(),
      reason_category: z.string(),
      diff: z.any(),
      approval_source: z.enum(['bot','user']).optional()
    })).optional().default([])
  });
  const parsed = schema.parse(body);

  const workoutId = crypto.randomUUID();
  await sql(
    `insert into workouts(id,user_id,program_day_id,status) values ($1,$2,$3,$4)`,
    [workoutId, userId, parsed.program_day_id || null, parsed.status]
  );

  if (parsed.log_as_prescribed && parsed.program_day_id) {
    const exRows = await many<any>(
      `select e.slug, e.id as exercise_id, de.prescription
       from day_exercises de join exercises e on e.id=de.exercise_id
       where de.program_day_id=$1 order by de.order_index asc`,
      [parsed.program_day_id]
    );
    for (const ex of exRows) {
      const sets = Number(ex.prescription?.sets || 0);
      const reps = Number(ex.prescription?.reps || 0);
      for (let i = 1; i <= sets; i++) {
        await sql(
          `insert into workout_sets(id,workout_id,exercise_id,set_index,reps,load,rpe,is_warmup)
           values ($1,$2,$3,$4,$5,$6,$7,false)`,
          [crypto.randomUUID(), workoutId, ex.exercise_id, i, reps, 0, null]
        );
      }
    }
  } else {
    for (const s of parsed.sets) {
      const ex = await one<any>(`select id from exercises where slug=$1`, [s.exercise_slug]).catch(() => null);
      if (!ex) continue;
      await sql(
        `insert into workout_sets(id,workout_id,exercise_id,set_index,reps,load,rpe,is_warmup)
         values ($1,$2,$3,$4,$5,$6,$7,false)`,
        [crypto.randomUUID(), workoutId, ex.id, s.set_index, s.reps, s.load, s.rpe ?? null]
      );
    }
  }

  for (const d of parsed.deviations) {
    await sql(
      `insert into deviations(id,workout_id,type,diff,reason_category,approval_source)
       values ($1,$2,$3,$4,$5,$6)`,
      [crypto.randomUUID(), workoutId, d.type, d.diff, d.reason_category, d.approval_source || 'user']
    );
  }

  return json(200, { ok: true, workout_id: workoutId });
}
