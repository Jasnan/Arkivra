CREATE UNIQUE INDEX IF NOT EXISTS documents_active_folder_filename_unique
  ON public.documents USING btree (vault_id, COALESCE(folder_id, ''), lower(original_name))
  WHERE (is_deleted = false);
