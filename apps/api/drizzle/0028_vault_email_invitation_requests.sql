ALTER TABLE public.permission_requests
  DROP CONSTRAINT permission_requests_type_check;

ALTER TABLE public.permission_requests
  ADD CONSTRAINT permission_requests_type_check CHECK (type IN (
    'vault.create',
    'vault.delete',
    'vault.owner_promote',
    'vault.ai_escalation',
    'vault.email_invitation'
  ));
