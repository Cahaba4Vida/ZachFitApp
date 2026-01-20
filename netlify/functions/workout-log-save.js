const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, error, withErrorHandling } = require("./_lib/response");
const { parseBody } = require("./_lib/utils");
const { validateSchema } = require("./_lib/schema");

exports.handler = withErrorHandling(async (event) => {
  const { user, error: authError } = requireAuth(event);
  if (authError) return authError;
  const date = event.queryStringParameters?.date;
  if (!date) return error(400, "Missing date");
  const body = parseBody(event);
  if (!body?.workout) return error(400, "Missing workout");
  const { valid } = validateSchema("workoutDay", body.workout);
  if (!valid) return error(400, "Invalid workout schema");
  const store = getUserStore(user.userId);
  const workouts = (await store.get("workouts")) || {};
  workouts[date] = { ...body.workout, date };
  await store.set("workouts", workouts);
  const logs = (await store.get("workoutLogs")) || {};
  logs[date] = { ...body.workout, date };
  await store.set("workoutLogs", logs);
  return json(200, workouts[date]);
});
