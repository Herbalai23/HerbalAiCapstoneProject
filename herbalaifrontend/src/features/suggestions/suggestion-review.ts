export const submissionEditId = (search: string): number | null => {
  const value = new URLSearchParams(search).get('edit');
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
};

export const submissionSignInPath = (search: string): string => {
  const id = submissionEditId(search);
  const destination = id === null ? '/suggest' : `/suggest?edit=${id}`;
  return `/signin?${new URLSearchParams({ callbackUrl: destination })}`;
};

export const requestChangesFeedback = (delivery: unknown): string => {
  const status = delivery && typeof delivery === 'object' ? delivery as Record<string, unknown> : {};
  const email = status.emailStatus === 'provider_accepted'
    ? ' Email accepted by the provider; Inbox delivery is not yet confirmed.'
    : status.emailStatus === 'suppressed' ? ' Email delivery was suppressed by the configured delivery mode.'
      : status.emailStatus === 'no_recipient' || status.emailStatus === 'unavailable' ? ' Email notification could not be sent.'
        : ' Email delivery is not confirmed.';
  const notice = status.inAppStatus === 'unavailable' ? ' The in-app notification could not be created; review notes remain in My Submissions.' : '';
  return `Changes requested and review notes saved.${email}${notice}`;
};

export const loadRevisionSubmission = async <Submission extends { id: number; status: string }>(
  id: number, get: () => Promise<{ data?: { status?: string; data?: { suggestion?: Submission } } }>,
): Promise<Submission> => {
  const response = await get();
  const submission = response.data?.data?.suggestion;
  if (response.data?.status !== 'success' || !submission || submission.id !== id) {
    throw new Error('This submission link could not be opened. Check My Submissions.');
  }
  if (submission.status !== 'ChangesRequested') {
    throw new Error('This submission no longer needs revisions. Check its current status in My Submissions.');
  }
  return submission;
};
