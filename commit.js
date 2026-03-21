const { execSync } = require('child_process');

function commit(files, message) {
  try {
    console.log(`Committing: ${message}`);
    const filesStr = files.join(" ");
    execSync(`git add ${filesStr}`);
    execSync(`git commit -m "${message}"`);
  } catch(e) {
    console.log(`Skipping (no changes or err): ${message}`);
  }
}

// 1. Database and Environment fixes
commit(["schema.sql"], "fix(db): add triggers for search_vector and updated_at");
commit([".gitignore", "package.json", "package-lock.json"], "chore: update dependencies and ignore rules");

// 2. Infrastructure & Docker
commit(["docker-compose.yml", "Dockerfile"], "fix(docker): add worker logs volume and optimize node build");
commit(["frontend/.dockerignore"], "fix(docker): include frontend .env for vite build args");

// 3. Configuration & Caching
commit(["src/config/chroma.js", "src/config/redis.js"], "fix(config): update URL parsing for ChromaDB v3 and Redis Docker compat");
commit(["src/cache/"], "refactor(cache): replace console calls with structured logger and isolate embedder");

// 4. Ingestion Worker
commit(["src/workers/ingestion.worker.js"], "fix(worker): add proper error bubble-up, temp file cleanup, and fix execution order");

// 5. Shared Embedder & Services Refactoring
commit(["src/services/sharedEmbedder.js"], "feat(ai): centralize transformer model into a shared singleton");
commit(["src/services/embedder.service.js", "src/services/vectorSearch.service.js", "src/services/reranker.service.js", "src/services/hyde.service.js"], "refactor(search): migrate all local embedders to sharedEmbedder singleton");
commit(["src/services/"], "refactor(services): enforce structured logging across all feature services");

// 6. RAG Pipeline Main Workflow
commit(["src/pipelines/"], "refactor(pipeline): enforce structural logging throughout retrieval pipeline");

// 7. Frontend
commit(["frontend/vite.config.js"], "fix(ui): proxy Vite dev server to localhost instead of docker backend target");
commit(["frontend/capture.js"], "test(ui): add Puppeteer script for automated UI screenshot capture");

// 8. Documentation
commit(["README.md"], "docs: comprehensively detail architecture, RAG dual-llm flow, and ingestion sequence");

// 9. Everything else
try {
  execSync(`git add .`);
  execSync(`git commit -m "chore: formatting and miscellaneous adjustments"`);
} catch(e) { }

console.log("Git commits complete!");
