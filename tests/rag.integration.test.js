// ============================================================
// NexaSense RAG Integration Test
// Tests multi-document retrieval pipeline
// ============================================================

require("dotenv").config();

const assert = require("assert");

const { runRetrievalPipeline } =
  require("../src/pipeline/retrieval.pipeline");

async function runTest() {

  console.log("\nRunning RAG integration test\n");

  const result = await runRetrievalPipeline({

    userId: "test-user",

    question: "Explain neural networks"

  });

  console.log("Pipeline result:", result);

  assert.ok(result.answer, "Missing answer");

  assert.ok(
    typeof result.chunksRetrieved === "number",
    "Missing chunksRetrieved"
  );

  assert.ok(
    typeof result.chunksUsed === "number",
    "Missing chunksUsed"
  );

  assert.ok(
    Array.isArray(result.sources),
    "Sources should be array"
  );

  console.log("\nIntegration test passed\n");

}

runTest();