const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json } = require("./_lib/response");

exports.handler = async (event) => {
  const { user, error } = requireAuth(event);
  if (error) return error;
  const store = getUserStore(user.userId);
  const profile = (await store.get("profile")) || { units: "lb" };
  return json(200, profile);
};
