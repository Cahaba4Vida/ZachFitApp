const createTraceId = () =>
  `${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;

const getTraceId = (event) => {
  const header =
    event?.headers?.["x-trace-id"] ||
    event?.headers?.["X-Trace-Id"] ||
    event?.headers?.["x-trace-id".toLowerCase()] ||
    event?.headers?.["x-request-id"] ||
    event?.headers?.["X-Request-Id"];
  return header || createTraceId();
};

const json = (statusCode, body, options = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Trace-Id, X-Request-Id",
    ...(options.traceId
      ? { "X-Trace-Id": options.traceId, "X-Request-Id": options.traceId }
      : {}),
  },
  body: JSON.stringify(body),
});

const error = (statusCode, message, details, options = {}) =>
  json(
    statusCode,
    { error: message, details, statusCode, traceId: options.traceId, requestId: options.traceId },
    options
  );

const ensureTraceHeaders = (response, traceId) => {
  if (!response || typeof response !== "object") return response;
  return {
    ...response,
    headers: {
      ...(response.headers || {}),
      "X-Trace-Id": traceId,
      "X-Request-Id": traceId,
    },
  };
};

const ensureErrorEnvelope = (response, traceId) => {
  if (!response || typeof response !== "object") return response;
  if (!response.statusCode || response.statusCode < 400) return response;

  let body = {};
  try {
    body = response.body ? JSON.parse(response.body) : {};
  } catch (err) {
    body = { error: response.body };
  }

  return {
    ...response,
    headers: {
      ...(response.headers || {}),
      "X-Trace-Id": traceId,
      "X-Request-Id": traceId,
    },
    body: JSON.stringify({
      error: body.error || body.message || "Request failed",
      details: body.details || null,
      statusCode: response.statusCode,
      traceId,
      requestId: traceId,
    }),
  };
};

const withErrorHandling = (handler) => async (event, context) => {
  const traceId = getTraceId(event);
  try {
    const response = await handler(event, context, traceId);
    // Always include request/trace IDs for diagnostics
    const withHeaders = ensureTraceHeaders(response, traceId);
    return ensureErrorEnvelope(withHeaders, traceId);
  } catch (err) {
    const message = err?.message || "Internal server error";
    console.error(`[trace ${traceId}]`, message);
    return json(
      500,
      {
        error: message,
        details: err?.details || null,
        statusCode: 500,
        traceId,
        requestId: traceId,
      },
      { traceId }
    );
  }
};

module.exports = { json, error, getTraceId, withErrorHandling };
