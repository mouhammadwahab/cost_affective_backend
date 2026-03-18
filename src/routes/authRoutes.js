const express = require("express");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { signup, login } = require("../auth/userStore");
const { getJwtSecret } = require("../middleware/authOptional");

const router = express.Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/signup", async (req, res, next) => {
  try {
    const body = signupSchema.parse(req.body);
    const user = await signup(body);
    const token = jwt.sign({ sub: user.id, email: user.email }, getJwtSecret(), {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });
    res.json({ ok: true, token, user });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await login(body);
    const token = jwt.sign({ sub: user.id, email: user.email }, getJwtSecret(), {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });
    res.json({ ok: true, token, user });
  } catch (err) {
    next(err);
  }
});

module.exports = { authRoutes: router };

