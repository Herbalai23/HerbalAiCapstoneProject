export const SUBMISSION_VIEWS = ['active', 'history', 'all'] as const;
export const SUBMISSION_SCOPES = ['mine', 'all'] as const;

export type RegistrationNameFields = { firstName: string; lastName: string; name?: string };

export type AccountPasswordCapability = {
  hasLocalPassword: boolean | null;
  passwordStatus: 'set' | 'unset' | 'unknown';
};

export type EmailDeliveryStatus = 'requested' | 'provider_accepted' | 'suppressed' | 'unavailable' | 'not_required';

export type AiCompletionMetadata = { completion: 'complete' };

export type AiCompletionError = {
  code: 'AI_RESPONSE_INCOMPLETE' | 'AI_RESPONSE_BLOCKED';
  message: string;
  retryable: boolean;
  creditStatus: 'not_reserved' | 'released' | 'recovery_pending';
};

export type AiRequestError = Omit<AiCompletionError, 'code'> & {
  code: AiCompletionError['code'] | 'AI_UNAVAILABLE' | 'AI_CREDIT_ERROR';
};

export type SubmissionHistoryPage<Suggestion> = {
  suggestions: (Suggestion & { historyEligibleAt: string | null })[];
  total: number;
  page: number;
  limit: number;
  view: typeof SUBMISSION_VIEWS[number];
  scope: typeof SUBMISSION_SCOPES[number];
  counts: { active: number; history: number; all: number };
  asOf: string;
};
