require("dotenv").config();

const app = require("./app");
const { pool } = require("./db");        // FIX: destructure correctly

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
   await pool.query("SELECT NOW()");
console.log("✅ PostgreSQL connected and healthy");

    app.listen(PORT, () => {
      console.log(`🚀 NexaSense running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });

  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1);
  }
}

startServer();