require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const PQueue = require("p-queue").default;

const { requestId } = require("./middleware/requestId");
const { authOptional } = require("./middleware/authOptional");
const { errorHandler } = require("./middleware/errorHandler");
const { createAskRouter } = require("./routes/askRoutes");
const { createHealthRouter } = require("./routes/healthRoutes");
const { authRoutes } = require("./routes/authRoutes");
const { createHistoryRouter } = require("./routes/historyRoutes");

const app = express();

const port = parseInt(process.env.PORT || "3000", 10);

app.use(helmet());
// Prototype CORS: allow browser calls from Netlify.
// Credentials are not needed because we use Authorization headers (not cookies).
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: false,
  })
);
app.use(express.json({ limit: process.env.JSON_LIMIT || "2mb" }));
app.use(requestId);
app.use(authOptional);

// Routes
const maxConcurrentAI = parseInt(process.env.MAX_CONCURRENT_AI || "3", 10);
const aiQueue = new PQueue({ concurrency: maxConcurrentAI });

app.use("/", createHealthRouter({ aiQueue }));
app.use("/auth", authRoutes);
app.use("/", createHistoryRouter());
app.use("/", createAskRouter({ aiQueue }));

// Frontend (optional): serve static dashboard if present.
const frontendDir = path.join(__dirname, "../../frontend");
app.use(express.static(frontendDir));

// Error handler must be last.
app.use(errorHandler);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`AI prototype backend listening on http://localhost:${port}`);
});

