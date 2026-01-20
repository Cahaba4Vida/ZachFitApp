const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json, withErrorHandling } = require("./_lib/response");

exports.handler = withErrorHandling(async (event) => {
  const { user, error } = requireAuth(event);
  if (error) return error;
  const store = getUserStore(user.userId);
  const prs = (await store.get("prs")) || [];
  const stats = prs.reduce((acc, entry) => {
    const current = acc[entry.lift] || { max1Rm: 0, entries: 0 };
    current.max1Rm = Math.max(current.max1Rm, entry.estimated1Rm);
    current.entries += 1;
    acc[entry.lift] = current;
    return acc;
  }, {});
  return json(200, stats);
});
