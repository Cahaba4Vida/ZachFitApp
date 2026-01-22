const getHeader = (headers, name) => {
  if (!headers) return undefined;
  const key = Object.keys(headers).find(
    (header) => header.toLowerCase() === name.toLowerCase()
  );
  return key ? headers[key] : undefined;
};

const unauthorized = (message = "Missing or invalid admin token") => ({
  statusCode: 401,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    ok: false,
    error: message,
  }),
});

const requireAdmin = (event) => {
  const expected = process.env.ADMIN_AUTH_TOKEN;
  const provided = getHeader(event.headers, "x-admin-token");

  if (!expected || !provided || provided !== expected) {
    return unauthorized();
  }

  return null;
};

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

module.exports = {
  getHeader,
  jsonResponse,
  requireAdmin,
};
