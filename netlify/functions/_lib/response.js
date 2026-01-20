const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  },
  body: JSON.stringify(body),
});

const error = (statusCode, message) =>
  json(statusCode, { error: message, statusCode });

const withErrorHandling = (handler) => async (event) => {
  try {
    return await handler(event);
  } catch (err) {
    console.error("Unhandled function error", err);
    const message = err?.expose ? err.message : "Server error";
    return json(500, { error: message, statusCode: 500 });
  }
};

module.exports = { json, error, withErrorHandling };
