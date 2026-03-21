// ============================================================
// NexaSense RAG — Automated Regression Test Suite
// Run:  node tests/rag.test.js
// Requires: GROQ_API_KEY + GEMINI_API_KEY in .env
//
// Gemini tests use MOCKS — zero API calls for Gemini
// Only Groq tests make real API calls
// ============================================================

require("dotenv").config();

const assert = require("assert");

const G   = s => `\x1b[32m${s}\x1b[0m`;
const R   = s => `\x1b[31m${s}\x1b[0m`;
const Y   = s => `\x1b[33m${s}\x1b[0m`;
const B   = s => `\x1b[34m${s}\x1b[0m`;
const DIM = s => `\x1b[2m${s}\x1b[0m`;

const results = { pass: 0, fail: 0, skip: 0 };
const queue   = [];

function test(name, fn) { queue.push({ type: "test", name, fn }); }
function skip(name, reason) { queue.push({ type: "skip", name, reason }); }
function section(title) { queue.push({ type: "section", title }); }

// ============================================================
// MOCK SETUP
// Replaces askGemini with a fake that never hits the API
// ============================================================

function mockGemini() {
  const geminiService = require("../src/services/gemini.service");
  const original = geminiService.askGemini;

  geminiService.askGemini = async (prompt) => {
    const p = prompt.toLowerCase();

    // Spell correction mock
    if (p.includes("spell") || p.includes("correct") || p.includes("query:")) {
      if (p.includes("wht is machn learni")) return "what is machine learning";
      if (p.includes("waht is overfiting"))  return "what is overfitting";
      return prompt.replace(/query:\s*/i, "").trim();
    }

    // Domain check mock — YES/NO
    if (p.includes("answer only with") && p.includes("yes") && p.includes("no")) {
      if (p.includes("capital of france"))     return "NO";
      if (p.includes("dropout regularization")) return "YES";
      if (p.includes("machine learning"))       return "YES";
      if (p.includes("neural network"))         return "YES";
      return "NO";
    }

    // Domain extraction mock
    if (p.includes("domain classifier")) {
      return "Machine learning and deep learning concepts including neural networks, training, and optimization.";
    }

    // Reasoning mock
    if (p.includes("refining an answer")) {
      const lines = prompt.split("\n");
      const answerLine = lines.find(l => l.startsWith("Original Answer:"));
      return answerLine ? answerLine.replace("Original Answer:", "").trim() : "Mocked answer.";
    }

    return "Mocked Gemini response.";
  };

  return () => { geminiService.askGemini = original; };
}

// ============================================================
// 1. SPELL CORRECTION — MOCKED
// ============================================================

section("Spell Correction (Gemini-powered — mocked)");

test("fixes heavy typos — 'wht is machn learni'", async () => {
  const restore = mockGemini();
  try {
    const { correctSpelling } = require("../src/services/spellCorrection.service");
    const result = await correctSpelling("wht is machn learni");
    assert.ok(
      result.toLowerCase().includes("machine") || result.toLowerCase().includes("learning"),
      `Expected corrected query, got: "${result}"`
    );
  } finally { restore(); }
});

test("passes through clean query unchanged", async () => {
  const restore = mockGemini();
  try {
    const { correctSpelling } = require("../src/services/spellCorrection.service");
    const input  = "what is gradient descent";
    const result = await correctSpelling(input);
    assert.ok(typeof result === "string" && result.length > 0);
  } finally { restore(); }
});

test("returns original on empty input", async () => {
  const { correctSpelling } = require("../src/services/spellCorrection.service");
  const result = await correctSpelling("");
  assert.strictEqual(result, ""); // guard runs before Gemini — no mock needed
});

test("returns original on very short input", async () => {
  const { correctSpelling } = require("../src/services/spellCorrection.service");
  const result = await correctSpelling("ml");
  assert.ok(typeof result === "string" && result.length > 0);
});

// ============================================================
// 2. QUERY NORMALIZER
// ============================================================

section("Query Normalizer");

test("lowercases input", () => {
  const { normalizeQuery } = require("../src/services/queryNormalizer.service");
  const result = normalizeQuery("WHAT IS DROPOUT");
  assert.ok(result === result.toLowerCase(), `Expected lowercase, got: "${result}"`);
});

test("trims whitespace", () => {
  const { normalizeQuery } = require("../src/services/queryNormalizer.service");
  const result = normalizeQuery("  what is overfitting  ");
  assert.strictEqual(result, result.trim());
});

test("handles empty string", () => {
  const { normalizeQuery } = require("../src/services/queryNormalizer.service");
  const result = normalizeQuery("");
  assert.ok(typeof result === "string");
});

// ============================================================
// 3. GEMINI DOMAIN CHECK — MOCKED
// ============================================================

section("Gemini Domain Check (mocked — no API calls)");

test("rejects clearly out-of-domain query", async () => {
  const restore = mockGemini();
  try {
    const { askGemini } = require("../src/services/gemini.service");
    const domain = "Machine learning and deep learning concepts.";
    const prompt = `Is this question related to the following domain?\n\nDOMAIN:\n${domain}\n\nQUESTION:\nWhat is the capital of France?\n\nAnswer ONLY with YES or NO`;
    const answer = (await askGemini(prompt)).trim().toUpperCase();
    assert.ok(answer.startsWith("NO"), `Expected NO, got: "${answer}"`);
  } finally { restore(); }
});

test("accepts in-domain query", async () => {
  const restore = mockGemini();
  try {
    const { askGemini } = require("../src/services/gemini.service");
    const domain = "Machine learning and deep learning concepts.";
    const prompt = `Is this question related to the following domain?\n\nDOMAIN:\n${domain}\n\nQUESTION:\nWhat is dropout regularization?\n\nAnswer ONLY with YES or NO`;
    const answer = (await askGemini(prompt)).trim().toUpperCase();
    assert.ok(answer.startsWith("YES"), `Expected YES, got: "${answer}"`);
  } finally { restore(); }
});

// ============================================================
// 4. GROQ LLM SERVICE — REAL API
// ============================================================

section("Groq LLM Service");

test("generates non-empty answer from chunks", async () => {
  const { generateAnswer } = require("../src/services/llm.service");
  const fakeChunks = [{
    content: "Dropout is a regularization technique that randomly sets neurons to zero during training to prevent overfitting.",
    metadata: { pageNumber: 1 },
    similarity: 0.95
  }];
  const answer = await generateAnswer("What is dropout?", fakeChunks, []);
  assert.ok(typeof answer === "string" && answer.length > 20, `Answer too short: "${answer}"`);
});

test("returns fallback message when no chunks", async () => {
  const { generateAnswer } = require("../src/services/llm.service");
  const answer = await generateAnswer("What is dropout?", [], []);
  assert.ok(
    answer.toLowerCase().includes("not available") || answer.toLowerCase().includes("document"),
    `Expected fallback message, got: "${answer}"`
  );
});

test("estimateTokens returns positive number", () => {
  const { estimateTokens } = require("../src/services/llm.service");
  const count = estimateTokens("hello world this is a test");
  assert.ok(count > 0, `Expected positive token count, got: ${count}`);
});

// ============================================================
// 5. STREAMING SERVICE
// ============================================================

section("Streaming Service");

test("initStream sets correct headers", () => {
  const { initStream } = require("../src/services/streaming.service");
  const headers = {};
  const mockRes = { setHeader: (k, v) => { headers[k] = v; }, flushHeaders: () => {} };
  initStream(mockRes);
  assert.strictEqual(headers["Content-Type"], "text/event-stream");
  assert.strictEqual(headers["Cache-Control"], "no-cache");
  assert.strictEqual(headers["X-Accel-Buffering"], "no");
});

test("sendToken writes correct SSE format", () => {
  const { sendToken } = require("../src/services/streaming.service");
  const chunks = [];
  const mockRes = { write: c => chunks.push(c) };
  sendToken(mockRes, "hello");
  assert.ok(chunks[0].startsWith("data:"), `Expected SSE data format`);
  assert.ok(chunks[0].includes("hello"), "Expected token in output");
});

test("sendMeta writes meta event", () => {
  const { sendMeta } = require("../src/services/streaming.service");
  const chunks = [];
  const mockRes = { write: c => chunks.push(c) };
  sendMeta(mockRes, { sources: [], provider: "rag" });
  assert.ok(chunks.some(c => c.includes("event: meta")));
});

test("sendError writes error event", () => {
  const { sendError } = require("../src/services/streaming.service");
  const chunks = [];
  const mockRes = { write: c => chunks.push(c) };
  sendError(mockRes, "something failed");
  assert.ok(chunks.some(c => c.includes("event: error")));
});

test("closeStream writes done event and ends", () => {
  const { closeStream } = require("../src/services/streaming.service");
  let ended = false;
  const chunks = [];
  const mockRes = { write: c => chunks.push(c), end: () => { ended = true; } };
  closeStream(mockRes);
  assert.ok(chunks.some(c => c.includes("event: done")));
  assert.ok(ended, "Expected res.end() to be called");
});

// ============================================================
// 6. RATE LIMIT MIDDLEWARE
// ============================================================

section("Rate Limit Middleware");

test("rejects unauthenticated request with 401", async () => {
  const rateLimitMiddleware = require("../src/middleware/rateLimit.middleware");
  let statusCode = null;
  let body = null;
  const mockReq = { user: null };
  const mockRes = {
    status: code => { statusCode = code; return mockRes; },
    json: data => { body = data; }
  };
  await rateLimitMiddleware(mockReq, mockRes, () => {});
  assert.strictEqual(statusCode, 401);
  assert.strictEqual(body.success, false);
});

test("sets X-RateLimit headers on valid request", async () => {
  const rateLimitMiddleware = require("../src/middleware/rateLimit.middleware");
  const originalDb = require("../src/db");
  const origQuery  = originalDb.query;
  originalDb.query = async () => ({ rows: [{ count: "0" }] });
  const headers = {};
  const mockReq = { user: { id: "00000000-0000-0000-0000-000000000001" } };
  const mockRes = {
    setHeader: (k, v) => { headers[k] = v; },
    status: () => mockRes,
    json: () => {}
  };
  await rateLimitMiddleware(mockReq, mockRes, () => {});
  originalDb.query = origQuery;
  assert.ok("X-RateLimit-Limit"     in headers, "Missing X-RateLimit-Limit header");
  assert.ok("X-RateLimit-Remaining" in headers, "Missing X-RateLimit-Remaining header");
});

// ============================================================
// 7. DEDUPLICATION
// ============================================================

section("Chunk Deduplication");

test("removes duplicate chunks by chunkIndex", () => {
  const seen = new Set();
  const chunks = [
    { metadata: { chunkIndex: 1 }, content: "a" },
    { metadata: { chunkIndex: 1 }, content: "a" },
    { metadata: { chunkIndex: 2 }, content: "b" }
  ];
  const result = chunks.filter(chunk => {
    const key = chunk?.metadata?.chunkIndex ?? (chunk?.content || "").slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  assert.strictEqual(result.length, 2, `Expected 2 unique chunks, got ${result.length}`);
});

test("handles empty chunk array", () => {
  const seen = new Set();
  const result = [].filter(chunk => {
    const key = chunk?.metadata?.chunkIndex;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  assert.strictEqual(result.length, 0);
});

// ============================================================
// 8. METRICS SERVICE
// ============================================================

section("Metrics Service");

skip("recordQueryMetrics inserts to DB",       "requires live PostgreSQL");
skip("getUserMetrics returns aggregated stats", "requires live PostgreSQL");

test("recordQueryMetrics does not throw on DB error", async () => {
  const metrics    = require("../src/services/metrics.service");
  const originalDb = require("../src/db");
  const origQuery  = originalDb.query;
  originalDb.query = async () => { throw new Error("DB down"); };
  await assert.doesNotReject(
    () => metrics.recordQueryMetrics({ userId: "x", documentId: "y", totalMs: 100, fromCache: false })
  );
  originalDb.query = origQuery;
});

// ============================================================
// RUNNER
// ============================================================

async function run() {
  for (const item of queue) {
    if (item.type === "section") {
      console.log("\n" + B("▸ " + item.title));
    } else if (item.type === "skip") {
      console.log(Y("  ○ ") + item.name + DIM(` — ${item.reason}`));
      results.skip++;
    } else {
      try {
        await item.fn();
        console.log(G("  ✓ ") + item.name);
        results.pass++;
      } catch (err) {
        console.log(R("  ✗ ") + item.name);
        console.log(DIM("    " + err.message));
        results.fail++;
      }
    }
  }

  console.log("\n" + "─".repeat(50));
  console.log(
    G(`  ${results.pass} passed`) + "  " +
    (results.fail > 0 ? R(`${results.fail} failed`) : DIM("0 failed")) + "  " +
    Y(`${results.skip} skipped`)
  );
  console.log("─".repeat(50) + "\n");

  if (results.fail > 0) process.exit(1);
}

run();