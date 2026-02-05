import type { HandlerEvent } from '@netlify/functions';

export async function handleToday(opts: {
  event: HandlerEvent;
  userId: string;
  one: <T>(q: string, params?: any[]) => Promise<T>;
  many: <T>(q: string, params?: any[]) => Promise<T[]>;
  json: (code: number, body: any) => any;
}) {
  const { event, userId, one, many, json } = opts;

  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });

  const prog = await one<any>(
    `select id,start_date,end_date from programs where user_id=$1 and status='active' order by created_at desc limit 1`,
    [userId]
  ).catch(() => null);

  if (!prog) return json(200, { has_program: false });

  const startDate = new Date(String(prog.start_date) + 'T00:00:00Z');
  const now = new Date();
  const dayNumber = Math.min(28, Math.max(1, Math.floor((now.getTime() - startDate.getTime()) / 86400000) + 1));

  const pd = await one<any>(
    `select id,day_index,scheduled_date,name from program_days where program_id=$1 and day_index=$2`,
    [prog.id, dayNumber]
  ).catch(() => null);

  if (!pd) return json(200, { has_program: true, program: prog, day: null });

  const exRows = await many<any>(
    `select de.order_index, e.name, e.slug, de.prescription
     from day_exercises de
     join exercises e on e.id = de.exercise_id
     where de.program_day_id=$1
     order by de.order_index asc`,
    [pd.id]
  );

  return json(200, {
    has_program: true,
    program: { id: prog.id, start_date: prog.start_date, end_date: prog.end_date },
    day: { id: pd.id, day_index: pd.day_index, scheduled_date: pd.scheduled_date, name: pd.name },
    exercises: exRows
  });
}
