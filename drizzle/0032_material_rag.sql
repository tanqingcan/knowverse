ALTER TABLE material_chunks ADD COLUMN concepts_indexed_at timestamptz;

CREATE TABLE material_chunk_concepts (
  chunk_id uuid NOT NULL REFERENCES material_chunks(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES concepts(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('catalog', 'user')),
  matched_term text,
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'confirmed', 'rejected')),
  reviewed_at timestamptz,
  PRIMARY KEY (chunk_id, concept_id)
);

CREATE INDEX material_chunk_concepts_lookup_idx
  ON material_chunk_concepts (concept_id, status, chunk_id);

CREATE TABLE material_chunk_embeddings (
  chunk_id uuid NOT NULL REFERENCES material_chunks(id) ON DELETE CASCADE,
  model_key text NOT NULL CHECK (char_length(model_key) BETWEEN 1 AND 100),
  embedding real[] NOT NULL CHECK (array_ndims(embedding) = 1 AND cardinality(embedding) = 512 AND array_position(embedding, NULL) IS NULL),
  indexed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, model_key)
);

CREATE FUNCTION kv_material_dot(lhs real[], rhs real[]) RETURNS double precision
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT sum(a::double precision * b::double precision) FROM unnest(lhs, rhs) AS v(a, b)
$$;

ALTER TABLE material_chunk_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_chunk_concepts_read ON material_chunk_concepts FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM material_chunks ch
    JOIN material_versions v ON v.id = ch.version_id
    JOIN materials m ON m.id = v.material_id
    JOIN concepts k ON k.id = material_chunk_concepts.concept_id AND k.subject_id = m.subject_id
    WHERE ch.id = material_chunk_concepts.chunk_id AND m.archived_at IS NULL
      AND (m.owner_user_id IS NULL OR m.owner_user_id = kv_current_user_id())
      AND (k.owner_user_id IS NULL OR k.owner_user_id = m.owner_user_id)
  )
);
CREATE POLICY material_chunk_concepts_write ON material_chunk_concepts FOR ALL
  USING (EXISTS (
    SELECT 1 FROM material_chunks ch JOIN material_versions v ON v.id = ch.version_id
    JOIN materials m ON m.id = v.material_id
    WHERE ch.id = material_chunk_concepts.chunk_id AND m.owner_user_id = kv_current_user_id() AND m.archived_at IS NULL
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM material_chunks ch JOIN material_versions v ON v.id = ch.version_id
    JOIN materials m ON m.id = v.material_id
    JOIN concepts k ON k.id = material_chunk_concepts.concept_id AND k.subject_id = m.subject_id
    WHERE ch.id = material_chunk_concepts.chunk_id AND m.owner_user_id = kv_current_user_id()
      AND m.archived_at IS NULL AND (k.owner_user_id IS NULL OR k.owner_user_id = m.owner_user_id)
  ));

ALTER TABLE material_chunk_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_chunk_embeddings_read ON material_chunk_embeddings FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM material_chunks ch JOIN material_versions v ON v.id = ch.version_id
    JOIN materials m ON m.id = v.material_id
    WHERE ch.id = material_chunk_embeddings.chunk_id AND m.archived_at IS NULL
      AND (m.owner_user_id IS NULL OR m.owner_user_id = kv_current_user_id())
  )
);
CREATE POLICY material_chunk_embeddings_write ON material_chunk_embeddings FOR ALL
  USING (EXISTS (
    SELECT 1 FROM material_chunks ch JOIN material_versions v ON v.id = ch.version_id
    JOIN materials m ON m.id = v.material_id
    WHERE ch.id = material_chunk_embeddings.chunk_id AND m.owner_user_id = kv_current_user_id() AND m.archived_at IS NULL
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM material_chunks ch JOIN material_versions v ON v.id = ch.version_id
    JOIN materials m ON m.id = v.material_id
    WHERE ch.id = material_chunk_embeddings.chunk_id AND m.owner_user_id = kv_current_user_id() AND m.archived_at IS NULL
  ));
