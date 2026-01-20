const { requireAuth, isAdmin } = require("../_lib/auth");
const { getGlobalStore } = require("../_lib/store");
const { json, error } = require("../_lib/response");

exports.handler = async (event) => {
  const { user, error: authError } = requireAuth(event);
  if (authError) return authError;
  if (!isAdmin(user)) return error(403, "Forbidden");
  const store = getGlobalStore();
  const clients = (await store.get("clients")) || [];
  return json(200, { clients });
};
