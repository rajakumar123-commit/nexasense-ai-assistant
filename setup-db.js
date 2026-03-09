require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

async function setup() {
  console.log("Setting up NexaSense database...\n");

  const adminPool = new Pool({
    user: "postgres",
    password: process.env.DB_PASSWORD,
    host: "127.0.0.1",
    port: 5432,
    database: "postgres"
  });

  try {
    await adminPool.query("CREATE DATABASE nexasense");
    console.log("✅ Database nexasense created");
  } catch (e) {
    if (e.message.includes("already exists")) {
      console.log("ℹ️  Database already exists — skipping");
    } else {
      console.error("❌ Failed:", e.message);
      process.exit(1);
    }
  } finally {
    await adminPool.end();
  }

  const pool = new Pool({
    user: "postgres",
    password: process.env.DB_PASSWORD,
    host: "127.0.0.1",
    port: 5432,
    database: "nexasense"
  });

  try {
    // NO vector extension — using chromadb instead
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    console.log("✅ uuid-ossp enabled");

    const sql = fs.readFileSync(
      path.join(__dirname, "src/db/migrations/001_vector_schema.sql"),
      "utf8"
    );
    await pool.query(sql);
    console.log("✅ All tables created");

    const { rows } = await pool.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log("\n📋 Tables created:");
    rows.forEach(r => console.log("   →", r.tablename));
    console.log("\n🚀 Database ready!");

  } catch (e) {
    console.error("❌ Error:", e.message);
  } finally {
    await pool.end();
  }
}

setup();