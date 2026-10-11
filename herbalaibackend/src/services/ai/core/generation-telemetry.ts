type GenerationResponse = {
  candidates?: { finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
};

const finishReasons = new Set([
  'FINISH_REASON_UNSPECIFIED', 'STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'LANGUAGE', 'OTHER',
  'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'MALFORMED_FUNCTION_CALL', 'IMAGE_SAFETY',
  'IMAGE_PROHIBITED_CONTENT', 'IMAGE_OTHER', 'NO_IMAGE', 'IMAGE_RECITATION', 'UNEXPECTED_TOOL_CALL',
  'TOO_MANY_TOOL_CALLS', 'MISSING_THOUGHT_SIGNATURE', 'MALFORMED_RESPONSE', 'ESCALATION', 'PUP_LIMITED_DISABLED',
]);
const blockReasons = new Set(['BLOCK_REASON_UNSPECIFIED', 'SAFETY', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY']);
const safeLabel = (value: string | undefined, allowed: Set<string>) => value === undefined
  ? null : allowed.has(value) ? value : 'UNKNOWN';
const safeCount = (value: number | undefined) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
  ? value : null;

export const recordGenerationOutcome = (
  model: string,
  transport: 'json' | 'stream',
  maxOutputTokens: number,
  response: GenerationResponse,
): void => {
  console.info(JSON.stringify({
    event: 'dr_ai_generation_outcome',
    model: /^(?:models\/)?[a-zA-Z0-9_.-]{1,100}$/.test(model) ? model : 'UNKNOWN',
    transport,
    maxOutputTokens: safeCount(maxOutputTokens),
    finishReason: safeLabel(response.candidates?.[0]?.finishReason, finishReasons),
    blockReason: safeLabel(response.promptFeedback?.blockReason, blockReasons),
    promptTokens: safeCount(response.usageMetadata?.promptTokenCount),
    responseTokens: safeCount(response.usageMetadata?.candidatesTokenCount),
    thoughtsTokens: safeCount(response.usageMetadata?.thoughtsTokenCount),
    totalTokens: safeCount(response.usageMetadata?.totalTokenCount),
  }));
};
