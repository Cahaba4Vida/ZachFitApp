const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, error } = require("./_lib/response");
const { parseBody } = require("./_lib/utils");
const { validateSchema } = require("./_lib/schema");

const estimate1Rm = (weight, reps) => Math.round(weight * (1 + reps / 30));

exports.handler = async (event) => {
  const { user, error: authError } = requireAuth(event);
  if (authError) return authError;
  const body = parseBody(event);
  if (!body) return error(400, "Invalid JSON");
  const entry = {
    lift: body.lift,
    weight: Number(body.weight),
    reps: Number(body.reps),
    rpe: body.rpe ?? null,
    date: new Date().toISOString().split("T")[0],
    estimated1Rm: estimate1Rm(Number(body.weight), Number(body.reps)),
  };
  const { valid } = validateSchema("prEntry", entry);
  if (!valid) return error(400, "Invalid PR schema");
  const store = getUserStore(user.userId);
  const prs = (await store.get("prs")) || [];
  const next = [entry, ...prs].slice(0, 50);
  await store.set("prs", next);
  return json(200, entry);
};
