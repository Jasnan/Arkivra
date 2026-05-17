ALTER TABLE public.users
  ADD COLUMN system_role text DEFAULT 'member' NOT NULL;

ALTER TABLE public.users
  ADD CONSTRAINT users_system_role_check CHECK (system_role IN ('root', 'member'));

UPDATE public.users
SET system_role = 'root'
WHERE id IN (
  SELECT user_id
  FROM public.user_global_roles
  WHERE role = 'global_admin'
);

CREATE TABLE public.system_capabilities (
  user_id text NOT NULL,
  capability text NOT NULL,
  created_by text,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.system_capabilities
  ADD CONSTRAINT system_capabilities_pk PRIMARY KEY (user_id, capability);

ALTER TABLE ONLY public.system_capabilities
  ADD CONSTRAINT system_capabilities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.system_capabilities
  ADD CONSTRAINT system_capabilities_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.system_capabilities
  ADD CONSTRAINT system_capabilities_capability_check CHECK (capability IN ('system.create_vaults'));

CREATE INDEX system_capabilities_capability_idx ON public.system_capabilities USING btree (capability);

INSERT INTO public.system_capabilities (user_id, capability, created_at)
SELECT user_id, 'system.create_vaults', min(created_at)
FROM public.user_global_roles
WHERE role = 'vault_creator'
GROUP BY user_id
ON CONFLICT DO NOTHING;

ALTER TABLE public.vaults
  ADD COLUMN created_by text;

ALTER TABLE ONLY public.vaults
  ADD CONSTRAINT vaults_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.vaults AS v
SET created_by = owner.user_id
FROM (
  SELECT DISTINCT ON (vault_id) vault_id, user_id
  FROM public.vault_members
  WHERE role = 'owner'
  ORDER BY vault_id, created_at ASC, id ASC
) AS owner
WHERE owner.vault_id = v.id;

DELETE FROM public.vault_members AS vm
WHERE vm.role = 'member'
  AND NOT EXISTS (
    SELECT 1
    FROM public.vault_member_permissions AS vmp
    WHERE vmp.vault_member_id = vm.id
  );

UPDATE public.vault_members AS vm
SET role = CASE
  WHEN vm.role = 'owner' THEN 'owner'
  WHEN EXISTS (
    SELECT 1
    FROM public.vault_member_permissions AS vmp
    WHERE vmp.vault_member_id = vm.id
      AND vmp.permission IN (
        'documents.create',
        'documents.update',
        'documents.delete',
        'tags.manage',
        'members.invite',
        'members.manage'
      )
  ) THEN 'editor'
  ELSE 'viewer'
END;

ALTER TABLE public.vault_members
  ADD COLUMN ai_access_level text DEFAULT 'none' NOT NULL;

ALTER TABLE public.vault_members
  ADD CONSTRAINT vault_members_role_check CHECK (role IN ('owner', 'editor', 'viewer'));

ALTER TABLE public.vault_members
  ADD CONSTRAINT vault_members_ai_access_level_check CHECK (ai_access_level IN ('none', 'document_chat', 'full'));

CREATE TABLE public.permission_requests (
  id text NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  requested_by text NOT NULL,
  reviewed_by text,
  reviewed_at timestamp without time zone,
  vault_id text,
  target_user_id text,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  result jsonb
);

ALTER TABLE ONLY public.permission_requests
  ADD CONSTRAINT permission_requests_pkey PRIMARY KEY (id);

ALTER TABLE public.permission_requests
  ADD CONSTRAINT permission_requests_type_check CHECK (type IN ('vault.create', 'vault.delete', 'vault.owner_promote', 'vault.ai_escalation'));

ALTER TABLE public.permission_requests
  ADD CONSTRAINT permission_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

ALTER TABLE ONLY public.permission_requests
  ADD CONSTRAINT permission_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.permission_requests
  ADD CONSTRAINT permission_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.permission_requests
  ADD CONSTRAINT permission_requests_vault_id_fkey FOREIGN KEY (vault_id) REFERENCES public.vaults(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.permission_requests
  ADD CONSTRAINT permission_requests_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX permission_requests_status_created_idx ON public.permission_requests USING btree (status, created_at);
CREATE INDEX permission_requests_requested_by_idx ON public.permission_requests USING btree (requested_by);
CREATE INDEX permission_requests_vault_idx ON public.permission_requests USING btree (vault_id);

CREATE TABLE public.email_invitations (
  id text NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  email text NOT NULL,
  invited_by text,
  accepted_by text,
  accepted_at timestamp without time zone,
  expires_at timestamp without time zone,
  vault_id text,
  vault_member_id text,
  vault_role text,
  ai_access_level text DEFAULT 'none' NOT NULL,
  system_role text,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE ONLY public.email_invitations
  ADD CONSTRAINT email_invitations_pkey PRIMARY KEY (id);

ALTER TABLE public.email_invitations
  ADD CONSTRAINT email_invitations_type_check CHECK (type IN ('root_account', 'vault_member'));

ALTER TABLE public.email_invitations
  ADD CONSTRAINT email_invitations_status_check CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'));

ALTER TABLE public.email_invitations
  ADD CONSTRAINT email_invitations_vault_role_check CHECK (vault_role IS NULL OR vault_role IN ('owner', 'editor', 'viewer'));

ALTER TABLE public.email_invitations
  ADD CONSTRAINT email_invitations_ai_access_level_check CHECK (ai_access_level IN ('none', 'document_chat', 'full'));

ALTER TABLE public.email_invitations
  ADD CONSTRAINT email_invitations_system_role_check CHECK (system_role IS NULL OR system_role IN ('root', 'member'));

ALTER TABLE ONLY public.email_invitations
  ADD CONSTRAINT email_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.email_invitations
  ADD CONSTRAINT email_invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.email_invitations
  ADD CONSTRAINT email_invitations_vault_id_fkey FOREIGN KEY (vault_id) REFERENCES public.vaults(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_invitations
  ADD CONSTRAINT email_invitations_vault_member_id_fkey FOREIGN KEY (vault_member_id) REFERENCES public.vault_members(id) ON DELETE SET NULL;

CREATE INDEX email_invitations_email_status_idx ON public.email_invitations USING btree (email, status);
CREATE INDEX email_invitations_vault_idx ON public.email_invitations USING btree (vault_id);
CREATE INDEX email_invitations_invited_by_idx ON public.email_invitations USING btree (invited_by);

DROP TABLE public.vault_member_permissions;
DROP TABLE public.user_global_roles;
