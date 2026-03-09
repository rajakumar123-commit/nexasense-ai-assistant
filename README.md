NexaSense AI Assistant

NexaSense is a Retrieval-Augmented Generation (RAG) AI assistant that enables users to upload PDF documents and ask natural language questions about their content.

Instead of sending entire documents directly to a Large Language Model (LLM), NexaSense retrieves only the most relevant sections of a document using hybrid retrieval (vector similarity + keyword search) and then generates grounded answers using an LLM.

This project demonstrates how modern AI systems combine:

semantic embeddings

vector databases

retrieval pipelines

reranking models

large language models

to build intelligent document understanding systems.

Project Motivation

Large Language Models have context window limitations and cannot efficiently process large documents.

Sending full documents to an LLM leads to several problems:

high token cost

slow response time

hallucinated answers

poor scalability

NexaSense solves this using Retrieval-Augmented Generation (RAG).

Instead of processing entire documents, the system:

Splits documents into smaller semantic chunks

Converts chunks into embeddings

Stores them in a vector database

Retrieves the most relevant chunks during queries

Sends only relevant context to the LLM

This approach improves:

answer accuracy

system latency

scalability

cost efficiency

Key Features
Document Intelligence

The system processes uploaded documents through a structured ingestion pipeline.

Capabilities include:

PDF upload API

automated text extraction

recursive semantic chunking

embedding generation

vector storage in ChromaDB

Hybrid Retrieval System

NexaSense combines two retrieval approaches:

Vector Search

Captures semantic meaning using embeddings.

Example:

Query
"How does neural network training work?"

Vector search may match:

"Backpropagation adjusts model weights using gradient descent."

Keyword Search

Uses PostgreSQL full-text search to capture exact technical matches.

Example:

Query
"TCP congestion control"

Keyword search ensures exact phrase matches.

Why Hybrid Retrieval?

Vector search captures semantic similarity, while keyword search captures exact terms.

Combining both improves retrieval accuracy.

Neural Reranking

Initial retrieval returns several candidate chunks.

A reranker model evaluates these chunks and selects the most relevant ones before passing them to the LLM.

This improves answer precision.

Query Rewriting

User queries may not always be optimal for retrieval.

Example:

User query
"How does it train?"

Query rewriting improves it to:

"How does machine learning model training work?"

This improves retrieval quality.

Performance Optimizations
Conversation Memory

Maintains context across multiple questions in a conversation.

Query Caching

Frequently asked questions are cached to reduce repeated LLM calls.

Asynchronous Document Ingestion

Embedding generation runs in a background queue so that document uploads remain fast.

System Architecture
flowchart TD

User[User Question]

API[Express API]

Pipeline[RAG Retrieval Pipeline]

Vector[Vector Search<br>ChromaDB]

Keyword[Keyword Search<br>PostgreSQL]

Reranker[Reranker Model]

Context[Selected Context]

LLM[Groq LLM]

Answer[AI Response]

User --> API
API --> Pipeline
Pipeline --> Vector
Pipeline --> Keyword
Vector --> Reranker
Keyword --> Reranker
Reranker --> Context
Context --> LLM
LLM --> Answer

The architecture follows a multi-stage retrieval pipeline:

Retrieve candidate chunks

Rank relevance

Generate grounded answer

Document Processing Pipeline

Before documents can be queried, they are processed through an ingestion pipeline.

flowchart TD

Upload[Upload PDF]

Extract[Text Extraction]

Chunk[Recursive Chunking]

Embed[Embedding Generation]

Store[Store Vectors<br>ChromaDB]

Upload --> Extract
Extract --> Chunk
Chunk --> Embed
Embed --> Store
Pipeline Steps

1. Document Upload

Users upload PDF documents through the API.

2. Text Extraction

Text is extracted from the document.

3. Recursive Chunking

Documents are split into semantic chunks.

Benefits:

better embedding representation

improved retrieval accuracy

4. Embedding Generation

Each chunk is converted into a vector embedding.

5. Vector Storage

Embeddings are stored in ChromaDB for similarity search.

Query Processing Pipeline
sequenceDiagram

participant User
participant API
participant Pipeline
participant VectorDB
participant Reranker
participant LLM

User->>API: Ask question
API->>Pipeline: Start retrieval pipeline
Pipeline->>VectorDB: Vector search
VectorDB-->>Pipeline: Candidate chunks
Pipeline->>Reranker: Rank results
Reranker-->>Pipeline: Top chunks
Pipeline->>LLM: Generate answer
LLM-->>API: AI response
API-->>User: Answer + Sources
Query Steps

User submits a question

Query rewriting improves retrieval quality

Hybrid retrieval finds candidate chunks

Reranking selects the most relevant chunks

Context is sent to the LLM

The LLM generates a grounded answer

Tech Stack
Backend

Node.js

Express.js

AI / Machine Learning

Transformers.js (embeddings)

Groq LLM API (answer generation)

Databases
PostgreSQL

Used for:

document metadata

keyword search

conversation storage

ChromaDB

Used as a vector database for semantic search.

Project Structure
src
 ├ cache
 │   └ queryCache.js
 ├ config
 │   └ chroma.js
 ├ controllers
 │   ├ document.controller.js
 │   ├ query.controller.js
 │   └ upload.controller.js
 ├ db
 │   ├ migrations
 │   └ index.js
 ├ middleware
 │   └ upload.middleware.js
 ├ pipelines
 │   └ retrieval.pipeline.js
 ├ queue
 │   └ ingestion.queue.js
 ├ routes
 │   ├ conversation.routes.js
 │   ├ document.routes.js
 │   ├ query.routes.js
 │   └ upload.routes.js
 ├ services
 │   ├ conversation.service.js
 │   ├ document.service.js
 │   ├ embedder.service.js
 │   ├ keywordSearch.service.js
 │   ├ llm.service.js
 │   ├ queryRewrite.service.js
 │   ├ reranker.service.js
 │   └ vectorSearch.service.js
 ├ utils
 │   ├ recursiveChunk.js
 │   └ logger.js
 ├ app.js
 └ server.js
Architecture Layers

Controllers → API layer
Services → business logic
Pipelines → RAG workflow
Queue → async ingestion
Cache → performance optimization
Utils → reusable utilities

Example API Request

Endpoint

POST /api/query

Request

{
  "documentId": "document-id",
  "conversationId": "conversation-id",
  "question": "What is machine learning?"
}

Response

{
  "answer": "Machine learning is the process of training algorithms using data to improve performance.",
  "sources": ["page 2", "page 5"],
  "responseTimeMs": 950
}
System Evaluation & Metrics

In RAG systems, performance depends on both retrieval quality and system latency.

Retrieval Precision

Measures how many retrieved chunks are relevant.

Precision = relevant retrieved chunks / total retrieved chunks

High precision indicates accurate retrieval.

Retrieval Recall

Measures whether all relevant information was retrieved.

Recall = relevant retrieved chunks / total relevant chunks

Low recall means important information may be missed.

Embedding Generation Time

Time required to convert document chunks into embeddings.

Optimizing this improves ingestion performance.

Vector Search Latency

Time required to retrieve relevant vectors from the vector database.

Low latency is important for interactive systems.

LLM Response Time

Time required for the LLM to generate an answer.

This depends on:

model size

prompt length

inference hardware

End-to-End Query Latency

Total time from user question to generated answer.

Includes:

query rewriting

retrieval

reranking

LLM generation

Design Trade-offs & Limitations
Hybrid Retrieval Complexity

Combining vector and keyword search improves accuracy but increases query complexity.

Chunk Size Trade-offs

Small chunks improve precision but may lose context.
Large chunks preserve context but reduce retrieval accuracy.

Retrieval Dependency

Answer quality depends heavily on retrieval quality.

Poor retrieval results lead to incorrect answers.

Future Improvements

Planned improvements include:

multi-document retrieval

streaming LLM responses

improved embedding models

semantic chunking strategies

distributed vector databases

evaluation benchmarks

Setup Instructions

Clone the repository

git clone https://github.com/YOUR_USERNAME/nexasense-ai-assistant.git

Navigate to the project

cd nexasense-ai-assistant

Install dependencies

npm install

Create .env

PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/nexasense
GROQ_API_KEY=your_api_key

Run server

npm run dev
License

This project is licensed under the MIT License.
