const bcrypt = require("bcryptjs");

// Prototype-only in-memory store.
// For real persistence, replace this with Firestore or another DB.
const usersByEmail = new Map();

function createUserId() {
  // Short unique id for logging.
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

async function signup({ email, password }) {
  const normalizedEmail = String(email || "").toLowerCase().trim();
  if (!normalizedEmail) throw Object.assign(new Error("Email is required"), { statusCode: 400 });
  if (typeof password !== "string" || password.length < 6) {
    throw Object.assign(new Error("Password must be at least 6 characters"), { statusCode: 400 });
  }
  if (usersByEmail.has(normalizedEmail)) {
    throw Object.assign(new Error("Email already exists"), { statusCode: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = { id: createUserId(), email: normalizedEmail, passwordHash };
  usersByEmail.set(normalizedEmail, user);
  return { id: user.id, email: user.email };
}

async function login({ email, password }) {
  const normalizedEmail = String(email || "").toLowerCase().trim();
  const user = usersByEmail.get(normalizedEmail);
  if (!user) throw Object.assign(new Error("Invalid email or password"), { statusCode: 401 });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw Object.assign(new Error("Invalid email or password"), { statusCode: 401 });
  return { id: user.id, email: user.email };
}

module.exports = { signup, login };

