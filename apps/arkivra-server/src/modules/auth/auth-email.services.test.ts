import { afterEach, describe, expect, test, vi } from 'vitest';
import { parseConfig } from '../config/config.js';
import { createAuthEmailServices } from './auth-email.services.js';

const requiredEnv = {
  ARKIVRA_ENCRYPTION_KEYS: `1:${'a'.repeat(64)}`,
  ARKIVRA_DOCLING_URL: 'http://127.0.0.1:5001',
};

describe('auth email services', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('logs auth emails in console delivery mode', async () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
      },
    });
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { sendEmail } = createAuthEmailServices({ config });

    await sendEmail({
      to: 'alex@example.com',
      subject: 'Verify your Arkivra email',
      text: 'http://localhost:1221/api/auth/verify-email?token=token',
    });

    expect(infoSpy).toHaveBeenCalledWith('[Auth email] To: alex@example.com');
    expect(infoSpy).toHaveBeenCalledWith('[Auth email] Subject: Verify your Arkivra email');
  });

  test('rejects console delivery when verification is required in production', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        NODE_ENV: 'production',
        ARKIVRA_AUTH_SECRET: 'production-auth-secret',
        ARKIVRA_AUTH_EMAIL_VERIFICATION_REQUIRED: 'true',
      },
    });

    expect(() => createAuthEmailServices({ config })).toThrow(/ARKIVRA_SMTP_URL/);
  });

  test('rejects missing sender for SMTP configuration', () => {
    const { config } = parseConfig({
      env: {
        ...requiredEnv,
        ARKIVRA_SMTP_URL: 'smtp://smtp.example.com',
        ARKIVRA_EMAIL_FROM: '',
      },
    });

    expect(() => createAuthEmailServices({ config })).toThrow(/ARKIVRA_EMAIL_FROM/);
  });
});
