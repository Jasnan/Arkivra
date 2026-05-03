ALTER TABLE public.instance_settings
  ALTER COLUMN ollama_embedding_model SET DEFAULT 'bge-m3',
  ALTER COLUMN ollama_embedding_dimensions SET DEFAULT 1024;

UPDATE public.instance_settings
SET
  ollama_embedding_model = 'bge-m3',
  ollama_embedding_dimensions = 1024,
  updated_at = NOW()
WHERE ollama_embedding_model <> 'bge-m3'
   OR ollama_embedding_dimensions <> 1024;

DROP INDEX IF EXISTS public.document_chunks_embedding_idx;

UPDATE public.document_chunks
SET embedding = NULL
WHERE embedding IS NOT NULL;

ALTER TABLE public.document_chunks
  ALTER COLUMN embedding TYPE public.vector(1024);

CREATE INDEX document_chunks_embedding_idx
  ON public.document_chunks
  USING hnsw (embedding public.vector_cosine_ops);
