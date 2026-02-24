const { json } = require("./_util");
const { requireUser } = require("./_auth");
const { enforceAiActionLimit } = require("./_plan");
const { responsesCreate, outputText } = require("./_openai");

function prettyGoal(g) {
  const m = {
    build_muscle: "Build muscle (hypertrophy)",
    get_stronger: "Get stronger (general strength)",
    powerlifting_prep: "Powerlifting prep",
    fat_loss_lifting: "Fat loss while lifting",
    athletic_performance: "Athletic performance",
    beginner_foundation: "Beginner foundation"
  };
  return m[g] || g || "Build muscle (hypertrophy)";
}

function prettyExp(x) {
  const m = { beginner: "Beginner (0–1 years)", intermediate: "Intermediate (1–3 years)", advanced: "Advanced (3+ years)" };
  return m[x] || x || "Beginner (0–1 years)";
}

function prettyEquip(x) {
  const m = {
    full_gym: "Full gym",
    dumbbells_only: "Dumbbells only",
    barbell_rack: "Barbell + rack",
    home_minimal: "Home minimal",
    machines_preferred: "Machines preferred"
  };
  return m[x] || x || "Full gym";
}

exports.handler = async (event, context) => {
  if (event.httpMethod && event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const auth = await requireUser(event, context);
  if (!auth.ok) return auth.response;

  const limit = await enforceAiActionLimit(auth.user.userId, "ai_training_plan_generate");
  if (!limit.ok) return limit.response;

  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch { body = {}; }

  const goal = body.goal || "build_muscle";
  const experience = body.experience || "beginner";
  const daysPerWeek = Math.min(6, Math.max(2, Number(body.days_per_week || 4)));
  const equipment = body.equipment || "full_gym";

  const prompt = `
You are Aethon, an elite strength coach. Create a complete 4-week training program.

User inputs:
- Goal: ${prettyGoal(goal)}
- Experience: ${prettyExp(experience)}
- Days per week: ${daysPerWeek}
- Equipment: ${prettyEquip(equipment)}

Requirements:
- Output two sections:
  1) PLAN (TEXT) — a clean human-readable 4-week program.
  2) PLAN (JSON) — strict JSON (no markdown fences) with keys:
     {
       "meta": { "goal": string, "experience": string, "days_per_week": number, "equipment": string, "program_length_weeks": 4 },
       "weeks": [
         { "week": 1, "days": [ { "day": 1, "name": string, "exercises": [ { "name": string, "sets": number, "reps": string, "rpe": string, "rest_sec": number, "notes": string } ] } ] },
         ... week 4
       ],
       "progression": { "method": string, "rules": [string] }
     }
- Program design:
  - If 2–3 days: full body emphasis.
  - If 4 days: upper/lower.
  - If 5–6 days: PPL or PPL+Upper/Lower.
- Keep exercises realistic for the equipment.
- Use RPE targets and simple progressive overload across weeks (add 1 rep per set or +2.5–5 lb where appropriate).
- Include a short warmup note per day (as notes on first exercise).
- Keep it practical: 6–9 exercises/day max.
- Avoid medical advice.

Make the TEXT section concise but complete: list Week 1–4, day names, exercises with sets x reps @ RPE, rest. Then include progression rules.
`;

  try {
    const resp = await responsesCreate({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: prompt,
      temperature: 0.4,
      max_output_tokens: 1800
    });

    const text = outputText(resp) || "";
    return json(200, { plan_text: text });
  } catch (e) {
    return json(e.statusCode || 500, { error: e.message || "Failed to generate training plan" });
  }
};
