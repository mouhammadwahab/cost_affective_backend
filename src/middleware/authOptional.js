const jwt = require("jsonwebtoken");

function getJwtSecret() {
  return process.env.JWT_SECRET || "dev-secret-change-me";
}

// Optional auth: if Authorization header is present and valid, attach req.userId.
// Otherwise, keep req.userId as null and allow the request to continue.
function authOptional(req, res, next) {
  req.userId = null;

  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return next();

  const token = match[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.userId = decoded.sub || decoded.userId || null;
    return next();
  } catch {
    // Invalid token should not block the /ask prototype; treat as anonymous.
    return next();
  }
}

module.exports = { authOptional, getJwtSecret };

