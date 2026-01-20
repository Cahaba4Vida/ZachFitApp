const { error } = require("./response");

const decodeJwt = (token) => {
  try {
    const payload = token.split(".")[1];
    const decoded = Buffer.from(payload, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (err) {
    return null;
  }
};

const getUser = (event) => {
  const header = event.headers.authorization || event.headers.Authorization;
  if (!header) return null;
  const token = header.replace("Bearer ", "");
  const payload = decodeJwt(token);
  if (!payload) return null;
  return {
    userId: payload.sub,
    email: payload.email,
    token,
  };
};

const requireAuth = (event) => {
  const user = getUser(event);
  if (!user) {
    return { error: error(401, "Unauthorized"), user: null };
  }
  return { user };
};

const isAdmin = (user) => {
  const allowlist = process.env.ADMIN_EMAIL_ALLOWLIST || "edwardszachary647@gmail.com";
  return allowlist.split(",").map((item) => item.trim()).includes(user.email);
};

module.exports = { getUser, requireAuth, isAdmin };
