const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const logger = require("./utils/logger");
const conversationRoutes = require("./routes/conversation.routes");
const uploadRoutes = require("./routes/upload.routes");
const queryRoutes = require("./routes/query.routes");
const documentRoutes = require("./routes/document.routes");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.urlencoded({ extended: true }));


// HTTP request logging
app.use(
  morgan("combined", {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  })
);


// ─────────────────────────────
// Routes
// ─────────────────────────────
app.use("/api/upload", uploadRoutes);
app.use("/api", queryRoutes);
app.use("/api", documentRoutes);
app.use("/api", conversationRoutes);

// ─────────────────────────────
// Health check
// ─────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "NexaSense API",
    message: "RAG server running"
  });
});


// ─────────────────────────────
// 404 handler
// ─────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found"
  });
});


// ─────────────────────────────
// Global error handler
// ─────────────────────────────
app.use((err, req, res, next) => {

  logger.error(err.stack || err.message);

  res.status(500).json({
    error: err.message || "Internal server error"
  });

});

module.exports = app;