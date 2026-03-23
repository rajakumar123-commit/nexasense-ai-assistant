# NexaSense Cloud Deployment Guide

This guide explains how to transition NexaSense from a local Docker environment to professional cloud hosting on **Render** and **Vercel**.

## 🏗️ Architecture Overview

| Component | Recommended Platform | Reason |
| :--- | :--- | :--- |
| **Frontend (React)** | **Vercel** | Specialized for static assets and CDN delivery. |
| **Backend API** | **Render (Web Service)** | Supports Docker, persistent disks, and long-running streaming. |
| **Ingestion Worker** | **Render (Worker)** | Dedicated background processing for heavy WASM tasks. |
| **ChromaDB** | **Render (Web Service)** | Vector DB requiring persistent disk storage. |
| **PostgreSQL** | **Render / Neon / Supabase** | Managed relational storage. |
| **Redis** | **Render / Upstash** | High-performance caching and BullMQ queuing. |

---

## 💰 100% Free Deployment Tier

To run NexaSense completely for free, use this "Hybrid" stack:

1. **Frontend**: [Vercel](https://vercel.com) (Free)
2. **PostgreSQL**: [Neon.tech](https://neon.tech) (Free Serverless)
3. **Redis**: [Upstash](https://upstash.com) (Free Serverless)
4. **Backend/Worker**: [Render](https://render.com) (Free Tier - 512MB RAM)

### ⚠️ Critical Optimization for Free Tier
Running `Transformers.js` locally requires **2GB RAM**, which is not available on Render's free tier. 
**Solution**: Switch your embedding provider to the **Gemini Embeddings API**. This offloads the mathematical heavy-lifting to Google's cloud (for free), allowing your backend to run on less than **150MB of RAM**!

---

## 🚀 Step 1: Managed Databases

Before deploying the code, set up your managed database instances:
1. **PostgreSQL**: Create a new database. Copy the **External/Internal Connection String**.
2. **Redis**: Create a high-performance Redis instance. Copy the **Redis URL**.

---

## 📦 Step 2: ChromaDB (Vector Search)

NexaSense requires a persistent vector store.
1. Create a **New > Web Service** on Render.
2. Search for the public Docker image: `chromadb/chroma`.
3. Under **Advanced**, add a **Persistent Disk** (2GB) mounted at `/data`.
4. Add Environment Variable: `PERSIST_DIRECTORY=/data`.

---

## ⚙️ Step 3: Backend & Worker

### Backend API
- **Root Directory**: `.` (Root)
- **Start Command**: `npm start`
- **Environtment Variables**:
  - `DATABASE_URL`: (Your RDS/Neon URL)
  - `REDIS_URL`: (Your Redis URL)
  - `CHROMA_URL`: (The public URL of your Chroma service)
  - `GROQ_API_KEY`: (Your Key)
  - `GEMINI_API_KEY`: (Your Key)

### Ingestion Worker
- Create a **New > Background Worker**.
- **Start Command**: `npm run worker`
- Use the same environment variables as the API.

---

## 🖥️ Step 4: Frontend (Vercel)

1. Import your repository to **Vercel**.
2. Set **Root Directory** to `frontend`.
3. **Build Command**: `npm run build`
4. **Output Directory**: `dist`
5. **Environment Variable**: `VITE_API_BASE_URL` set to your Render API URL.

---

## 🛠️ Critical Cloud Optimizations

### 🧮 RAM Requirements
The **Ingestion Worker** and **Backend** perform heavy WASM operations. 
- **Minimum RAM**: 2GB per service.
- **CPU**: At least 1 vCPU for decent embedding speed.

### 💾 Model Caching
To avoid downloading the 500MB embedding model on every deploy:
1. Mount a **Persistent Disk** to the Worker/Backend (e.g., at `/data`).
2. Set Environment Variable: `TRANSFORMERS_CACHE=/data/models`.

### 🔏 Production Security
- Change your `JWT_SECRET` in the production environment variables.
- Ensure `CORS_ORIGIN` in the backend is restricted to your Vercel URL.
