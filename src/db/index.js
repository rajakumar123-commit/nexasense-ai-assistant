const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.connect((err, client, release) => {
  if (err) {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  }
  console.log("✅ PostgreSQL connected");
  release();
});

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err.message);
});

module.exports = { pool };