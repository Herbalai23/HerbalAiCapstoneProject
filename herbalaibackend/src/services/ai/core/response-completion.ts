type CompletionResponse = {
  candidates?: { finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

const promptBlocked = (response: CompletionResponse) => Boolean(response.promptFeedback?.blockReason
  && response.promptFeedback.blockReason !== 'BLOCK_REASON_UNSPECIFIED');

export class AiResponseError extends Error {
  readonly code: 'AI_RESPONSE_INCOMPLETE' | 'AI_RESPONSE_BLOCKED';
  readonly retryable: boolean;

  constructor(blocked = false) {
    super(blocked
      ? 'Dr. Ai could not provide this answer safely. Please rephrase your question.'
      : 'Dr. Ai could not finish the answer. Please try a shorter, more specific question.');
    this.name = 'AiResponseError';
    this.code = blocked ? 'AI_RESPONSE_BLOCKED' : 'AI_RESPONSE_INCOMPLETE';
    this.retryable = !blocked;
  }
}

const blockedReasons = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY']);

export const assertResponseComplete = (response: CompletionResponse, text: string): void => {
  const reason = response.candidates?.[0]?.finishReason;
  if (promptBlocked(response) || (reason && blockedReasons.has(reason))) {
    throw new AiResponseError(true);
  }
  if (reason !== 'STOP' || !text.trim() || /(?:^|\n)\s*#{1,6}\s*$/.test(text)) {
    throw new AiResponseError();
  }
};

export const assertChunkNotBlocked = (response: CompletionResponse): void => {
  const reason = response.candidates?.[0]?.finishReason;
  if (promptBlocked(response) || (reason && blockedReasons.has(reason))) {
    throw new AiResponseError(true);
  }
  if (reason && reason !== 'STOP') throw new AiResponseError();
};
