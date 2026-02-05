import type { HandlerEvent } from '@netlify/functions';
import { z } from 'zod';
import crypto from 'node:crypto';
import { callResponsesAPI, extractJsonBlock } from '../_shared/ai';
import { normalizeModel } from '../_shared/ai_model';

export async function handleOnboardingGenerate(opts: {
  event: HandlerEvent;
  userRow: any;
  sql: (q: string, params?: any[]) => Promise<any>;
  one: <T>(q: string, params?: any[]) => Promise<T>;
  many: <T>(q: string, params?: any[]) => Promise<T[]>;
  json: (code: number, body: any) => any;
  forbidden: (msg: string) => any;
  canUseAi: (userRow: any) => Promise<boolean>;
}) {
  const { event, userRow, sql, one, many, json, forbidden, canUseAi } = opts;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const body = JSON.parse(event.body || '{}');
  const schema = z.object({
    goal: z.enum(['strength','hypertrophy','fat_loss']).optional(),
    experience: z.enum(['beginner','intermediate','advanced']).optional(),
    days_per_week: z.number().int().min(1).max(7).optional(),
    equipment: z.string().max(64).optional(),
    constraints: z.string().max(500).optional()
  }).passthrough();
  const prefs = schema.parse(body);

  if (!(await canUseAi(userRow))) return forbidden('AI pending approval or not entitled');

  const today = new Date();
  const startIso = today.toISOString().slice(0, 10);
  const endIso = new Date(today.getTime() + 27 * 86400000).toISOString().slice(0, 10);
  const programId = crypto.randomUUID();

  await sql(
    `insert into programs(id,user_id,status,start_date,end_date,generated_from_program_id,generation_source)
     values ($1,$2,'active',$3,$4,null,'ai')
     on conflict do nothing`,
    [programId, userRow.id, startIso, endIso]
  );

  const profile = await one<any>('select * from profiles where user_id=$1', [userRow.id]).catch(()=>null);

  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiModel = normalizeModel(process.env.OPENAI_MODEL || 'gpt-5');

  let plan: any | null = null;

  // Thread prefs into prompt + input for real personalization
  const prefsSummary = [
    prefs.goal ? `goal=${prefs.goal}` : null,
    prefs.experience ? `experience=${prefs.experience}` : null,
    typeof prefs.days_per_week === 'number' ? `days_per_week=${prefs.days_per_week}` : null,
    prefs.equipment ? `equipment=${prefs.equipment}` : null,
    prefs.constraints ? `constraints=${prefs.constraints}` : null
  ].filter(Boolean).join(', ');

  if (openaiKey) {
    const userPrefsText = (userRow.ai_user_instructions || '').trim();
    const instructions = [
      'You are a strength and hypertrophy programming assistant.',
      'Return ONLY JSON (no markdown) matching the provided schema.',
      'Constraints:',
      '- Do not give medical advice. If injury/pain is mentioned, keep substitutions conservative.',
      '- Keep weekly volume change within 10%.',
      '- Use the user\'s units and intensity_style (rpe/percent/none).',
      'Schema:',
      '{ "days": [ { "week_index": 1, "day_index": 1, "name": "Training Day 1", "exercises": [ { "slug": "bench_press", "name": "Bench Press", "prescription": { "sets": 3, "reps": 5, "load": 100, "rpe": 6 } } ] } ] }',
      'Notes: Provide 4 weeks * 4 days = 16 days total for v1. Keep exercise list simple and repeatable.',
      prefsSummary ? `Onboarding preferences (authoritative): ${prefsSummary}` : '',
      userPrefsText ? `User freeform preferences (non-authoritative): ${userPrefsText}` : ''
    ].filter(Boolean).join('\n');

    const input = {
      profile,
      onboarding_prefs: prefs,
      settings: {
        units: userRow.units,
        intensity_style: userRow.intensity_style,
        days_per_week: prefs.days_per_week ?? profile?.days_per_week ?? 4,
        focus: prefs.goal ?? profile?.focus ?? 'hybrid',
        experience_level: prefs.experience ?? profile?.experience_level ?? 'novice',
        equipment_profile: prefs.equipment ?? profile?.equipment_profile ?? 'full_gym',
        constraints: prefs.constraints ?? ''
      }
    };

    try {
      const text = await callResponsesAPI(input, instructions, { apiKey: openaiKey, model: openaiModel });
      plan = extractJsonBlock(text);
    } catch (e: any) {
      console.error('OpenAI program generation failed:', e?.message || e);
      plan = null;
    }
  }

  if (!plan || !Array.isArray(plan.days)) {
    plan = {
      days: Array.from({ length: 16 }).map((_, i) => {
        const idx = i + 1;
        const week = Math.floor((idx - 1) / 4) + 1;
        const di = ((idx - 1) % 4) + 1;
        const lift = ['bench_press', 'squat', 'deadlift', 'overhead_press'][di - 1];
        const name = lift.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return {
          week_index: week,
          day_index: di,
          name: `Training Day ${idx}`,
          exercises: [
            { slug: lift, name, prescription: { sets: 3, reps: 5, load: 100, rpe: 6 } }
          ]
        };
      })
    };
  }

  const slugs = Array.from(new Set(plan.days.flatMap((d: any) => (d.exercises || []).map((x: any) => x.slug)).filter(Boolean)));
  for (const s of slugs) {
    const nm = String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    await sql(
      `insert into exercises(id,slug,name) values ($1,$2,$3)
       on conflict (slug) do update set name=excluded.name`,
      [crypto.randomUUID(), s, nm]
    );
  }
  const exRows = await many<any>('select id,slug,name from exercises where slug = any($1::text[])', [slugs]);
  const slugToId = new Map<string, string>(exRows.map((r: any) => [r.slug, r.id]));

  let dayCursor = new Date(today.getTime());
  for (const d of plan.days) {
    const pdId = crypto.randomUUID();
    const scheduled = dayCursor.toISOString().slice(0,10);

    await sql(
      `insert into program_days(id,program_id,week_index,day_index,name,scheduled_date)
       values ($1,$2,$3,$4,$5,$6)
       on conflict do nothing`,
      [pdId, programId, d.week_index, d.day_index, d.name, scheduled]
    );

    let order = 1;
    for (const ex of (d.exercises || [])) {
      const exId = slugToId.get(ex.slug);
      if (!exId) continue;
      await sql(
        `insert into day_exercises(id,program_day_id,exercise_id,order_index,prescription)
         values ($1,$2,$3,$4,$5)
         on conflict do nothing`,
        [crypto.randomUUID(), pdId, exId, order, ex.prescription || {}]
      );
      order++;
    }

    dayCursor = new Date(dayCursor.getTime() + 86400000);
  }

  return json(200, { ok: true, program_id: programId });
}
