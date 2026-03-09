const { ChromaClient } = require("chromadb");

// FIX: use path format not host/port — newer chromadb versions require this
const chroma = new ChromaClient({
  path: `http://${process.env.CHROMA_HOST}:${process.env.CHROMA_PORT}`
});

module.exports = chroma;
