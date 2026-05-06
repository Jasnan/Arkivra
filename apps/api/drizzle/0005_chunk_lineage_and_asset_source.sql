ALTER TABLE public.document_chunks
ADD COLUMN IF NOT EXISTS section_path jsonb;

ALTER TABLE public.document_chunk_assets
ADD COLUMN IF NOT EXISTS source_element_id text;
