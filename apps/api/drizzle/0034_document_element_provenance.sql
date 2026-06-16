CREATE TABLE public.document_element_provenance (
  document_id text NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  document_version_id text NOT NULL REFERENCES public.document_versions(id) ON DELETE CASCADE,
  vault_id text NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  element_id text NOT NULL,
  parent_element_id text,
  element_type text NOT NULL,
  text text NOT NULL DEFAULT '',
  page_number integer,
  bbox jsonb,
  section text,
  section_path jsonb,
  sort_index integer NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT document_element_provenance_pk PRIMARY KEY (document_version_id, element_id),
  CONSTRAINT document_element_provenance_version_document_vault_fkey
    FOREIGN KEY (document_version_id, document_id, vault_id)
    REFERENCES public.document_versions(id, document_id, vault_id)
    ON DELETE CASCADE
);

CREATE INDEX document_element_provenance_version_sort_idx
  ON public.document_element_provenance (document_version_id, sort_index);

CREATE INDEX document_element_provenance_version_page_idx
  ON public.document_element_provenance (document_version_id, page_number);
