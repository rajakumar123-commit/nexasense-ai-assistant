// ============================================================
// Chroma REST Client
// Pure HTTP — no chromadb package, no C++ addons ever loaded.
// ============================================================

const BASE = (process.env.CHROMA_URL || "http://chroma:8000").replace(/\/$/, "");
const API  = `${BASE}/api/v2/tenants/default_tenant/databases/default_database`;

const collectionsUrl     = ()   => `${API}/collections`;
const collectionUrl      = (n)  => `${API}/collections/${encodeURIComponent(n)}`;
const collectionQueryUrl = (id) => `${API}/collections/${encodeURIComponent(id)}/query`;
const collectionUpsertUrl= (id) => `${API}/collections/${encodeURIComponent(id)}/upsert`;

module.exports = { BASE, API, collectionsUrl, collectionUrl, collectionQueryUrl, collectionUpsertUrl };