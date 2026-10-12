const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

export const suggestionEditPath = (id: number): string => {
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new Error('Invalid submission identifier.');
  return `/suggest?edit=${id}`;
};

export const buildSuggestionChangesEmail = (input: {
  id: number; localName: string; reviewNotes: string; name: string; email: string; frontendUrl: string; appName: string;
}) => {
  const origin = new URL(input.frontendUrl);
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))) {
    throw new Error('Submission links require HTTPS.');
  }
  const link = new URL(suggestionEditPath(input.id), origin.origin).toString();
  return {
    to: input.email,
    subject: `${input.appName} - Changes requested for your herb suggestion`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:20px auto;padding:20px">
      <h2>Changes requested for your herb suggestion</h2>
      <p>Hello ${escapeHtml(input.name)},</p>
      <p>An administrator requested changes to <strong>${escapeHtml(input.localName)}</strong>.</p>
      <h3>Required changes</h3>
      <div style="white-space:pre-wrap">${escapeHtml(input.reviewNotes)}</div>
      <p><a href="${escapeHtml(link)}">Edit submission</a></p>
      <p>Sign in to the account that submitted this herb, review the notes, and choose Resubmit. Your revised submission will return to Pending for administrator review.</p>
      <p>This link does not grant access to another person's submission. If the request has already been resolved, check My Submissions for its current status.</p>
    </div>`,
  };
};
