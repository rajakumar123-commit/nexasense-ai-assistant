ALTER TABLE chunks
ADD COLUMN search_vector tsvector;

UPDATE chunks
SET search_vector = to_tsvector('english', content);

CREATE INDEX idx_chunks_search
ON chunks USING GIN(search_vector);