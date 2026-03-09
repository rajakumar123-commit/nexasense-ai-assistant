const { pool } = require("../db");

async function keywordSearch(documentId, query, limit = 5) {

  const { rows } = await pool.query(
    `
    SELECT content, page_number
    FROM chunks
    WHERE document_id = $1
    AND search_vector @@ plainto_tsquery('english', $2)
    LIMIT $3
    `,
    [documentId, query, limit]
  );

  return rows.map(r => ({
    content: r.content,
    metadata: {
      pageNumber: r.page_number
    },
    similarity: 0.5
  }));
}

module.exports = { keywordSearch };