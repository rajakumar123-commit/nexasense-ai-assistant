<div align="center">

# NexaSense AI Assistant

### Retrieval-Augmented Generation (RAG) powered document intelligence

*Upload any PDF. Ask anything. Get precise, source-grounded answers.*

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-FF6B35?style=flat-square&logo=databricks&logoColor=white)](https://trychroma.com)
[![Groq](https://img.shields.io/badge/Groq-F55036?style=flat-square&logo=groq&logoColor=white)](https://groq.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

<br/>

[**Features**](#-features) · [**Architecture**](#-system-architecture) · [**Setup**](#-setup) · [**API**](#-api-reference) · [**How It Works**](#-how-it-works)

</div>

---

## What is NexaSense?

NexaSense is a production-ready **Retrieval-Augmented Generation (RAG)** system that transforms static PDF documents into an interactive, queryable knowledge base.

Instead of sending entire documents to an LLM (slow, expensive, hallucination-prone), NexaSense uses a **multi-stage retrieval pipeline** to find only the most relevant sections before generating a grounded answer.

```
Without RAG:  User → [Entire 200-page PDF] → LLM → Slow + Expensive + Hallucinated
With RAG:     User → [Top 5 Relevant Chunks] → LLM → Fast + Accurate + Grounded
```

---

## Features

<table>
<tr>
<td><b>Hybrid Retrieval</b><br/>Combines vector similarity + PostgreSQL keyword search for maximum recall</td>
<td><b>Neural Reranking</b><br/>Re-scores candidate chunks with a bi-encoder model before LLM generation</td>
</tr>
<tr>
<td><b>Query Rewriting</b><br/>Automatically improves ambiguous questions for better retrieval</td>
<td><b>Conversation Memory</b><br/>Maintains full multi-turn context across a conversation session</td>
</tr>
<tr>
<td><b>Query Caching</b><br/>Instantly returns cached answers for repeated questions — zero LLM cost</td>
<td><b>Async PDF Ingestion</b><br/>Background queue keeps uploads fast while embeddings generate</td>
</tr>
</table>

---

## System Architecture

```mermaid
flowchart TD
    A[User Question] --> B[Express API]
    B --> C[Query Cache]
    C -->|Cache HIT| K[Answer and Sources]
    B -->|Cache MISS| D[Query Rewriter]
    D --> E[Vector Search ChromaDB]
    D --> F[Keyword Search PostgreSQL]
    E --> G[Merge and Deduplicate]
    F --> G
    G -->|Top 15 candidates| H[Neural Reranker]
    H -->|Top 5 chunks| I[Groq LLM]
    I --> K
```

---

## Document Ingestion Pipeline

```mermaid
flowchart LR
    A[Upload PDF] --> B[Text Extraction]
    B --> C[Recursive Chunking]
    C --> D[Embedding Generation via Transformers.js]
    D --> E[Store Vectors in ChromaDB]
    D --> F[Store Metadata in PostgreSQL]
```

---

## Query Processing Flow

```mermaid
sequenceDiagram
    actor User
    participant API as Express API
    participant Cache as Query Cache
    participant QR as Query Rewriter
    participant ChromaDB as ChromaDB
    participant PG as PostgreSQL
    participant RR as Neural Reranker
    participant LLM as Groq LLM

    User->>API: POST /api/query
    API->>Cache: Check cache

    alt Cache HIT
        Cache-->>API: Cached result
        API-->>User: Return cached response
    else Cache MISS
        API->>QR: Rewrite question
        QR-->>API: Optimized query
        API->>ChromaDB: Vector search
        API->>PG: Keyword search
        ChromaDB-->>API: Vector results
        PG-->>API: Keyword results
        API->>API: Merge and deduplicate top 15
        API->>RR: Rerank top 15 chunks
        RR-->>API: Top 5 chunks
        API->>LLM: Send context and question
        LLM-->>API: Grounded answer
        API->>Cache: Store result
        API-->>User: Answer and Sources
    end
```

---

## How It Works

### Why RAG over full-document LLM?

| Problem | Without RAG | With RAG |
|---|---|---|
| Token cost | Entire document sent every query | Only 5 relevant chunks |
| Latency | High — large prompt | Low — small focused prompt |
| Accuracy | Hallucinations from irrelevant content | Grounded in retrieved context |
| Scalability | Fails on large documents | Scales to any document size |

### Why Hybrid Search?

Vector search and keyword search catch different things:

```
Query: "TCP congestion control algorithm"

Vector Search  →  "Network protocols manage data flow using adaptive methods"
                  (semantic match — right topic, different words)

Keyword Search →  "TCP congestion control uses slow start and AIMD"
                  (exact match — precise technical terms)

Hybrid         →  Best of both
```

### Why Reranking?

Initial retrieval casts a wide net (15 chunks). The reranker uses a neural model to score each chunk's true relevance to the query, then passes only the top 5 to the LLM — improving answer precision and reducing hallucinations.

---

## Project Structure

```
nexasense/
├── src/
│   ├── cache/
│   │   └── queryCache.js              # In-memory query result cache
│   ├── config/
│   │   └── chroma.js                  # ChromaDB client configuration
│   ├── controllers/
│   │   ├── document.controller.js     # Document CRUD endpoints
│   │   ├── query.controller.js        # Query handling + response formatting
│   │   └── upload.controller.js       # PDF upload handling
│   ├── db/
│   │   ├── migrations/                # PostgreSQL schema migrations
│   │   └── index.js                   # DB connection pool
│   ├── middleware/
│   │   └── upload.middleware.js       # Multer file validation
│   ├── pipelines/
│   │   └── retrieval.pipeline.js      # Core RAG orchestration
│   ├── queue/
│   │   └── ingestion.queue.js         # Async embedding queue
│   ├── routes/
│   │   ├── conversation.routes.js
│   │   ├── document.routes.js
│   │   ├── query.routes.js
│   │   └── upload.routes.js
│   ├── services/
│   │   ├── conversation.service.js    # Conversation history management
│   │   ├── document.service.js        # Document metadata operations
│   │   ├── embedder.service.js        # Transformers.js embedding generation
│   │   ├── keywordSearch.service.js   # PostgreSQL full-text search
│   │   ├── llm.service.js             # Groq LLM integration
│   │   ├── queryRewrite.service.js    # Query optimization
│   │   ├── reranker.service.js        # Neural reranking
│   │   └── vectorSearch.service.js    # ChromaDB semantic search
│   ├── utils/
│   │   ├── recursiveChunk.js          # Semantic text chunking
│   │   └── logger.js                  # Request/response logging
│   ├── app.js                         # Express app + middleware setup
│   └── server.js                      # Entry point
├── .env.example
├── package.json
└── README.md
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **API** | Node.js + Express | REST API server |
| **Embeddings** | Transformers.js `all-MiniLM-L6-v2` | Semantic chunk embeddings |
| **Reranker** | Transformers.js `all-MiniLM-L6-v2` | Chunk relevance scoring |
| **LLM** | Groq API | Answer generation |
| **Vector DB** | ChromaDB | Semantic similarity search |
| **Relational DB** | PostgreSQL | Metadata + keyword search + conversations |
| **Queue** | In-process async queue | Background document ingestion |

---

## Setup

### Prerequisites

- Node.js v18+
- PostgreSQL 14+
- ChromaDB running locally
- Groq API key from [console.groq.com](https://console.groq.com)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/nexasense.git
cd nexasense
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/nexasense
GROQ_API_KEY=your_groq_api_key
CHROMA_URL=http://localhost:8000
```

### 3. Run migrations

```bash
npm run migrate
```

### 4. Start ChromaDB

```bash
pip install chromadb
chroma run --host localhost --port 8000
```

### 5. Start NexaSense

```bash
# Development (hot reload)
npm run dev

# Production
npm start
```

---

## API Reference

### Upload a document

```http
POST /api/upload
Content-Type: multipart/form-data
```

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@document.pdf"
```

**Response**
```json
{
  "success": true,
  "documentId": "2f1e6f43-c1b2-47e7-bd51-0eb0b5bfc124",
  "message": "Document queued for ingestion"
}
```

---

### Query a document

```http
POST /api/query
Content-Type: application/json
```

```json
{
  "documentId": "2f1e6f43-c1b2-47e7-bd51-0eb0b5bfc124",
  "conversationId": "ea105108-0b98-4c4d-9649-67c120020f42",
  "question": "What is machine learning?"
}
```

**Response**
```json
{
  "success": true,
  "question": "What is machine learning?",
  "answer": "Machine learning is programming computers to optimize a performance criterion using example data or past experience.",
  "sources": [
    {
      "sourceIndex": 1,
      "chunkIndex": 7,
      "pageNumber": 1,
      "similarity": 0.74,
      "preview": "Machine learning is a subset of AI that enables systems to learn from data..."
    }
  ],
  "fromCache": false,
  "responseTimeMs": 3410,
  "tokenEstimate": 253
}
```

---

### Get conversation history

```http
GET /api/conversation/:conversationId
```

---

## Performance Considerations

| Metric | Description | Target |
|---|---|---|
| **Retrieval Precision** | Relevant chunks / total retrieved | > 0.8 |
| **End-to-End Latency** | Question to Answer (cold) | < 5s |
| **Cached Latency** | Question to Answer (cached) | < 50ms |

**Chunk size** — Smaller chunks give precise retrieval but may lose surrounding context. Larger chunks preserve context but reduce retrieval accuracy. NexaSense uses recursive chunking to balance both.

**Reranker cost** — Running a neural reranker adds ~200–400ms but measurably improves the quality of chunks passed to the LLM, reducing hallucinations.

---

## Roadmap

- [x] PDF ingestion pipeline
- [x] Hybrid retrieval (vector + keyword)
- [x] Neural reranking
- [x] Query rewriting
- [x] Conversation memory
- [x] Query caching
- [ ] Chat UI frontend
- [ ] Multi-document retrieval
- [ ] Streaming LLM responses
- [ ] Docker + docker-compose setup
- [ ] Cloud deployment guide
- [ ] Authentication system
- [ ] Evaluation benchmarks (RAGAS)

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Built with Node.js, ChromaDB, and Groq

⭐ **Star this repo if you found it useful**

</div>
