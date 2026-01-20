const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, error } = require("./_lib/response");

exports.handler = async (event) => {
  const { user, error: authError } = requireAuth(event);
  if (authError) return authError;
  const date = event.queryStringParameters?.date;
  if (!date) return error(400, "Missing date");
  const store = getUserStore(user.userId);
  const workouts = (await store.get("workouts")) || {};
  const workout = workouts[date];
  return json(200, workout || null);
};
