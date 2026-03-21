// ============================================================
// NexaSense RAG Stress Test
// Simulates parallel queries to test backend stability
// Run: node tests/rag.stress.test.js
// ============================================================

require("dotenv").config();

const axios = require("axios");

const API = "http://localhost:3000/api";

const TOKEN = process.env.TEST_TOKEN;   // put JWT here
const DOCUMENT_ID = process.env.TEST_DOC_ID;

const CONCURRENT_USERS = 20;
const TOTAL_REQUESTS = 50;

const questions = [
  "What is machine learning?",
  "Explain dropout regularization",
  "What is gradient descent?",
  "What is overfitting?",
  "Explain neural networks",
  "What is backpropagation?"
];

async function ask(question) {

  try {

    const res = await axios.post(
      `${API}/query`,
      {
        documentId: DOCUMENT_ID,
        question
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`
        }
      }
    );

    return {
      success: true,
      latency: res.data.responseTimeMs || 0,
      provider: res.data.provider
    };

  } catch (err) {

    return {
      success: false,
      error: err.message
    };

  }

}

async function runStressTest() {

  console.log("\nStarting RAG stress test\n");

  const start = Date.now();

  let active = [];
  const results = [];

  for (let i = 0; i < TOTAL_REQUESTS; i++) {

    const q = questions[i % questions.length];

    const task = ask(q).then(r => results.push(r));

    active.push(task);

    if (active.length >= CONCURRENT_USERS) {
      await Promise.all(active);
      active = [];
    }

  }

  if (active.length) {
    await Promise.all(active);
  }

  const duration = Date.now() - start;

  const success = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  const avgLatency =
    results.reduce((a, r) => a + (r.latency || 0), 0) /
    results.length;

  const providers = {};

  results.forEach(r => {
    if (!r.provider) return;
    providers[r.provider] =
      (providers[r.provider] || 0) + 1;
  });

  console.log("=====================================");
  console.log("Total requests:", TOTAL_REQUESTS);
  console.log("Concurrent users:", CONCURRENT_USERS);
  console.log("Success:", success);
  console.log("Failed:", failed);
  console.log("Duration:", duration, "ms");
  console.log("Avg latency:", Math.round(avgLatency), "ms");
  console.log("Providers:", providers);
  console.log("=====================================\n");

}
runStressTest();