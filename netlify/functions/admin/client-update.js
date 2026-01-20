const { requireAuth, isAdmin } = require("../_lib/auth");
const { getUserStore } = require("../_lib/store");
const {json, error, withErrorHandling } = require("../_lib/response");
const { parseBody, nowIso } = require("../_lib/utils");
const { validateSchema } = require("../_lib/schema");

exports.handler = withErrorHandling(async (event) => {
  const { user, error: authError } = requireAuth(event);
  if (authError) return authError;
  if (!isAdmin(user)) return error(403, "Forbidden");
  const body = parseBody(event);
  const userId = body?.userId;
  if (!userId) return error(400, "Missing userId");
  const store = getUserStore(userId);
  if (body.program) {
    const program = { ...body.program, updatedAt: nowIso() };
    const { valid } = validateSchema("program", program);
    if (!valid) return error(400, "Invalid program schema");
    await store.set("program", program);
  }
  if (body.workouts) {
    const entries = Object.values(body.workouts);
    const validWorkouts = entries.every((workout) => validateSchema("workoutDay", workout).valid);
    if (!validWorkouts) return error(400, "Invalid workout schema");
    await store.set("workouts", body.workouts);
  }
  return json(200, { ok: true });
});
