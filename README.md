# NexaSense AI Assistant: Architecture & Documentation

Welcome to the **NexaSense AI Assistant** repository. NexaSense is an enterprise-grade, highly scalable Document Intelligence system built to process, search, and intelligently converse with multiple documents simultaneously using an advanced Retrieval-Augmented Generation (RAG) architecture.

This README provides a fully explanatory breakdown of the system architecture, the technology stack, and instructions on how to run the project.

---

## 🌟 High-Level Overview

<div align="center">
  <img src="./assets/hero.png" alt="NexaSense Hero Image" width="800"/>
</div>

NexaSense effectively does two main things:
1. **Asynchronous Ingestion**: Securely processes large PDF files in the background, extracting, chunking, and translating human text into multi-dimensional mathematical vectors.
2. **Intelligent Querying (RAG)**: Employs a sophisticated multi-stage retrieval pipeline backed by a **Dual-LLM Design** (Llama 3.3 70B via Groq + Gemini 2.5 Flash Lite) to find the exact paragraphs needed to answer a user's question, strictly preventing hallucinations.

---

## 🏗️ Detailed Architecture Flow

The system architecture is decoupled into **four primary tiers**: Frontend, Backend API, asynchronous Worker, and the Data Storage Layer.

### 1. System Architecture Overview
This diagram illustrates the high-level decoupled architecture and data flow between the services.

```mermaid
graph TD
    %% Entities
    Client["Client (Vite/React)"]
    API["Backend API (Express/Node.js)"]
    Worker["Ingestion Worker (BullMQ)"]
    
    %% Databases
    PostgreSQL[("PostgreSQL\n(Users, Docs, Chunks, Metrics)")]
    Redis[("Redis\n(BullMQ, Caching, Rate Limits)")]
    ChromaDB[("ChromaDB v3\n(Vector Embeddings)")]
    
    %% External APIs
    Groq["Groq API\n(Llama 3.3 70B)"]
    Gemini["Gemini API\n(2.5 Flash Lite)"]
    
    %% Flows
    Client -- "HTTP/REST\n(JWT Auth)" --> API
    API -- "Queues Jobs" --> Redis
    Redis -- "Consumes Jobs" --> Worker
    
    %% Worker Data Flow
    Worker -- "Full-Text SQL\n(to_tsvector)" --> PostgreSQL
    Worker -- "Vector\nEmbeddings" --> ChromaDB
    Worker -- "Generate\nSummaries" --> Groq
    
    %% API Data Flow
    API -- "Fetch/Update Models" --> PostgreSQL
    API -- "Vector Search" --> ChromaDB
    API -- "Semantic Caching" --> Redis
    API -- "Reasoning/Routing" --> Gemini
    API -- "Core Generation" --> Groq
```

### 2. Data Storage & Infrastructure Layer
- **PostgreSQL**: The relational backbone of the system. It scales user data, conversation histories, system telemetry/metrics, and the raw text chunks. 
  - *Feature Highlight*: Contains an automated SQL trigger that calculates a `to_tsvector` (search vector) on every raw text chunk inserted. This provides high-speed full-text keyword search directly at the database level.
- **ChromaDB (v3)**: The vector database. Responsible solely for storing floats (embeddings) and performing instantaneous Cosine Similarity distance calculations to find semantically relevant chunks.
- **Redis**: The in-memory cache. Used for BullMQ queues, rate-limit tracking, and high-speed semantic query caching.

### 3. The Ingestion Pipeline (BullMQ Worker)
When a user uploads a PDF, the main API does *not* process it. Instead, the API saves the file to `/uploads`, marks the document as `pending` in PostgreSQL, and enqueues a job into Redis.

```mermaid
sequenceDiagram
    participant User
    participant API as Backend API
    participant FS as Local File System (/uploads)
    participant Redis as Redis (BullMQ)
    participant Worker as Ingestion Worker
    participant DB as PostgreSQL
    participant Chroma as ChromaDB v3

    User->>API: POST /api/upload (PDF)
    API->>FS: Save temporary file
    API->>DB: INSERT document ('pending')
    API->>Redis: Enqueue 'ingest-document' job
    API-->>User: Return 202 Accepted (documentId)

    Redis->>Worker: Dequeue Job
    Worker->>DB: UPDATE status to 'extracting'
    Worker->>FS: Read & Parse PDF Text
        
    Worker->>DB: UPDATE status to 'chunking'
    Worker->>Worker: Chunking & Overlap Strategy
    
    Worker->>DB: DELETE old chunks
    Worker->>DB: INSERT chunks (Generates FTS vector)

    Worker->>DB: UPDATE status to 'embedding'
    Worker->>Worker: Generate Vectors
    Worker->>Chroma: Add to Collection
    
    Worker->>Worker: Generate AI Summary & Suggestions
    
    Worker->>DB: UPDATE status to 'ready'
    Worker->>FS: Delete temporary file
```

The dedicated worker (`ingestion.worker.js`) executes the Background Job:
1. **Extraction**: Uses robust parsers to strip readable text from the encoded PDF.
2. **Semantic Chunking**: Slices the document into overlapping chunks (e.g., 500-1000 characters) to ensure context doesn't abruptly cut off mid-sentence.
3. **Embedding**: Transforms every chunk into an embedding vector using the centralized `sharedEmbedder` singleton to optimize memory.
4. **Dual Storage**: Saves the raw text and metadata into PostgreSQL, and the vector embeddings into ChromaDB.
5. **Cleanup**: Automatically deletes the temporary PDF from the local file system and marks the document `ready`.

*Note*: If a failure occurs (e.g. network timeout), BullMQ automatically retries the job with an exponential backoff.

### 4. The Retrieval Pipeline (RAG)
When a user asks a question, the backend routes the query through an intensive multi-step pipeline (`retrieval.pipeline.js`):

```mermaid
flowchart TD
    Q(["User Question"])
    
    %% Pre-Processing
    Spell["Gemini: Spell Correct"]
    QueryExp["Gemini: Expand Variations"]
    Hist["Load Conversation History"]
    Rewrite["Gemini: Rewrite w/ History"]
    
    %% Cache checks
    ExactCache{"Exact Match\nCache?"}
    SemCache{"Semantic\nCache?"}
    
    %% Hypothetical Doc
    HyDE["HyDE Generation\n(Hypothetical Answer)"]
    
    %% Search
    VecSearch[/"Multi-Doc Vector Search\n(ChromaDB)"/]
    KwSearch[/"Keyword FTS Search\n(PostgreSQL)"/]
    
    %% Post-Retrieval
    Merge["Deduplicate Chunks"]
    Rerank["Semantic Re-ranking\n(Slice top 7)"]
    EarlyExit{"No Chunks\nFound?"}
    DomainFallback["Gemini: Context Mode Fallback\n(Reject out-of-domain)"]
    
    %% Reasoning
    Compress["Context Compression\n(Trim filler)"]
    Llama["Groq: Construct Initial Answer\n(Llama 3.3 70B)"]
    GemReason["Gemini: Reasoning & Refinement\n(Apply structure)"]
    Reflect["Gemini: Self-Reflection\n(Confidence Validation)"]
    
    %% Output
    SaveCache["Save to Semantic Cache"]
    A(["Final Answer returned"])
    
    Q --> ExactCache
    ExactCache -- "Hit" --> A
    ExactCache -- "Miss" --> Spell
    
    Spell --> QueryExp
    QueryExp --> SemCache
    SemCache -- "Hit" --> A
    SemCache -- "Miss" --> Hist
    
    Hist --> Rewrite
    Rewrite --> HyDE
    
    HyDE --> VecSearch
    HyDE --> KwSearch
    Rewrite --> VecSearch
    Rewrite --> KwSearch
    
    VecSearch --> Merge
    KwSearch --> Merge
    Merge --> Rerank
    Rerank --> EarlyExit
    
    EarlyExit -- "Yes" --> DomainFallback
    DomainFallback --> A
    
    EarlyExit -- "No" --> Compress
    Compress --> Llama
    Llama --> GemReason
    GemReason --> Reflect
    Reflect --> SaveCache
    SaveCache --> A
```

---

## 📂 Project Structure

```text
nexasense/
├── src/                        # Backend Source Code
│   ├── cache/                  # Semantic & Query Caching logic
│   ├── config/                 # Database, Redis & Chroma configurations
│   ├── controllers/            # API Route handlers
│   ├── db/                     # Database connection & schema setup
│   ├── middleware/             # Auth & File Upload middlewares
│   ├── pipelines/              # Core RAG Retrieval Pipeline orchestrator
│   ├── queue/                  # BullMQ ingestion queue setup
│   ├── routes/                 # Express API routes
│   ├── services/               # AI (Gemini/Groq), Search, & Logic services
│   ├── utils/                  # Shared helper functions & Logger
│   ├── workers/                # Background Ingestion Worker
│   ├── app.js                  # Main Express application setup
│   └── server.js               # Backend Entry Point
├── frontend/                   # React (Vite) Frontend Application
│   ├── src/
│   │   ├── pages/              # UI Pages (Chat, Dashboard, Login, etc.)
│   │   ├── components/         # Reusable UI components
│   │   ├── hooks/              # Custom React hooks (useApi, useStream)
│   │   └── services/           # Frontend API communication
│   ├── public/                 # Static assets
│   ├── Dockerfile              # Frontend Container setup
│   └── vite.config.js          # Vite & Proxy configuration
├── uploads/                    # Temporary staging for uploaded PDFs
├── logs/                       # Persistent application logs
├── schema.sql                  # PostgreSQL Schema with FTS Triggers
├── Dockerfile                  # Main Node.js (Backend/Worker) Container setup
├── docker-compose.yml          # Full-stack Container Orchestration
└── .env.example                # Example environment configuration
```

---

## 🛠️ Technology Stack Breakdown

| Layer | Technology |
| :--- | :--- |
| **Frontend UI** | React.js, Vite, Tailwind CSS |
| **Web API / Worker** | Node.js, Express.js |
| **Relational Database** | PostgreSQL |
| **Vector Database** | ChromaDB (v3 compatible) |
| **Caching & Queues** | Redis, BullMQ |
| **Primary LLM** | Meta Llama 3.3 70B (via Groq API) |
| **Reasoning Agent** | Google Gemini 2.5 Flash Lite |

---

## 🚀 Quick Setup & Deployment

### 1. Docker Deployment (Recommended)
NexaSense is heavily optimized for zero-configuration containerized deployment via Docker.

```bash
# 1. Clone the repository
git clone https://github.com/rajakumar123-commit/nexasense-ai-assistant.git
cd nexasense-ai-assistant

# 2. Configure environment
cp .env.example .env
# Edit .env and insert your GEMINI_API_KEY and GROQ_API_KEY

# 3. Bring the stack online
docker compose up --build -d
```

### 2. Manual Startup (Development)
If you prefer running components individually on your local machine:

**Backend:**
```bash
npm install
npm run migrate    # Build the PostgreSQL schema
npm run dev        # Starts the API & Ingestion Worker
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev        # Starts the Vite preview at http://localhost:5173
```

---

## 🔗 Useful Links
- **GitHub Repository**: [NexaSense AI Assistant](https://github.com/rajakumar123-commit/nexasense-ai-assistant)
- **Google AI Studio**: [Get Gemini API Key](https://aistudio.google.com/)
- **Groq Console**: [Get Groq API Key](https://console.groq.com/)
- **ChromaDB Documentation**: [Vector Search Guide](https://docs.trychroma.com/)

---

## 🎨 User Interface Highlights

NexaSense features a premium, responsive glassmorphism UI built with React and Tailwind CSS.

### Dashboard & Workspace
Modern document management and system statistics.
<img src="./assets/dashboard.png" alt="Dashboard View" width="800"/>

### Intelligent Chat & Pipeline Inspector
Ask questions and view exactly how the RAG pipeline processed them in real-time.
<img src="./assets/chat_inspector.png" alt="Chat and Pipeline Inspector" width="800"/>

### 3D Pipeline Animation
Interactive 3D visualization of the core backend RAG flow.
<img src="./assets/pipeline_3d.png" alt="3D Pipeline Animation" width="800"/>

---

## ☁️ Cloud Deployment

For detailed production deployment instructions (Render/Vercel/Railway), please refer to the [NexaSense Deployment Guide](./deployment_plan.md).

### Quick Cloud Strategy:
- **Frontend**: [Vercel](https://vercel.com) (Serverless React)
- **Backend/Worker**: [Render](https://render.com) (Docker Web Service & Background Worker)
- **Vector DB**: [Render Persistent Disk](https://render.com/docs/disks) + ChromaDB Docker Image
- **Database**: [Render PostgreSQL](https://render.com/docs/databases) or [Neon.tech](https://neon.tech)

---

*Verified fully bug-free and architecture-mapped as of latest pipeline audit.*
