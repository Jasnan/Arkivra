import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminAiSettingsPage,
  AdminBackupsPage,
  AdminOverviewPage,
  AdminUserAccessPage,
  AdminUsersPage,
} from '@/features/admin/pages/admin-page';
import { AboutSettingsPage } from '@/features/settings/pages/about-settings-page';
import { renderWithProviders } from '@/test/utils';

const authClientMock = vi.hoisted(() => ({
  useSession: vi.fn(() => ({
    data: {
      user: {
        name: 'Alex',
        email: 'alex@example.com',
        emailVerified: true,
        twoFactorEnabled: true,
      },
    },
    isPending: false,
  })),
  updateUser: vi.fn(),
  changeEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  changePassword: vi.fn(),
  signIn: {
    social: vi.fn(),
  },
  twoFactor: {
    verifyTotp: vi.fn(),
  },
  signOut: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: authClientMock,
}));
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const defaultAiModelCatalog = [
  {
    provider: 'ollama',
    model: 'gemma4:e4b',
    label: 'Gemma 4 E4B',
    capabilities: ['chat', 'vision'],
  },
  {
    provider: 'ollama',
    model: 'qwen2.5:7b',
    capabilities: ['chat'],
  },
  {
    provider: 'ollama',
    model: 'bge-m3',
    capabilities: ['embedding'],
    embeddingDimensions: 1024,
  },
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    capabilities: ['chat', 'vision'],
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    capabilities: ['chat', 'vision'],
  },
];

const adminMeResponse = {
  userId: 'usr_admin',
  sessionId: 'ses_admin',
  systemRole: 'admin',
  systemCapabilities: ['system.create_vaults'],
  isAdmin: true,
  canCreateVault: true,
};

type OllamaModelFixture = {
  name: string;
  size: number;
  modifiedAt: string;
  capabilities: string[];
  available: boolean;
  embeddingDimensions?: number;
};

function createAiSettingsFixture({
  aiFeaturesEnabled = true,
  chatModel = 'gemma4:e4b',
  embeddingModel = 'bge-m3',
  embeddingDimensions = 1024,
  geminiConfigured = false,
  host = 'http://127.0.0.1:11434',
  translationModel = 'gemma4:e4b',
}: {
  aiFeaturesEnabled?: boolean;
  chatModel?: string;
  embeddingModel?: string | null;
  embeddingDimensions?: number | null;
  geminiConfigured?: boolean;
  host?: string;
  translationModel?: string;
} = {}) {
  const hasEmbeddingSelection = embeddingModel !== null && embeddingDimensions !== null;

  return {
    aiFeaturesEnabled,
    chat: {
      provider: 'ollama',
      baseUrl: host,
      apiKeySecretRef: null,
      model: chatModel,
      allowedModels: chatModel ? [`ollama:${chatModel}`] : [],
    },
    translation: {
      provider: 'ollama',
      baseUrl: host,
      apiKeySecretRef: null,
      model: translationModel,
    },
    embedding: {
      provider: hasEmbeddingSelection ? 'ollama' : null,
      baseUrl: hasEmbeddingSelection ? host : '',
      apiKeySecretRef: null,
      model: embeddingModel,
      dimensions: embeddingDimensions,
    },
    providers: {
      gemini: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKeySecretRef: null,
        configured: geminiConfigured,
      },
    },
    ollamaHost: host,
    model: chatModel,
  };
}

function createAiStatusFixture(settings = createAiSettingsFixture()) {
  return {
    aiFeaturesEnabled: settings.aiFeaturesEnabled,
    chat: {
      provider: settings.chat.provider,
      baseUrl: settings.chat.baseUrl,
      model: settings.chat.model,
      allowedModels: settings.chat.allowedModels,
    },
    embedding: {
      semanticSearchAvailable: settings.aiFeaturesEnabled,
      activeIndex: null,
      candidateIndexes: [],
      recentIndexes: [],
      chunkCoverage: {
        indexedChunkCount: 0,
        totalChunkCount: 0,
      },
    },
  };
}

const ollamaModelFixtures: Record<string, OllamaModelFixture> = {
  chat: {
    name: 'gemma4:e4b',
    size: 1024,
    modifiedAt: '2026-04-14T19:00:00.000Z',
    capabilities: ['chat', 'vision'],
    available: true,
  },
  alternateChat: {
    name: 'qwen2.5:7b',
    size: 1024,
    modifiedAt: '2026-04-14T19:00:00.000Z',
    capabilities: ['chat'],
    available: true,
  },
  embedding: {
    name: 'bge-m3',
    size: 1024,
    modifiedAt: '2026-04-14T19:00:00.000Z',
    capabilities: ['embedding'],
    available: true,
    embeddingDimensions: 1024,
  },
};

function createOllamaAvailability({
  host = 'http://127.0.0.1:11434',
  model = 'gemma4:e4b',
  modelAvailable = true,
  models = [ollamaModelFixtures.chat, ollamaModelFixtures.embedding],
  reachable = true,
} = {}) {
  return {
    host,
    model,
    reachable,
    modelAvailable,
    models,
    responseTimeMs: reachable ? 42 : null,
    error: reachable ? null : `Could not reach Ollama at ${host}.`,
  };
}

function installAiSettingsFetchMock({
  geminiAvailability = {
    host: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.5-flash',
    reachable: false,
    modelAvailable: false,
    models: [],
    responseTimeMs: null,
    error: 'Gemini API key environment variable is not configured on the API server.',
  },
  ollamaAvailability,
  settings,
  status = createAiStatusFixture(settings),
}: {
  geminiAvailability?: unknown;
  ollamaAvailability?: unknown;
  settings: ReturnType<typeof createAiSettingsFixture>;
  status?: ReturnType<typeof createAiStatusFixture>;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === '/api/me') {
      return jsonResponse(adminMeResponse);
    }

    if (url === '/api/admin/ai/settings' && (!init || init.method === undefined)) {
      return jsonResponse({ settings });
    }

    if (url === '/api/admin/ai/settings' && init?.method === 'PUT') {
      return jsonResponse({ settings: JSON.parse(String(init.body)) });
    }

    if (url === '/api/admin/ai/status') {
      return jsonResponse({ status });
    }

    if (url === '/api/admin/ai/model-catalog') {
      return jsonResponse({ models: defaultAiModelCatalog });
    }

    if (url === '/api/admin/ai/availability' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      return jsonResponse({
        availability: body.provider === 'gemini' ? geminiAvailability : ollamaAvailability,
      });
    }

    throw new Error(`Unhandled request ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function installLocalStorageMock() {
  const store = new Map<string, string>();

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key);
      }),
    },
  });

  return store;
}

describe('admin and about pages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    installLocalStorageMock();
    authClientMock.useSession.mockReturnValue({
      data: {
        user: {
          name: 'Alex',
          email: 'alex@example.com',
          emailVerified: true,
          twoFactorEnabled: true,
        },
      },
      isPending: false,
    });
    authClientMock.updateUser.mockResolvedValue({ error: null });
    authClientMock.changeEmail.mockResolvedValue({ error: null });
    authClientMock.sendVerificationEmail.mockResolvedValue({ error: null });
    authClientMock.changePassword.mockResolvedValue({ error: null });
    authClientMock.signIn.social.mockResolvedValue({ error: null });
    authClientMock.twoFactor.verifyTotp.mockResolvedValue({ error: null });
    authClientMock.signOut.mockResolvedValue({ error: null });
    authClientMock.listSessions.mockResolvedValue({
      data: [
        {
          id: 'ses_1',
          token: 'tok_current',
          userAgent: 'Chrome on macOS',
          ipAddress: '127.0.0.1',
          createdAt: '2026-05-15T09:00:00.000Z',
          updatedAt: '2026-05-15T09:10:00.000Z',
        },
      ],
      error: null,
    });
    authClientMock.revokeSession.mockResolvedValue({ error: null });
    authClientMock.revokeOtherSessions.mockResolvedValue({ error: null });
  });

  it('loads admin data and triggers backup and user actions', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_admin',
          sessionId: 'ses_admin',
          systemRole: 'admin',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: true,
          canCreateVault: true,
        });
      }

      if (url === '/api/admin/permission-requests?status=pending') {
        return jsonResponse({
          requests: [
            {
              id: 'req_1',
              type: 'vault.create',
              status: 'pending',
              requestedBy: 'usr_1',
              reviewedBy: null,
              reviewedAt: null,
              vaultId: null,
              targetUserId: null,
              payload: { name: 'Requests Vault' },
              result: null,
              createdAt: '2026-04-14T19:00:00.000Z',
              updatedAt: '2026-04-14T19:00:00.000Z',
            },
          ],
        });
      }

      if (url === '/api/admin/backups' && (!init || init.method === undefined)) {
        return jsonResponse({
          backups: [
            {
              id: 'arkivra-backup-1.tar.gz',
              fileName: 'arkivra-backup-1.tar.gz',
              size: 1024,
              createdAt: '2026-04-14T18:00:00.000Z',
              format: 'legacy_tar_gz',
              partCount: 1,
              restorable: true,
              corruptReason: null,
            },
          ],
        });
      }

      if (url === '/api/admin/backups' && init?.method === 'POST') {
        return jsonResponse({ jobId: 'job_backup_1' }, 202);
      }

      if (url === '/api/admin/backups/restore' && init?.method === 'POST') {
        return jsonResponse({ jobId: 'job_restore_1' }, 202);
      }

      if (url === '/api/admin/users' && (!init || init.method === undefined)) {
        return jsonResponse({
          users: [
            {
              id: 'usr_1',
              email: 'alex@example.com',
              name: 'Alex',
              emailVerified: true,
              twoFactorEnabled: true,
              disabledAt: null,
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-10T00:00:00.000Z',
              systemRole: 'member',
              systemCapabilities: [],
              isAdmin: false,
              canCreateVault: false,
              authMethods: {
                hasPassword: true,
                oauthProviders: ['google'],
                primaryOAuthProvider: 'google',
              },
            },
          ],
        });
      }

      if (url === '/api/admin/users/usr_1' && init?.method === 'PATCH') {
        return jsonResponse({
          user: {
            id: 'usr_1',
            email: 'alex@example.com',
            name: 'Alex',
            emailVerified: true,
            twoFactorEnabled: true,
            disabledAt: '2026-04-14T19:00:00.000Z',
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-14T19:00:00.000Z',
            systemRole: 'member',
            systemCapabilities: [],
            isAdmin: false,
            canCreateVault: false,
            authMethods: {
              hasPassword: true,
              oauthProviders: ['google'],
              primaryOAuthProvider: 'google',
            },
          },
        });
      }

      if (url === '/api/admin/users/usr_1/admin' && init?.method === 'POST') {
        return jsonResponse({
          user: {
            id: 'usr_1',
            email: 'alex@example.com',
            name: 'Alex',
            emailVerified: true,
            twoFactorEnabled: true,
            disabledAt: null,
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-14T19:00:00.000Z',
            systemRole: 'admin',
            systemCapabilities: ['system.create_vaults'],
            isAdmin: true,
            canCreateVault: true,
            authMethods: {
              hasPassword: true,
              oauthProviders: ['google'],
              primaryOAuthProvider: 'google',
            },
          },
        });
      }

      if (url === '/api/admin/ai/settings' && (!init || init.method === undefined)) {
        return jsonResponse({
          settings: {
            aiFeaturesEnabled: true,
            chat: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: 'gemma4:e4b',
            },
            embedding: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: 'bge-m3',
              dimensions: 1024,
            },
            providers: {
              gemini: {
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
                apiKeySecretRef: null,
              },
            },
            ollamaHost: 'http://127.0.0.1:11434',
            model: 'gemma4:e4b',
          },
        });
      }

      if (url === '/api/admin/ai/status') {
        return jsonResponse({
          status: {
            aiFeaturesEnabled: true,
            chat: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              model: 'gemma4:e4b',
            },
            embedding: {
              semanticSearchAvailable: true,
              activeIndex: {
                id: 'eix_active',
                providerConfigId: 'aip_embedding',
                provider: 'ollama',
                model: 'bge-m3',
                dimensions: 1024,
                distanceMetric: 'cosine',
                status: 'active',
                isActive: true,
                expectedChunkCount: 10,
                embeddedChunkCount: 10,
                failedChunkCount: 0,
                failureMessage: null,
                buildStartedAt: '2026-04-14T18:00:00.000Z',
                buildCompletedAt: '2026-04-14T18:05:00.000Z',
                activatedAt: '2026-04-14T18:06:00.000Z',
                createdAt: '2026-04-14T18:00:00.000Z',
                updatedAt: '2026-04-14T18:06:00.000Z',
                documentStatuses: {
                  pending: 0,
                  indexing: 0,
                  ready: 2,
                  failed: 0,
                  stale: 0,
                  skipped: 0,
                },
              },
              candidateIndexes: [],
              recentIndexes: [],
              chunkCoverage: {
                indexedChunkCount: 10,
                totalChunkCount: 10,
              },
            },
          },
        });
      }

      if (url === '/api/admin/ai/settings' && init?.method === 'PUT') {
        return jsonResponse({
          settings: JSON.parse(String(init.body)),
        });
      }

      if (url === '/api/admin/ai/model-catalog') {
        return jsonResponse({ models: defaultAiModelCatalog });
      }

      if (url === '/api/admin/ai/models' && init?.method === 'POST') {
        return jsonResponse({
          models: [
            {
              name: 'gemma4:e4b',
              size: 1024,
              modifiedAt: '2026-04-14T19:00:00.000Z',
              capabilities: ['completion', 'vision'],
            },
            {
              name: 'qwen2.5:7b',
              size: 2048,
              modifiedAt: '2026-04-14T19:30:00.000Z',
              capabilities: ['completion'],
            },
            {
              name: 'bge-m3',
              size: 512,
              modifiedAt: '2026-04-14T19:45:00.000Z',
              capabilities: ['embedding'],
            },
          ],
        });
      }

      if (url === '/api/admin/ai/availability' && init?.method === 'POST') {
        return jsonResponse({
          availability: {
            host: 'http://127.0.0.1:11434',
            model: 'gemma4:e4b',
            reachable: true,
            modelAvailable: true,
            models: [
              {
                name: 'gemma4:e4b',
                size: 1024,
                modifiedAt: '2026-04-14T19:00:00.000Z',
                capabilities: ['completion', 'vision'],
              },
            ],
            responseTimeMs: 42,
            error: null,
          },
        });
      }

      if (url === '/api/admin/vaults') {
        return jsonResponse({
          vaults: [
            {
              id: 'vlt_1',
              name: 'Invoices Vault',
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-10T00:00:00.000Z',
              ownerUserId: 'usr_owner',
              ownerEmail: 'owner@example.com',
              ownerName: 'Owner',
              memberCount: 3,
            },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    let view = await renderWithProviders(<AdminOverviewPage />);
    expect(await screen.findByText(/1 vault/i)).toBeInTheDocument();
    expect(await screen.findByText(/invoices vault/i)).toBeInTheDocument();
    expect(screen.getByText(/owner@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/3 members/i)).toBeInTheDocument();
    view.unmount();

    view = await renderWithProviders(<AdminBackupsPage />);
    expect(await screen.findByText(/arkivra-backup-1.tar.gz/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/backups',
        expect.objectContaining({
          credentials: 'include',
          method: 'POST',
        }),
      );
    });

    await user.click(screen.getByRole('button', { name: /restore/i }));
    expect(await screen.findByRole('dialog', { name: /restore backup/i })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /destructive and replaces/i }));
    await user.click(screen.getByRole('button', { name: /queue restore/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/backups/restore',
        expect.objectContaining({
          credentials: 'include',
          method: 'POST',
        }),
      );
    });
    view.unmount();

    view = await renderWithProviders(<AdminUsersPage />);
    expect(await screen.findByText(/alex@example.com/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /user actions for alex@example.com/i }));
    const accessAction = screen.getByRole('menuitem', { name: /access/i });
    const deactivateAction = screen.getByRole('menuitem', { name: /deactivate user/i });
    expect(accessAction).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /resend invitation/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /view activity/i })).toBeInTheDocument();
    await user.hover(accessAction);
    expect(accessAction).toHaveAttribute('data-active', 'true');
    expect(deactivateAction).not.toHaveAttribute('data-active', 'true');
    await user.click(deactivateAction);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/users/usr_1',
        expect.objectContaining({
          credentials: 'include',
          method: 'PATCH',
        }),
      );
    });
    view.unmount();

    await renderWithProviders(<AdminAiSettingsPage />);
    expect((await screen.findAllByText('No embedding models available')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /choose embedding model/i })).not.toBeInTheDocument();
  });

  it('opens a compact invite dialog focused on identity and system permissions', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_admin',
          sessionId: 'ses_admin',
          systemRole: 'admin',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: true,
          canCreateVault: true,
        });
      }

      if (url === '/api/admin/users') {
        return jsonResponse({
          users: [
            {
              id: 'usr_1',
              email: 'alex@example.com',
              name: 'Alex',
              emailVerified: true,
              twoFactorEnabled: true,
              disabledAt: null,
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-10T00:00:00.000Z',
              systemRole: 'member',
              systemCapabilities: [],
              isAdmin: false,
              canCreateVault: false,
              authMethods: {
                hasPassword: true,
                oauthProviders: ['google'],
                primaryOAuthProvider: 'google',
              },
            },
          ],
        });
      }

      if (url === '/api/admin/vaults') {
        return jsonResponse({
          vaults: [
            {
              id: 'vlt_1',
              name: 'Invoices Vault',
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-10T00:00:00.000Z',
              ownerUserId: 'usr_owner',
              ownerEmail: 'owner@example.com',
              ownerName: 'Owner',
              memberCount: 3,
            },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<AdminUsersPage />);
    await user.click(await screen.findByRole('button', { name: /^invite$/i }));

    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /system role/i })).toBeInTheDocument();
    expect(screen.getAllByText(/can create vaults/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/the user will receive an email invitation to create their account/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/invitation flow/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /user information/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /system permissions/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /optional starter access/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/starter vault/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/add another vault/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ai features/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/the invited user will receive an email with instructions/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/no ai access/i)).not.toBeInTheDocument();
  });

  it('shows Ollama connection as server environment configuration', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_admin',
          sessionId: 'ses_admin',
          systemRole: 'admin',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: true,
          canCreateVault: true,
        });
      }

      if (url === '/api/admin/ai/settings' && (!init || init.method === undefined)) {
        return jsonResponse({
          settings: {
            aiFeaturesEnabled: true,
            chat: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: '',
            },
            embedding: {
              provider: 'ollama',
              baseUrl: '',
              apiKeySecretRef: null,
              model: '',
              dimensions: 1024,
            },
            ollamaHost: 'http://127.0.0.1:11434',
            model: '',
          },
        });
      }

      if (url === '/api/admin/ai/status') {
        return jsonResponse({
          status: {
            aiFeaturesEnabled: true,
            chat: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              model: '',
            },
            embedding: {
              semanticSearchAvailable: true,
              activeIndex: null,
              candidateIndexes: [],
              recentIndexes: [],
              chunkCoverage: {
                indexedChunkCount: 0,
                totalChunkCount: 0,
              },
            },
          },
        });
      }

      if (url === '/api/admin/ai/model-catalog') {
        return jsonResponse({ models: defaultAiModelCatalog });
      }

      if (url === '/api/admin/ai/models' && init?.method === 'POST') {
        return jsonResponse({
          models: [],
        });
      }

      if (url === '/api/admin/ai/availability' && init?.method === 'POST') {
        return jsonResponse({
          availability: {
            host: 'http://127.0.0.1:11434',
            model: 'gemma4:e4b',
            reachable: true,
            modelAvailable: true,
            models: [
              {
                name: 'gemma4:e4b',
                size: 1024,
                modifiedAt: '2026-04-14T19:00:00.000Z',
                capabilities: ['completion', 'vision'],
              },
            ],
            responseTimeMs: 42,
            error: null,
          },
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<AdminAiSettingsPage />);

    await user.click(await screen.findByRole('button', { name: /view providers/i }));
    const providerDetailButtons = await screen.findAllByRole('button', { name: /view details/i });
    await user.click(providerDetailButtons.at(-1)!);
    expect(
      await screen.findByText(
        /providers are read-only and configured through environment variables/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('http://127.0.0.1:11434')).toBeInTheDocument();
    expect(screen.queryByLabelText(/ollama base url/i)).not.toBeInTheDocument();

    const saveCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === '/api/admin/ai/settings' && init?.method === 'PUT',
    );
    expect(saveCall).toBeUndefined();
  });

  it('allows selecting an installed Ollama model when the configured default is unavailable', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_admin',
          sessionId: 'ses_admin',
          systemRole: 'admin',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: true,
          canCreateVault: true,
        });
      }

      if (url === '/api/admin/ai/settings' && (!init || init.method === undefined)) {
        return jsonResponse({
          settings: {
            aiFeaturesEnabled: true,
            chat: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: 'gemma4:e4b',
              allowedModels: ['ollama:gemma4:e4b'],
            },
            translation: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: 'gemma4:e4b',
            },
            embedding: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: 'bge-m3',
              dimensions: 1024,
            },
            providers: {
              gemini: {
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
                apiKeySecretRef: null,
                configured: true,
              },
            },
            ollamaHost: 'http://127.0.0.1:11434',
            model: 'gemma4:e4b',
          },
        });
      }

      if (url === '/api/admin/ai/status') {
        return jsonResponse({
          status: {
            aiFeaturesEnabled: true,
            chat: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              model: 'gemma4:e4b',
              allowedModels: ['ollama:gemma4:e4b'],
            },
            embedding: {
              semanticSearchAvailable: false,
              activeIndex: null,
              candidateIndexes: [],
              recentIndexes: [],
              chunkCoverage: {
                indexedChunkCount: 0,
                totalChunkCount: 0,
              },
            },
          },
        });
      }

      if (url === '/api/admin/ai/model-catalog') {
        return jsonResponse({ models: defaultAiModelCatalog });
      }

      if (url === '/api/admin/ai/availability' && init?.method === 'POST') {
        return jsonResponse({
          availability: {
            host: 'http://127.0.0.1:11434',
            model: 'gemma4:e4b',
            reachable: true,
            modelAvailable: false,
            models: [
              {
                name: 'qwen2.5:7b',
                size: 1024,
                modifiedAt: '2026-04-14T19:00:00.000Z',
                capabilities: ['chat'],
                source: 'live',
                available: true,
                availabilityReason: null,
              },
              {
                name: 'bge-m3',
                size: 1024,
                modifiedAt: '2026-04-14T19:00:00.000Z',
                capabilities: ['embedding'],
                source: 'live',
                available: true,
                availabilityReason: null,
                embeddingDimensions: 1024,
              },
            ],
            responseTimeMs: 42,
            error:
              'Model "gemma4:e4b" is configured in Arkivra but is not available in Ollama at http://127.0.0.1:11434. Available chat-capable models: qwen2.5:7b.',
          },
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<AdminAiSettingsPage />);

    await user.click(await screen.findByRole('button', { name: /configure models/i }));

    const dialog = await screen.findByRole('dialog', { name: /configure chat models/i });
    expect(within(dialog).getAllByText('qwen2.5:7b').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText('Gemma 4 E4B')).not.toBeInTheDocument();
  });

  it('falls back to the no-provider state when runtime providers are removed', async () => {
    const settings = createAiSettingsFixture({
      aiFeaturesEnabled: true,
      chatModel: '',
      embeddingModel: 'bge-m3',
      host: '',
      translationModel: '',
    });
    installAiSettingsFetchMock({
      settings,
      ollamaAvailability: createOllamaAvailability({ host: '', reachable: false }),
    });

    await renderWithProviders(<AdminAiSettingsPage />);

    expect((await screen.findAllByText('AI is not configured')).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Configure a provider when you want features like AI search/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('AI is enabled')).not.toBeInTheDocument();
    expect(screen.queryByText('AI is ready')).not.toBeInTheDocument();
    expect(screen.queryByText('bge-m3')).not.toBeInTheDocument();
  });

  it('shows no Embedding Models available when provider discovery finds no embedding models', async () => {
    const settings = createAiSettingsFixture({
      aiFeaturesEnabled: false,
      embeddingModel: null,
      embeddingDimensions: null,
    });
    installAiSettingsFetchMock({
      settings,
      ollamaAvailability: createOllamaAvailability({
        model: 'gemma4:e4b',
        modelAvailable: true,
        models: [ollamaModelFixtures.chat],
      }),
    });

    await renderWithProviders(<AdminAiSettingsPage />);

    expect((await screen.findAllByText('No embedding models available')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /choose embedding model/i })).not.toBeInTheDocument();
    expect(screen.queryByText('AI is ready')).not.toBeInTheDocument();
    expect(screen.queryByText('AI is enabled')).not.toBeInTheDocument();
  });

  it('returns to no Embedding Models available when the selected Embedding Model disappears and no alternatives exist', async () => {
    const settings = createAiSettingsFixture({ aiFeaturesEnabled: true });
    installAiSettingsFetchMock({
      settings,
      ollamaAvailability: createOllamaAvailability({
        model: 'gemma4:e4b',
        modelAvailable: true,
        models: [ollamaModelFixtures.chat],
      }),
    });

    await renderWithProviders(<AdminAiSettingsPage />);

    expect((await screen.findAllByText('No embedding models available')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /choose embedding model/i })).not.toBeInTheDocument();
    expect(screen.queryByText('AI is enabled')).not.toBeInTheDocument();
    expect(screen.queryByText('AI is ready')).not.toBeInTheDocument();
  });

  it('returns to choose embedding model when the saved Embedding Model disappears and alternatives exist', async () => {
    const settings = createAiSettingsFixture({ aiFeaturesEnabled: true });
    installAiSettingsFetchMock({
      settings,
      ollamaAvailability: createOllamaAvailability({
        model: 'gemma4:e4b',
        modelAvailable: true,
        models: [
          ollamaModelFixtures.chat,
          {
            name: 'embeddinggemma:300m',
            size: 1024,
            modifiedAt: '2026-04-14T19:00:00.000Z',
            capabilities: ['embedding'],
            available: true,
            embeddingDimensions: 768,
          },
        ],
      }),
    });

    await renderWithProviders(<AdminAiSettingsPage />);

    expect(await screen.findByText('AI needs setup')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /choose embedding model/i }).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText('AI is enabled')).not.toBeInTheDocument();
    expect(screen.queryByText('AI is ready')).not.toBeInTheDocument();
    expect(screen.queryByText(/Embedding Model:/i)).not.toBeInTheDocument();
  });

  it('keeps AI enabled when only the translation model disappears', async () => {
    const settings = createAiSettingsFixture({
      aiFeaturesEnabled: true,
      translationModel: 'granite4.1:3b',
    });
    installAiSettingsFetchMock({
      settings,
      ollamaAvailability: createOllamaAvailability({
        model: 'gemma4:e4b',
        modelAvailable: true,
        models: [
          { ...ollamaModelFixtures.chat, capabilities: ['chat'] },
          ollamaModelFixtures.embedding,
        ],
      }),
    });

    await renderWithProviders(<AdminAiSettingsPage />);

    expect(await screen.findByText('AI is enabled')).toBeInTheDocument();
    expect(screen.getAllByText('Needs configuration').length).toBeGreaterThan(0);
    expect(screen.getByText('No translation model selected.')).toBeInTheDocument();
    expect(screen.getByText('AI Search')).toBeInTheDocument();
    expect(screen.getByText('AI Chat')).toBeInTheDocument();
  });

  it('keeps AI enabled when only the default chat model disappears', async () => {
    const settings = createAiSettingsFixture({
      aiFeaturesEnabled: true,
      chatModel: 'granite4.1:3b',
    });
    installAiSettingsFetchMock({
      settings,
      ollamaAvailability: createOllamaAvailability({
        model: 'granite4.1:3b',
        modelAvailable: false,
        models: [ollamaModelFixtures.alternateChat, ollamaModelFixtures.embedding],
      }),
    });

    await renderWithProviders(<AdminAiSettingsPage />);

    expect(await screen.findByText('AI is enabled')).toBeInTheDocument();
    expect(screen.getAllByText('Needs configuration').length).toBeGreaterThan(0);
    expect(screen.getByText('No default chat model selected.')).toBeInTheDocument();
    expect(screen.getByText('AI Search')).toBeInTheDocument();
  });

  it('does not preselect a chat model when multiple chat models are available', async () => {
    const user = userEvent.setup();
    const settings = createAiSettingsFixture({
      aiFeaturesEnabled: true,
      chatModel: '',
      translationModel: '',
    });
    installAiSettingsFetchMock({
      settings,
      ollamaAvailability: createOllamaAvailability({
        model: '',
        modelAvailable: false,
        models: [
          ollamaModelFixtures.chat,
          ollamaModelFixtures.alternateChat,
          ollamaModelFixtures.embedding,
        ],
      }),
    });

    await renderWithProviders(<AdminAiSettingsPage />);

    await user.click(await screen.findByRole('button', { name: /configure models/i }));

    const dialog = await screen.findByRole('dialog', { name: /configure chat models/i });
    expect(within(dialog).getByText('Enabled Models (0)')).toBeInTheDocument();
    expect(within(dialog).getByText('0 models enabled · select an enabled default model')).toBeInTheDocument();
    expect(within(dialog).queryByText('Default model')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /save chat models/i })).toBeDisabled();
  });

  it('requires choosing a Embedding Model when multiple embedding models are discovered', async () => {
    const settings = createAiSettingsFixture({
      aiFeaturesEnabled: false,
      embeddingModel: null,
      embeddingDimensions: null,
    });
    installAiSettingsFetchMock({
      settings,
      ollamaAvailability: createOllamaAvailability({
        models: [
          ollamaModelFixtures.chat,
          ollamaModelFixtures.embedding,
          {
            name: 'embeddinggemma:300m',
            size: 1024,
            modifiedAt: '2026-04-14T19:00:00.000Z',
            capabilities: ['embedding'],
            available: true,
            embeddingDimensions: 768,
          },
        ],
      }),
    });

    await renderWithProviders(<AdminAiSettingsPage />);

    expect(await screen.findByText('AI needs setup')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /choose embedding model/i }).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText('AI is ready')).not.toBeInTheDocument();
    expect(screen.queryByText('AI is enabled')).not.toBeInTheDocument();
  });

  it('reuses a previously saved Embedding Model when it is still available', async () => {
    const settings = createAiSettingsFixture({ aiFeaturesEnabled: false });
    installAiSettingsFetchMock({
      settings,
      ollamaAvailability: createOllamaAvailability({
        models: [ollamaModelFixtures.chat, ollamaModelFixtures.embedding],
      }),
    });

    await renderWithProviders(<AdminAiSettingsPage />);

    expect(await screen.findByText('AI is ready')).toBeInTheDocument();
    expect(screen.queryByText(/Embedding Model:/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /choose embedding model/i })).not.toBeInTheDocument();
    expect(screen.queryByText('AI needs setup')).not.toBeInTheDocument();
  });

  it('prompts to confirm the only discovered Embedding Model before marking AI ready', async () => {
    const user = userEvent.setup();
    const settings = createAiSettingsFixture({
      aiFeaturesEnabled: false,
      embeddingModel: null,
      embeddingDimensions: null,
    });
    const fetchMock = installAiSettingsFetchMock({
      settings,
      ollamaAvailability: createOllamaAvailability({
        models: [ollamaModelFixtures.chat, ollamaModelFixtures.embedding],
      }),
    });

    await renderWithProviders(<AdminAiSettingsPage />);

    expect(await screen.findByText('AI needs setup')).toBeInTheDocument();
    const dialog = await screen.findByRole('dialog', { name: /choose embedding model/i });
    expect(within(dialog).getByText('bge-m3')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/admin/ai/settings',
      expect.objectContaining({ method: 'PUT' }),
    );

    await user.click(within(dialog).getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/ai/settings',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"model":"bge-m3"'),
        }),
      );
    });
  });

  it('keeps Embedding Model unselected when the automatic single-model prompt is closed', async () => {
    const user = userEvent.setup();
    const settings = createAiSettingsFixture({
      aiFeaturesEnabled: false,
      embeddingModel: null,
      embeddingDimensions: null,
    });
    const fetchMock = installAiSettingsFetchMock({
      settings,
      ollamaAvailability: createOllamaAvailability({
        models: [ollamaModelFixtures.chat, ollamaModelFixtures.embedding],
      }),
    });

    await renderWithProviders(<AdminAiSettingsPage />);

    expect(await screen.findByText('AI needs setup')).toBeInTheDocument();
    const dialog = await screen.findByRole('dialog', { name: /choose embedding model/i });

    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /choose embedding model/i })).not.toBeInTheDocument();
    });
    expect(screen.getByText('AI needs setup')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /choose embedding model/i }).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText('AI is ready')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/admin/ai/settings',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('shows a stable loading state while provider discovery is pending', async () => {
    const settings = createAiSettingsFixture({ aiFeaturesEnabled: false });
    let resolveAvailabilityGate!: () => void;
    const availabilityGate = new Promise<void>((resolve) => {
      resolveAvailabilityGate = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse(adminMeResponse);
      }

      if (url === '/api/admin/ai/settings' && (!init || init.method === undefined)) {
        return jsonResponse({ settings });
      }

      if (url === '/api/admin/ai/status') {
        return jsonResponse({ status: createAiStatusFixture(settings) });
      }

      if (url === '/api/admin/ai/model-catalog') {
        return jsonResponse({ models: defaultAiModelCatalog });
      }

      if (url === '/api/admin/ai/availability' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        await availabilityGate;
        return jsonResponse({
          availability:
            body.provider === 'ollama'
              ? createOllamaAvailability()
              : {
                  host: 'https://generativelanguage.googleapis.com/v1beta/openai',
                  model: 'gemini-3.5-flash',
                  reachable: false,
                  modelAvailable: false,
                  models: [],
                  responseTimeMs: null,
                  error: 'Gemini API key environment variable is not configured on the API server.',
                },
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<AdminAiSettingsPage />);

    expect(await screen.findByText('Checking AI configuration')).toBeInTheDocument();
    expect(screen.queryByText('AI is ready')).not.toBeInTheDocument();
    expect(screen.queryByText('AI needs setup')).not.toBeInTheDocument();

    resolveAvailabilityGate();
    expect(await screen.findByText('AI is ready')).toBeInTheDocument();
  });

  it('keeps capability cards disabled in the ready state until AI is enabled', async () => {
    const settings = createAiSettingsFixture({ aiFeaturesEnabled: false });
    installAiSettingsFetchMock({
      settings,
      ollamaAvailability: createOllamaAvailability(),
    });

    await renderWithProviders(<AdminAiSettingsPage />);

    expect(await screen.findByText('AI is ready')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Setup is complete. Enable AI to start indexing your documents and make AI features available.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enable ai/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^configure$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /configure models/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /configure model/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('Will become available after AI is enabled.')).toHaveLength(3);
    expect(screen.getAllByText('Ready')).toHaveLength(1);
  });

  it('does not show semantic indexing as building when there are no document chunks', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_admin',
          sessionId: 'ses_admin',
          systemRole: 'admin',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: true,
          canCreateVault: true,
        });
      }

      if (url === '/api/admin/ai/settings' && (!init || init.method === undefined)) {
        return jsonResponse({
          settings: {
            aiFeaturesEnabled: true,
            chat: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: 'gemma4:e4b',
              allowedModels: ['gemma4:e4b'],
            },
            translation: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: 'gemma4:e4b',
            },
            embedding: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: 'bge-m3',
              dimensions: 1024,
            },
            providers: {
              gemini: {
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
                apiKeySecretRef: null,
                configured: true,
              },
            },
            ollamaHost: 'http://127.0.0.1:11434',
            model: 'gemma4:e4b',
          },
        });
      }

      if (url === '/api/admin/ai/status') {
        return jsonResponse({
          status: {
            aiFeaturesEnabled: true,
            chat: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              model: 'gemma4:e4b',
              allowedModels: ['gemma4:e4b'],
            },
            embedding: {
              semanticSearchAvailable: true,
              activeIndex: null,
              candidateIndexes: [
                {
                  id: 'eix_empty_building',
                  providerConfigId: 'aip_embedding',
                  provider: 'ollama',
                  model: 'bge-m3',
                  dimensions: 1024,
                  distanceMetric: 'cosine',
                  status: 'building',
                  isActive: false,
                  expectedChunkCount: 0,
                  embeddedChunkCount: 0,
                  failedChunkCount: 0,
                  failureMessage: null,
                  buildStartedAt: '2026-06-19T11:49:00.000Z',
                  buildCompletedAt: null,
                  activatedAt: null,
                  createdAt: '2026-06-19T11:49:00.000Z',
                  updatedAt: '2026-06-19T11:49:00.000Z',
                  documentStatuses: {
                    pending: 0,
                    indexing: 0,
                    ready: 0,
                    failed: 0,
                    stale: 0,
                    skipped: 0,
                  },
                },
              ],
              recentIndexes: [],
              chunkCoverage: {
                indexedChunkCount: 0,
                totalChunkCount: 0,
              },
            },
          },
        });
      }

      if (url === '/api/admin/ai/model-catalog') {
        return jsonResponse({ models: defaultAiModelCatalog });
      }

      if (url === '/api/admin/ai/models' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        return jsonResponse({
          models:
            body.provider === 'ollama'
              ? [
                  {
                    name: 'bge-m3',
                    size: 1024,
                    modifiedAt: '2026-06-19T11:00:00.000Z',
                    capabilities: ['embedding'],
                  },
                  {
                    name: 'gemma4:e4b',
                    size: 1024,
                    modifiedAt: '2026-06-19T11:00:00.000Z',
                    capabilities: ['completion', 'vision'],
                  },
                ]
              : [
                  {
                    name: 'gemini-3.5-flash',
                    size: null,
                    modifiedAt: null,
                    capabilities: ['completion', 'vision'],
                  },
                ],
        });
      }

      if (url === '/api/admin/ai/availability' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        return jsonResponse({
          availability:
            body.provider === 'ollama'
              ? {
                  host: 'http://127.0.0.1:11434',
                  model: 'gemma4:e4b',
                  reachable: true,
                  modelAvailable: true,
                  models: [
                    {
                      name: 'bge-m3',
                      size: 1024,
                      modifiedAt: '2026-06-19T11:00:00.000Z',
                      capabilities: ['embedding'],
                      embeddingDimensions: 1024,
                      available: true,
                    },
                    {
                      name: 'gemma4:e4b',
                      size: 1024,
                      modifiedAt: '2026-06-19T11:00:00.000Z',
                      capabilities: ['chat', 'vision'],
                      available: true,
                    },
                  ],
                  responseTimeMs: 42,
                  error: null,
                }
              : {
                  host: 'https://generativelanguage.googleapis.com/v1beta/openai',
                  model: 'gemini-3.5-flash',
                  reachable: true,
                  modelAvailable: true,
                  models: [],
                  responseTimeMs: 42,
                  error: null,
                },
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<AdminAiSettingsPage />);

    expect(await screen.findByText('No documents')).toBeInTheDocument();
    expect(screen.queryByText(/indexing in progress/i)).not.toBeInTheDocument();
  });

  it('activates Gemini without exposing an API key field in the UI', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_admin',
          sessionId: 'ses_admin',
          systemRole: 'admin',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: true,
          canCreateVault: true,
        });
      }

      if (url === '/api/admin/ai/settings' && (!init || init.method === undefined)) {
        return jsonResponse({
          settings: {
            aiFeaturesEnabled: true,
            chat: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: 'gemma4:e4b',
              allowedModels: ['gemma4:e4b'],
            },
            translation: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: 'gemma4:e4b',
            },
            embedding: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: 'bge-m3',
              dimensions: 1024,
            },
            providers: {
              gemini: {
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
                apiKeySecretRef: null,
                configured: true,
              },
            },
            ollamaHost: 'http://127.0.0.1:11434',
            model: 'gemma4:e4b',
          },
        });
      }

      if (url === '/api/admin/ai/status') {
        return jsonResponse({
          status: {
            aiFeaturesEnabled: true,
            chat: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              model: 'gemma4:e4b',
              allowedModels: ['gemma4:e4b'],
            },
            embedding: {
              semanticSearchAvailable: true,
              activeIndex: null,
              candidateIndexes: [],
              recentIndexes: [],
              chunkCoverage: {
                indexedChunkCount: 0,
                totalChunkCount: 0,
              },
            },
          },
        });
      }

      if (url === '/api/admin/ai/model-catalog') {
        return jsonResponse({ models: defaultAiModelCatalog });
      }

      if (url === '/api/admin/ai/models' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        return jsonResponse({
          models:
            body.provider === 'gemini'
              ? [
                  {
                    name: 'gemini-3.5-flash',
                    size: null,
                    modifiedAt: null,
                    capabilities: ['completion', 'vision'],
                  },
                  {
                    name: 'gemini-2.5-flash',
                    size: null,
                    modifiedAt: null,
                    capabilities: ['completion', 'vision'],
                  },
                ]
              : [
                  {
                    name: 'gemma4:e4b',
                    size: 1024,
                    modifiedAt: '2026-04-14T19:00:00.000Z',
                    capabilities: ['completion', 'vision'],
                  },
                ],
        });
      }

      if (url === '/api/admin/ai/availability' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        if (body.provider === 'ollama') {
          return jsonResponse({
            availability: {
              host: 'http://127.0.0.1:11434',
              model: 'gemma4:e4b',
              reachable: true,
              modelAvailable: true,
              models: [
                {
                  name: 'gemma4:e4b',
                  size: 1024,
                  modifiedAt: '2026-04-14T19:00:00.000Z',
                  capabilities: ['completion', 'vision'],
                },
                {
                  name: 'bge-m3',
                  size: 1024,
                  modifiedAt: '2026-04-14T19:00:00.000Z',
                  capabilities: ['embedding'],
                  embeddingDimensions: 1024,
                },
              ],
              responseTimeMs: 42,
              error: null,
            },
          });
        }

        return jsonResponse({
          availability: {
            host: 'https://generativelanguage.googleapis.com/v1beta/openai',
            model: 'gemini-3.5-flash',
            reachable: true,
            modelAvailable: true,
            models: [
              {
                name: 'gemini-3.5-flash',
                size: null,
                modifiedAt: null,
                capabilities: ['completion', 'vision'],
              },
            ],
            responseTimeMs: 42,
            error: null,
          },
        });
      }

      if (url === '/api/admin/ai/settings' && init?.method === 'PUT') {
        return jsonResponse({ settings: JSON.parse(String(init.body)) });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<AdminAiSettingsPage />);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url, init]) => {
          if (String(url) !== '/api/admin/ai/availability' || init?.method !== 'POST') {
            return false;
          }

          return JSON.parse(String(init.body)).provider === 'gemini';
        }),
      ).toBe(true);
    });
    await user.click(await screen.findByRole('button', { name: /view providers/i }));
    expect(screen.queryByLabelText(/gemini api key environment variable/i)).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /configure models/i }));

    const dialog = await screen.findByRole('dialog', { name: /configure chat models/i });
    await user.click(within(dialog).getAllByRole('button', { name: /enable/i })[0]);
    await user.click(within(dialog).getByText(/set as default/i));
    await user.click(within(dialog).getByRole('button', { name: /save chat models/i }));

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/admin/ai/settings' && init?.method === 'PUT',
      );
      expect(saveCall).toBeDefined();
      const payload = JSON.parse(String(saveCall?.[1]?.body));
      expect(payload.chat).toMatchObject({
        provider: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-3.5-flash',
        apiKeySecretRef: null,
      });
    });
  });

  it('excludes Gemini from selectable chat models when Gemini is not configured', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_admin',
          sessionId: 'ses_admin',
          systemRole: 'admin',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: true,
          canCreateVault: true,
        });
      }

      if (url === '/api/admin/ai/settings' && (!init || init.method === undefined)) {
        return jsonResponse({
          settings: {
            aiFeaturesEnabled: true,
            chat: {
              provider: 'gemini',
              baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
              apiKeySecretRef: null,
              model: 'gemini-3.5-flash',
              allowedModels: ['gemini:gemini-3.5-flash'],
            },
            translation: {
              provider: 'ollama',
              baseUrl: 'http://host.docker.internal:11434',
              apiKeySecretRef: null,
              model: 'gemma4:e4b',
            },
            embedding: {
              provider: 'ollama',
              baseUrl: 'http://host.docker.internal:11434',
              apiKeySecretRef: null,
              model: 'bge-m3',
              dimensions: 1024,
            },
            providers: {
              gemini: {
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
                apiKeySecretRef: null,
              },
            },
            ollamaHost: 'http://host.docker.internal:11434',
            model: 'gemma4:e4b',
          },
        });
      }

      if (url === '/api/admin/ai/status') {
        return jsonResponse({
          status: {
            aiFeaturesEnabled: true,
            chat: {
              provider: 'gemini',
              baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
              model: 'gemini-3.5-flash',
              allowedModels: ['gemini:gemini-3.5-flash'],
            },
            embedding: {
              semanticSearchAvailable: true,
              activeIndex: null,
              candidateIndexes: [],
              recentIndexes: [],
              chunkCoverage: {
                indexedChunkCount: 0,
                totalChunkCount: 0,
              },
            },
          },
        });
      }

      if (url === '/api/admin/ai/model-catalog') {
        return jsonResponse({ models: defaultAiModelCatalog });
      }

      if (url === '/api/admin/ai/models' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        return jsonResponse({
          models:
            body.provider === 'gemini'
              ? [
                  {
                    name: 'gemini-3.5-flash',
                    size: null,
                    modifiedAt: null,
                    capabilities: ['completion', 'vision'],
                  },
                ]
              : [
                  {
                    name: 'gemma4:e4b',
                    size: 1024,
                    modifiedAt: '2026-04-14T19:00:00.000Z',
                    capabilities: ['completion', 'vision'],
                  },
                  {
                    name: 'bge-m3',
                    size: 512,
                    modifiedAt: '2026-04-14T19:45:00.000Z',
                    capabilities: ['embedding'],
                  },
                ],
        });
      }

      if (url === '/api/admin/ai/availability' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        return jsonResponse({
          availability:
            body.provider === 'ollama'
              ? {
                  host: 'http://host.docker.internal:11434',
                  model: 'gemma4:e4b',
                  reachable: true,
                  modelAvailable: true,
                  models: [
                    {
                      name: 'gemma4:e4b',
                      size: 1024,
                      modifiedAt: '2026-04-14T19:00:00.000Z',
                      capabilities: ['chat', 'vision'],
                      available: true,
                    },
                    {
                      name: 'bge-m3',
                      size: 512,
                      modifiedAt: '2026-04-14T19:45:00.000Z',
                      capabilities: ['embedding'],
                      embeddingDimensions: 1024,
                      available: true,
                    },
                  ],
                  responseTimeMs: 42,
                  error: null,
                }
              : {
                  host: 'https://generativelanguage.googleapis.com/v1beta/openai',
                  model: 'gemini-3.5-flash',
                  reachable: false,
                  modelAvailable: false,
                  models: [],
                  responseTimeMs: null,
                  error: 'Gemini API key environment variable is not configured on the API server.',
                },
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<AdminAiSettingsPage />);

    await user.click(await screen.findByRole('button', { name: /configure models/i }));

    const dialog = await screen.findByRole('dialog', { name: /configure chat models/i });
    expect(within(dialog).getAllByText('Gemma 4 E4B').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText('gemini-3.5-flash')).not.toBeInTheDocument();
  });

  it('renders detailed user access management outside the invite modal', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_admin',
          sessionId: 'ses_admin',
          systemRole: 'admin',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: true,
          canCreateVault: true,
        });
      }

      if (url === '/api/admin/users') {
        return jsonResponse({
          users: [
            {
              id: 'usr_1',
              email: 'alex@example.com',
              name: 'Alex',
              emailVerified: true,
              twoFactorEnabled: true,
              disabledAt: null,
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-10T00:00:00.000Z',
              systemRole: 'member',
              systemCapabilities: [],
              isAdmin: false,
              canCreateVault: false,
              authMethods: {
                hasPassword: true,
                oauthProviders: ['google'],
                primaryOAuthProvider: 'google',
              },
            },
          ],
        });
      }

      if (url === '/api/admin/vaults') {
        return jsonResponse({
          vaults: [
            {
              id: 'vlt_1',
              name: 'Invoices Vault',
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-10T00:00:00.000Z',
              ownerUserId: 'usr_owner',
              ownerEmail: 'owner@example.com',
              ownerName: 'Owner',
              memberCount: 3,
            },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<AdminUserAccessPage />, {
      initialEntries: ['/admin/users/usr_1/access'],
      routePath: '/admin/users/:userId/access',
    });

    expect(await screen.findByRole('heading', { name: /user access/i })).toBeInTheDocument();
    expect(screen.getByText(/alex@example.com/i)).toBeInTheDocument();
    expect(
      screen.getByText(/vault permission matrices, AI feature permissions/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Invoices Vault/i)).toBeInTheDocument();
  });

  it('shows app metadata and project links on the settings about page', async () => {
    await renderWithProviders(<AboutSettingsPage />);

    expect((await screen.findAllByText('0.1.0')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /website/i })).toHaveAttribute(
      'href',
      'https://arkivra.app',
    );
    expect(screen.getByRole('link', { name: /documentation/i })).toHaveAttribute(
      'href',
      'https://docs.arkivra.app',
    );
    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute(
      'href',
      'https://github.com/Jasnan/Arkivra',
    );
    expect(screen.getByRole('link', { name: /license/i })).toHaveAttribute(
      'href',
      'https://github.com/Jasnan/arkivra/blob/main/LICENSE',
    );
    expect(screen.getByRole('link', { name: /jasnan thachaparamban/i })).toHaveAttribute(
      'href',
      'https://jasnan.xyz',
    );
    expect(screen.getByLabelText(/arkivra is crafted with ❤️ by/i)).toBeInTheDocument();
    expect(screen.queryByText(/project direction/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/system information/i)).not.toBeInTheDocument();
  });
});
