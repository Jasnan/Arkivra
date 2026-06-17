UPDATE public.vault_members
SET ai_access_level = 'full'
WHERE ai_access_level = 'document_chat';

UPDATE public.email_invitations
SET ai_access_level = 'full'
WHERE ai_access_level = 'document_chat';

UPDATE public.permission_requests
SET
  type = CASE
    WHEN type = 'vault.ai_escalation' THEN 'vault.ai_access_grant'
    WHEN type = 'vault.email_invitation' THEN 'vault.external_invite'
    ELSE type
  END,
  payload = CASE
    WHEN type IN ('vault.ai_escalation', 'vault.email_invitation')
      AND payload->>'aiAccessLevel' = 'document_chat'
      THEN jsonb_set(payload, '{aiAccessLevel}', '"full"', false)
    ELSE payload
  END,
  result = CASE
    WHEN result IS NOT NULL
      AND type IN ('vault.ai_escalation', 'vault.email_invitation')
      AND result->>'aiAccessLevel' = 'document_chat'
      THEN jsonb_set(result, '{aiAccessLevel}', '"full"', false)
    ELSE result
  END
WHERE type IN ('vault.ai_escalation', 'vault.email_invitation');

ALTER TABLE public.vault_members
  DROP CONSTRAINT IF EXISTS vault_members_ai_access_level_check;

ALTER TABLE public.vault_members
  ADD CONSTRAINT vault_members_ai_access_level_check CHECK (ai_access_level IN ('none', 'full'));

ALTER TABLE public.email_invitations
  DROP CONSTRAINT IF EXISTS email_invitations_ai_access_level_check;

ALTER TABLE public.email_invitations
  ADD CONSTRAINT email_invitations_ai_access_level_check CHECK (ai_access_level IN ('none', 'full'));

ALTER TABLE public.permission_requests
  DROP CONSTRAINT IF EXISTS permission_requests_type_check;

ALTER TABLE public.permission_requests
  ADD CONSTRAINT permission_requests_type_check CHECK (type IN (
    'vault.create',
    'vault.delete',
    'vault.owner_promote',
    'vault.ai_access_grant',
    'vault.external_invite'
  ));
