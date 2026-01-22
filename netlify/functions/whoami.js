const { requireAuth, isAdmin } = require("./_lib/auth");
const { getUserStore, getGlobalStore } = require("./_lib/store");
const { json, withErrorHandling } = require("./_lib/response");
const { nowIso } = require("./_lib/utils");

exports.handler = withErrorHandling(async (event) => {
  const { user, error } = await requireAuth(event);
  if (error) return error;
  const store = getUserStore(user.userId);
  const profile = (await store.get("profile")) || { units: "lb" };
  const globalStore = getGlobalStore();
  const clients = (await globalStore.get("clients")) || [];
  const nextClients = [
    {
      userId: user.userId,
      email: user.email,
      lastLogin: nowIso(),
      goal: profile.onboarding?.goal || "",
    },
    ...clients.filter((client) => client.userId !== user.userId),
  ].slice(0, 200);
  await globalStore.set("clients", nextClients);
  return json(200, {
    user: {
      userId: user.userId,
      email: user.email,
      role: isAdmin(user) ? "admin" : "user",
    },
    profile,
  });
});
