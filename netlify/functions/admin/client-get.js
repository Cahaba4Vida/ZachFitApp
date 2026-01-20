const { requireAuth, isAdmin } = require("../_lib/auth");
const { getUserStore } = require("../_lib/store");
const {json, error, withErrorHandling } = require("../_lib/response");

exports.handler = withErrorHandling(async (event) => {
  const { user, error: authError } = requireAuth(event);
  if (authError) return authError;
  if (!isAdmin(user)) return error(403, "Forbidden");
  const userId = event.queryStringParameters?.userId;
  if (!userId) return error(400, "Missing userId");
  const store = getUserStore(userId);
  const profile = await store.get("profile");
  const program = await store.get("program");
  const workouts = (await store.get("workouts")) || {};
  const prs = (await store.get("prs")) || [];
  const workoutLogs = (await store.get("workoutLogs")) || {};
  const today = new Date().toISOString().split("T")[0];
  const todayWorkout = workouts[today] || null;
  return json(200, {
    userId,
    email: profile?.email || profile?.contactEmail || "",
    profile,
    program,
    workouts,
    prs,
    workoutLogs,
    todayWorkout,
  });
});
