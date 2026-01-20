const { requireAuth } = require("./_lib/auth");
const { getUserStore, getGlobalStore } = require("./_lib/store");
const {json, error, withErrorHandling } = require("./_lib/response");
const { parseBody, nowIso } = require("./_lib/utils");
const { validateSchema } = require("./_lib/schema");

exports.handler = withErrorHandling(async (event) => {
  const { user, error: authError } = requireAuth(event);
  if (authError) return authError;
  const body = parseBody(event);
  if (!body) return error(400, "Invalid JSON");
  const store = getUserStore(user.userId);
  const existing = (await store.get("profile")) || { units: "lb" };
  const profile = {
    ...existing,
    ...body,
    email: user.email,
    updatedAt: nowIso(),
    createdAt: existing.createdAt || nowIso(),
  };
  const { valid } = validateSchema("userProfile", profile);
  if (!valid) {
    return error(400, "Invalid profile schema");
  }
  await store.set("profile", profile);
  if (body.units && existing.units && body.units !== existing.units) {
    const convert = body.units === "kg" ? 1 / 2.20462 : 2.20462;
    const prs = (await store.get("prs")) || [];
    const convertedPrs = prs.map((entry) => ({
      ...entry,
      weight: Number((entry.weight * convert).toFixed(1)),
      estimated1Rm: Number((entry.estimated1Rm * convert).toFixed(1)),
    }));
    await store.set("prs", convertedPrs);
    const workouts = (await store.get("workouts")) || {};
    const convertWorkouts = (data) =>
      Object.fromEntries(
        Object.entries(data).map(([date, workout]) => [
          date,
          {
            ...workout,
            exercises: workout.exercises.map((exercise) => ({
              ...exercise,
              logs: exercise.logs?.map((log) => ({
                ...log,
                weight: log.weight ? Number((log.weight * convert).toFixed(1)) : log.weight,
              })),
            })),
          },
        ])
      );
    await store.set("workouts", convertWorkouts(workouts));
    const logs = (await store.get("workoutLogs")) || {};
    await store.set("workoutLogs", convertWorkouts(logs));
  }
  const globalStore = getGlobalStore();
  const clients = (await globalStore.get("clients")) || [];
  const nextClients = [
    {
      userId: user.userId,
      email: user.email,
      lastLogin: profile.updatedAt,
      goal: profile.onboarding?.goal || "",
    },
    ...clients.filter((client) => client.userId !== user.userId),
  ].slice(0, 200);
  await globalStore.set("clients", nextClients);
  return json(200, profile);
});
