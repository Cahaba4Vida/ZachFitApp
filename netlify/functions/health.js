const { jsonResponse, requireAdmin } = require("./lib/auth");

exports.handler = async (event) => {
  const authError = requireAdmin(event);
  if (authError) return authError;

  return jsonResponse(200, {
    ok: true,
    timestamp: new Date().toISOString(),
    version: "v1",
  });
};
