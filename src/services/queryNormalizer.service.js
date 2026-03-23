// ============================================================
// Query Normalizer
// Cleans messy user input
// ============================================================

function normalizeQuery(question) {

  if (!question) return "";

  let q = question.toLowerCase().trim();

  // remove punctuation but preserve apostrophes and hyphens
  // so "what's" and "e-commerce" are not broken into separate tokens
  q = q.replace(/[^\w\s'-]/g, " ");

  // remove repeated spaces
  q = q.replace(/\s+/g, " ");

  return q;

}

module.exports = {
  normalizeQuery
};