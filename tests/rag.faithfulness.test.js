// ============================================================
// rag.faithful.test.js
// NexaSense — RAG Faithfulness Test
// Ensures answers come from retrieved context
//
// Requires: Docker running + ml.pdf uploaded and ready
// Run: node tests/rag.faithful.test.js
// ============================================================

require("dotenv").config();

const assert = require("assert");
const db     = require("../src/db");

const G   = s => `\x1b[32m${s}\x1b[0m`;
const R   = s => `\x1b[31m${s}\x1b[0m`;
const B   = s => `\x1b[34m${s}\x1b[0m`;
const DIM = s => `\x1b[2m${s}\x1b[0m`;

// FIX 1: correct path — pipelines (plural)
const { runRetrievalPipeline } = require("../src/pipelines/retrieval.pipeline");

async function run() {

  console.log("\n" + B("▸ RAG Faithfulness Test") + "\n");

  // FIX 2: get real documentId from DB
  const { rows } = await db.query(
    `SELECT id, user_id FROM documents
     WHERE status = 'ready'
     LIMIT 1`
  );

  if (!rows.length) {
    console.log(R("  ✗ No ready documents found — upload ml.pdf first"));
    await db.pool.end();
    process.exit(1);
  }

  const documentId = rows[0].id;
  const userId     = rows[0].user_id;

  console.log(DIM(`  Using document: ${documentId}\n`));

  const questions = [
    "What is gradient descent?",
    "What is overfitting?",
    "What is machine learning?"
  ];

  let passed = 0;
  let failed = 0;

  for (const question of questions) {

    try {

      const result = await runRetrievalPipeline({
        userId,
        documentId,
        question
      });

      // Answer must exist
      assert.ok(result.answer?.length > 10,
        "Answer too short or empty"
      );

      // If RAG path — must have sources
      if (!result.provider || result.provider === "rag") {
        assert.ok(
          result.sources?.length > 0,
          "RAG answer has no sources — not grounded"
        );
        assert.ok(
          result.chunksUsed > 0,
          "chunksUsed is 0 — answer not from document"
        );
      }

      // Answer must not be a hallucination signal
      const lower = result.answer.toLowerCase();
      const hallucination = [
        "as an ai language model",
        "i don't have access",
        "my training data",
        "i cannot provide"
      ].some(s => lower.includes(s));

      assert.ok(!hallucination,
        `Hallucination detected in answer: "${result.answer.slice(0, 100)}"`
      );

      console.log(G("  ✓ ") + question);
      console.log(DIM(`    sources: ${result.sources?.length || 0} | chunks: ${result.chunksUsed} | provider: ${result.provider || "rag"}`));
      passed++;

    } catch (err) {
      console.log(R("  ✗ ") + question);
      console.log(DIM("    " + err.message));
      failed++;
    }

  }

  console.log("\n" + "─".repeat(50));
  console.log(
    G(`  ${passed} passed`) + "  " +
    (failed > 0 ? R(`${failed} failed`) : DIM("0 failed"))
  );
  console.log("─".repeat(50) + "\n");

  await db.pool.end();
  if (failed > 0) process.exit(1);

}

run();