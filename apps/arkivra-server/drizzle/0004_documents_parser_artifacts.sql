ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS raw_markdown text DEFAULT ''::text NOT NULL,
ADD COLUMN IF NOT EXISTS parser_structured_output jsonb;
