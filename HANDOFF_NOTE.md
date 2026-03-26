# NexaSense Branch Strategy & Handoff Note

## ⚠️ Important: Two Active Branches

### `main` branch (PRODUCTION — DO NOT BREAK)
- **Live URL:** https://rajakumar-nexasense-ai.online
- **AWS EC2:** 16.171.19.129 (Ubuntu)
- **Deploys:** Automatically via GitHub Actions on every push to `main`.
- **Status:** 100% stable. Conversation history, Payments, CI/CD — all working.
- **RULE:** Never push WIP or experimental code directly to `main`.

### `feature/multi-format-voice` branch (EXPERIMENTAL)
- **Purpose:** In-progress branch to safely add:
  1. `.txt` and `.docx` document ingestion (using `mammoth` library).
  2. Browser-native Voice Input (Mic 🎤) and Voice Output (🔊) using `window.SpeechRecognition` and `window.speechSynthesis` — ZERO backend load.
  3. Multilingual Response: User can query any English PDF in Hindi and get an answer in Hindi.
- **Status:** Branch created, no code written yet. `main` is completely unaffected.
- **RULE:** All new feature work goes here. Only merge to `main` after local verification.

## How to Switch Back to Stable Main Anytime
```bash
git checkout main
```

## How to Continue Work on This Feature Branch
```bash
git checkout feature/multi-format-voice
```

## Files to Modify (Feature Branch Only)
| File | Change |
|---|---|
| `src/routes/document.routes.js` | Accept `.txt`, `.docx` MIME types in multer |
| `src/workers/ingestion.worker.js` | Route to `mammoth` / `fs.readFile` based on extension |
| `frontend/src/pages/Workspace.jsx` | Update file picker to accept `txt, docx` |
| `frontend/src/pages/Chat.jsx` | Add Mic button (SpeechRecognition API) |
| `frontend/src/components/ChatMessage.jsx` | Add 🔊 Speaker button (speechSynthesis API) |
| `src/pipelines/retrieval.pipeline.js` | Inject language instruction in system prompt |
