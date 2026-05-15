ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS language_metadata jsonb;

CREATE INDEX IF NOT EXISTS documents_language_metadata_gin_idx
  ON public.documents USING gin (language_metadata);

CREATE INDEX IF NOT EXISTS documents_language_code_idx
  ON public.documents USING btree ((language_metadata->>'code'))
  WHERE language_metadata IS NOT NULL;
