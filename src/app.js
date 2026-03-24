// ============================================================
// app.js
// NexaSense AI Assistant v2.1
// Production-ready Express server
// ============================================================

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const compression = require("compression");

const logger = require("./utils/logger");

// Routes
const authRoutes = require("./routes/auth.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const uploadRoutes = require("./routes/upload.routes");
const queryRoutes = require("./routes/query.routes");
const documentRoutes = require("./routes/document.routes");
const conversationRoutes = require("./routes/conversation.routes");
const streamRoutes = require("./routes/stream.routes");
const adminRoutes = require("./routes/admin.routes");

// ✅ ADD THIS
const paymentRoutes = require("./routes/payment.routes");

const app = express();

// ============================================================
// Trust proxy (important for Docker / nginx)
// ============================================================

app.set("trust proxy", 1);

// ============================================================
// Security middleware
// ============================================================

app.use(helmet());

// ============================================================
// Compression
// ============================================================

app.use(
  compression({
    filter: (req, res) => {
      if (req.headers["accept"] === "text/event-stream") {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

// ============================================================
// CORS
// ============================================================

app.use(
  cors({
    origin: process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(",")
      : true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ============================================================
// Body Parsers
// ============================================================

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ============================================================
// HTTP Logging
// ============================================================

app.use(
  morgan("combined", {
    stream: {
      write: (msg) => logger.info(msg.trim()),
    },
  })
);

// ============================================================
// Global Rate Limiter
// ============================================================

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Please slow down.",
  },
});

app.use(globalLimiter);

// ============================================================
// Auth Rate Limiter
// ============================================================

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many auth attempts. Try again later.",
  },
});

// ============================================================
// Health Endpoints
// ============================================================

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "NexaSense API",
    version: "2.1.0",
    message: "RAG AI assistant server running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + "s",
  });
});

// ============================================================
// API Routes
// ============================================================

// Authentication (public)
app.use("/api/auth", authLimiter, authRoutes);

// Documents
app.use("/api", documentRoutes);

// Upload
app.use("/api/upload", uploadRoutes);

// Queries
app.use("/api", queryRoutes);

// Streaming
app.use("/api", streamRoutes);

// Conversations
app.use("/api", conversationRoutes);

// Dashboard
app.use("/api/dashboard", dashboardRoutes);

// Admin
app.use("/api/admin", adminRoutes);

// ✅ ADD THIS (PAYMENTS ROUTES)
app.use("/api/payments", paymentRoutes);

// ============================================================
// 404 Handler
// ============================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ============================================================
// Global Error Handler
// ============================================================

app.use((err, req, res, next) => {
  logger.error("[App] Unhandled error:", err.stack || err.message);

  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error",
  });
});

module.exports = app;