const { jsonResponse, requireAdmin } = require("./lib/auth");
const { leaders, teams } = require("./lib/constants");

exports.handler = async (event) => {
  const authError = requireAdmin(event);
  if (authError) return authError;

  return jsonResponse(200, {
    ok: true,
    leaders,
    teams,
  });
};
