WITH tag_merge AS (
  SELECT
    id AS source_id,
    first_value(id) OVER (
      PARTITION BY lower(name)
      ORDER BY created_at ASC, id ASC
    ) AS canonical_id,
    row_number() OVER (
      PARTITION BY lower(name)
      ORDER BY created_at ASC, id ASC
    ) AS merge_rank
  FROM public.tags
),
duplicate_tag_assignments AS (
  SELECT document_tags.document_id, document_tags.tag_id
  FROM public.document_tags AS document_tags
  INNER JOIN tag_merge
    ON tag_merge.source_id = document_tags.tag_id
  WHERE tag_merge.merge_rank > 1
    AND EXISTS (
      SELECT 1
      FROM public.document_tags AS canonical_document_tags
      WHERE canonical_document_tags.document_id = document_tags.document_id
        AND canonical_document_tags.tag_id = tag_merge.canonical_id
    )
)
DELETE FROM public.document_tags
USING duplicate_tag_assignments
WHERE public.document_tags.document_id = duplicate_tag_assignments.document_id
  AND public.document_tags.tag_id = duplicate_tag_assignments.tag_id;

WITH tag_merge AS (
  SELECT
    id AS source_id,
    first_value(id) OVER (
      PARTITION BY lower(name)
      ORDER BY created_at ASC, id ASC
    ) AS canonical_id,
    row_number() OVER (
      PARTITION BY lower(name)
      ORDER BY created_at ASC, id ASC
    ) AS merge_rank
  FROM public.tags
)
UPDATE public.document_tags
SET tag_id = tag_merge.canonical_id
FROM tag_merge
WHERE public.document_tags.tag_id = tag_merge.source_id
  AND tag_merge.merge_rank > 1;

WITH tag_merge AS (
  SELECT
    id AS source_id,
    row_number() OVER (
      PARTITION BY lower(name)
      ORDER BY created_at ASC, id ASC
    ) AS merge_rank
  FROM public.tags
)
DELETE FROM public.tags
USING tag_merge
WHERE public.tags.id = tag_merge.source_id
  AND tag_merge.merge_rank > 1;

ALTER TABLE ONLY public.tags
  DROP CONSTRAINT IF EXISTS tags_vault_name_unique;

ALTER TABLE ONLY public.tags
  DROP CONSTRAINT IF EXISTS tags_vault_id_fkey;

ALTER TABLE ONLY public.tags
  DROP COLUMN vault_id;

CREATE UNIQUE INDEX tags_name_unique
  ON public.tags USING btree (lower(name));
