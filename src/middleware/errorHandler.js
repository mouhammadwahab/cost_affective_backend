// Centralized error handler to keep API responses consistent.
function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;
  const message = err.publicMessage || err.message || "Internal Server Error";
  const requestId = req.requestId;

  // Zod validation errors: respond with 400 and include issues for easier debugging.
  if (err?.name === "ZodError" && Array.isArray(err.issues)) {
    res.status(400).json({
      ok: false,
      error: "Invalid request",
      requestId: requestId || null,
      details: err.issues,
    });
    return;
  }

  // eslint-disable-next-line no-console
  console.error("Request failed", { requestId, status, message, stack: err.stack });

  res.status(status).json({
    ok: false,
    error: message,
    requestId: requestId || null,
  });
}

module.exports = { errorHandler };

