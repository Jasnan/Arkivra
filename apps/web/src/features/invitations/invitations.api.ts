import { fetchJson } from '@/lib/api';
import type { EmailInvitation } from '@/features/vaults/vaults.types';

export async function acceptEmailInvitation({
  invitationId,
  email,
}: {
  invitationId?: string;
  email?: string;
}) {
  return fetchJson<{ invitation: EmailInvitation }>('/api/email-invitations/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invitationId, email }),
  });
}
