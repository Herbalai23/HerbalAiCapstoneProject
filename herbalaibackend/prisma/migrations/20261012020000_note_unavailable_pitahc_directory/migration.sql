UPDATE "HerbSource"
SET
  url = NULL,
  citation = CASE
    WHEN POSITION('Online source unavailable: HTTP 404 observed on 12 October 2026.' IN COALESCE(citation, '')) > 0
      THEN citation
    ELSE CONCAT_WS(E'\n', NULLIF(citation, ''), 'Online source unavailable: HTTP 404 observed on 12 October 2026. Historical source URL: https://pitahc.gov.ph/herbs-directory/ The original reference is retained; current online access is not verified.')
  END
WHERE url = 'https://pitahc.gov.ph/herbs-directory/';

UPDATE "KnowledgeBase"
SET metadata = JSONB_SET(metadata, '{sources}', (
  SELECT JSONB_AGG(
    CASE WHEN source->>'url' = 'https://pitahc.gov.ph/herbs-directory/' THEN
      source || JSONB_BUILD_OBJECT('availability', JSONB_BUILD_OBJECT(
        'status', 'unavailable',
        'httpStatus', 404,
        'observedOn', '2026-10-12',
        'originalUrl', 'https://pitahc.gov.ph/herbs-directory/',
        'note', 'Online source unavailable: HTTP 404 observed on 12 October 2026. Historical source URL: https://pitahc.gov.ph/herbs-directory/ The original reference is retained; current online access is not verified.'
      ))
    ELSE source END ORDER BY position
  )
  FROM JSONB_ARRAY_ELEMENTS(CASE
    WHEN JSONB_TYPEOF(metadata->'sources') = 'array' THEN metadata->'sources'
    ELSE '[]'::jsonb
  END) WITH ORDINALITY AS entries(source, position)
))
WHERE JSONB_TYPEOF(metadata->'sources') = 'array'
  AND metadata->'sources' @> '[{"url":"https://pitahc.gov.ph/herbs-directory/"}]'::jsonb;
