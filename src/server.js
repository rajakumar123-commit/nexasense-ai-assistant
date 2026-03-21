require("dotenv").config();

const app  = require("./app");
const { pool } = require("./db");

const PORT = process.env.PORT || 3000;

async function startServer() {

  // Verify DB is ready before accepting traffic
  try {
    await pool.query("SELECT NOW()");
    console.log("✅ PostgreSQL connected and healthy");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1);
  }

  // Start HTTP server separately — different error message
  app.listen(PORT, () => {
    console.log(`🚀 NexaSense running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  }).on("error", (err) => {
    console.error("❌ Server failed to start:", err.message);
    process.exit(1);
  });

}

startServer();