const crypto = require("crypto");

function requestId(req, res, next) {
  // Correlate logs for easier debugging under concurrency.
  req.requestId = crypto.randomBytes(8).toString("hex");
  next();
}

module.exports = { requestId };

