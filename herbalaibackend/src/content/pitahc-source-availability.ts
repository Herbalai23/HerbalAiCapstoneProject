export const PITAHC_DIRECTORY_URL = 'https://pitahc.gov.ph/herbs-directory/';

export const PITAHC_DIRECTORY_UNAVAILABLE_CITATION =
  `Online source unavailable: HTTP 404 observed on 12 October 2026. Historical source URL: ${PITAHC_DIRECTORY_URL} The original reference is retained; current online access is not verified.`;

export const PITAHC_DIRECTORY_AVAILABILITY = {
  status: 'unavailable',
  httpStatus: 404,
  observedOn: '2026-10-12',
  originalUrl: PITAHC_DIRECTORY_URL,
  note: PITAHC_DIRECTORY_UNAVAILABLE_CITATION,
} as const;

export function annotatePitahcSourceAvailability(metadata: Record<string, unknown>): Record<string, unknown>;
export function annotatePitahcSourceAvailability(metadata: undefined): undefined;
export function annotatePitahcSourceAvailability(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined;
export function annotatePitahcSourceAvailability(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata || !Array.isArray(metadata.sources)) return metadata;
  return {
    ...metadata,
    sources: metadata.sources.map((source: unknown) => {
      if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
      const record = source as Record<string, unknown>;
      return record.url === PITAHC_DIRECTORY_URL
        ? { ...record, availability: { ...PITAHC_DIRECTORY_AVAILABILITY } } : source;
    }),
  };
}
