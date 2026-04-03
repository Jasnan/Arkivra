import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { TagsServices } from './tags.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import { createTagsServices } from './tags.services.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { requireVaultAccess, requireVaultPermission } from '../vaults/vaults.middleware.js';
import { createVaultsServices } from '../vaults/vaults.services.js';

function parseTagName(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const name = value.trim();
  return name.length > 0 ? name : null;
}

function parseTagColor(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const color = value.trim();

  if (!/^#[\da-f]{6}$/i.test(color)) {
    return null;
  }

  return color;
}

export function registerTagRoutes({
  app,
  db,
  services,
  vaultServices,
}: {
  app: Hono<ServerContext>;
  db: Database;
  services?: TagsServices;
  vaultServices?: VaultsServices;
}) {
  const vaultsServices = vaultServices ?? createVaultsServices({ db });
  const tagsServices = services ?? createTagsServices({ db });

  app.use('/api/vaults/:vaultId/tags', requireAuthentication());
  app.use('/api/vaults/:vaultId/tags/*', requireAuthentication());
  app.use('/api/vaults/:vaultId/documents/:documentId/tags', requireAuthentication());
  app.use('/api/vaults/:vaultId/documents/:documentId/tags/*', requireAuthentication());
  app.use('/api/vaults/:vaultId/tags', requireVaultAccess({ services: vaultsServices }));
  app.use('/api/vaults/:vaultId/tags/*', requireVaultAccess({ services: vaultsServices }));
  app.use(
    '/api/vaults/:vaultId/documents/:documentId/tags',
    requireVaultAccess({ services: vaultsServices }),
  );
  app.use(
    '/api/vaults/:vaultId/documents/:documentId/tags/*',
    requireVaultAccess({ services: vaultsServices }),
  );

  app.get('/api/vaults/:vaultId/tags', async (context) => {
    const vaultId = context.get('vaultId');

    if (vaultId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const tags = await tagsServices.listTags({ vaultId });
    return context.json({ tags });
  });

  app.post('/api/vaults/:vaultId/tags', requireVaultPermission('tags.manage'), async (context) => {
    const vaultId = context.get('vaultId');

    if (vaultId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const body = await context.req.json();
    const name = parseTagName(body.name);
    const color = parseTagColor(body.color);

    if (name === null) {
      return context.json(
        { error: { code: 'tag.invalid_name', message: 'Tag name is required' } },
        400,
      );
    }

    if (body.color !== undefined && body.color !== null && color === null) {
      return context.json(
        {
          error: {
            code: 'tag.invalid_color',
            message: 'Tag color must be a hex color like #A1B2C3',
          },
        },
        400,
      );
    }

    try {
      const tag = await tagsServices.createTag({ vaultId, name, color });
      return context.json({ tag }, 201);
    } catch (error) {
      if (error instanceof Error && error.message.includes('tags_vault_name_unique')) {
        return context.json(
          {
            error: {
              code: 'tag.duplicate',
              message: 'A tag with this name already exists in the vault',
            },
          },
          409,
        );
      }

      throw error;
    }
  });

  app.patch(
    '/api/vaults/:vaultId/tags/:tagId',
    requireVaultPermission('tags.manage'),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const tagId = context.req.param('tagId');
      const body = await context.req.json();
      const name = parseTagName(body.name);
      const color = parseTagColor(body.color);

      if (name === null) {
        return context.json(
          { error: { code: 'tag.invalid_name', message: 'Tag name is required' } },
          400,
        );
      }

      if (body.color !== undefined && body.color !== null && color === null) {
        return context.json(
          {
            error: {
              code: 'tag.invalid_color',
              message: 'Tag color must be a hex color like #A1B2C3',
            },
          },
          400,
        );
      }

      try {
        const tag = await tagsServices.updateTag({ tagId, vaultId, name, color });

        if (tag === null) {
          return context.json({ error: { code: 'tag.not_found', message: 'Tag not found' } }, 404);
        }

        return context.json({ tag });
      } catch (error) {
        if (error instanceof Error && error.message.includes('tags_vault_name_unique')) {
          return context.json(
            {
              error: {
                code: 'tag.duplicate',
                message: 'A tag with this name already exists in the vault',
              },
            },
            409,
          );
        }

        throw error;
      }
    },
  );

  app.delete(
    '/api/vaults/:vaultId/tags/:tagId',
    requireVaultPermission('tags.manage'),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const tagId = context.req.param('tagId');
      const tag = await tagsServices.deleteTag({ tagId, vaultId });

      if (tag === null) {
        return context.json({ error: { code: 'tag.not_found', message: 'Tag not found' } }, 404);
      }

      return context.body(null, 204);
    },
  );

  app.get(
    '/api/vaults/:vaultId/documents/:documentId/tags',
    requireVaultPermission('documents.read'),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const tags = await tagsServices.listDocumentTags({ vaultId, documentId });
      return context.json({ tags });
    },
  );

  app.post(
    '/api/vaults/:vaultId/documents/:documentId/tags',
    requireVaultPermission('tags.manage'),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const body = await context.req.json();
      const tagId = typeof body.tagId === 'string' && body.tagId.length > 0 ? body.tagId : null;

      if (tagId === null) {
        return context.json(
          { error: { code: 'tag.invalid_assignment', message: 'tagId is required' } },
          400,
        );
      }

      const result = await tagsServices.assignTagToDocument({ vaultId, documentId, tagId });

      if (!result.success) {
        if (result.reason === 'document_not_found') {
          return context.json(
            { error: { code: 'document.not_found', message: 'Document not found' } },
            404,
          );
        }

        return context.json({ error: { code: 'tag.not_found', message: 'Tag not found' } }, 404);
      }

      return context.json({ tag: result.tag }, 201);
    },
  );

  app.delete(
    '/api/vaults/:vaultId/documents/:documentId/tags/:tagId',
    requireVaultPermission('tags.manage'),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const tagId = context.req.param('tagId');
      const result = await tagsServices.removeTagFromDocument({ vaultId, documentId, tagId });

      if (result === null) {
        return context.json(
          { error: { code: 'tag.assignment_not_found', message: 'Tag assignment not found' } },
          404,
        );
      }

      return context.body(null, 204);
    },
  );
}
