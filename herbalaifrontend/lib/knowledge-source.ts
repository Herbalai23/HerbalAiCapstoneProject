export type KnowledgeSource = {
  title: string;
  publisher: string;
  url: string;
  unavailable: boolean;
  availabilityNote: string;
};

export const getKnowledgePrimarySource = (metadata: Record<string, unknown> | null): KnowledgeSource | null => {
  const sources = metadata?.sources;
  if (!Array.isArray(sources) || !sources[0] || typeof sources[0] !== 'object') return null;
  const source = sources[0] as Record<string, unknown>;
  const availability = source.availability && typeof source.availability === 'object'
    ? source.availability as Record<string, unknown> : null;
  const unavailable = availability?.status === 'unavailable';
  const rawUrl = typeof source.url === 'string' ? source.url : '';
  const safeUrl = URL.canParse(rawUrl) && ['http:', 'https:'].includes(new URL(rawUrl).protocol) ? rawUrl : '';
  return {
    title: typeof source.title === 'string' ? source.title : '',
    publisher: typeof source.publisher === 'string' ? source.publisher : '',
    url: unavailable ? '' : safeUrl,
    unavailable,
    availabilityNote: unavailable
      ? typeof availability?.note === 'string' ? availability.note : 'Online source unavailable. The historical citation is retained.'
      : '',
  };
};
