CREATE TABLE IF NOT EXISTS public.vault_folders (
  id text PRIMARY KEY,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL,
  vault_id text NOT NULL,
  parent_id text,
  created_by text,
  name text NOT NULL,
  is_deleted boolean DEFAULT false NOT NULL,
  deleted_at timestamp without time zone,
  deleted_by text,
  CONSTRAINT vault_folders_vault_id_fkey
    FOREIGN KEY (vault_id) REFERENCES public.vaults(id) ON DELETE CASCADE,
  CONSTRAINT vault_folders_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES public.vault_folders(id) ON DELETE CASCADE,
  CONSTRAINT vault_folders_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT vault_folders_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS folder_id text;

ALTER TABLE public.documents
DROP CONSTRAINT IF EXISTS documents_folder_id_fkey;

ALTER TABLE public.documents
ADD CONSTRAINT documents_folder_id_fkey
  FOREIGN KEY (folder_id) REFERENCES public.vault_folders(id) ON DELETE SET NULL;

ALTER TABLE public.upload_sessions
ADD COLUMN IF NOT EXISTS folder_id text;

ALTER TABLE public.upload_sessions
ADD COLUMN IF NOT EXISTS relative_path text;

ALTER TABLE public.upload_sessions
DROP CONSTRAINT IF EXISTS upload_sessions_folder_id_fkey;

ALTER TABLE public.upload_sessions
ADD CONSTRAINT upload_sessions_folder_id_fkey
  FOREIGN KEY (folder_id) REFERENCES public.vault_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vault_folders_vault_parent_deleted_name_idx
  ON public.vault_folders (vault_id, parent_id, is_deleted, name);

CREATE INDEX IF NOT EXISTS vault_folders_parent_idx
  ON public.vault_folders (parent_id);

CREATE INDEX IF NOT EXISTS vault_folders_deleted_idx
  ON public.vault_folders (vault_id, is_deleted);

CREATE UNIQUE INDEX IF NOT EXISTS vault_folders_active_sibling_name_unique
  ON public.vault_folders (vault_id, COALESCE(parent_id, '__root__'), lower(name))
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS documents_vault_folder_deleted_created_idx
  ON public.documents (vault_id, folder_id, is_deleted, created_at);

CREATE INDEX IF NOT EXISTS upload_sessions_folder_idx
  ON public.upload_sessions (folder_id);
