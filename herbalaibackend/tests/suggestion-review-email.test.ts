import { describe, expect, it } from 'vitest';
import { buildSuggestionChangesEmail, suggestionEditPath } from '../src/lib/suggestion-review-email.js';

const input = { id: 7, localName: 'QA herb', reviewNotes: 'Please clarify the documented source.', name: 'QA owner',
  email: 'qa@example.invalid', frontendUrl: 'https://www.herbalai.site', appName: 'Herbal-Ai' };

describe('Request-changes email content and navigation', () => {
  it('links to the exact submission on the configured frontend rather than the API host', () => {
    const mail = buildSuggestionChangesEmail(input);
    expect(mail.to).toBe(input.email);
    expect(mail.html).toContain('href="https://www.herbalai.site/suggest?edit=7"');
    expect(mail.html).toContain(input.reviewNotes);
    expect(mail.html).toContain('Sign in to the account that submitted this herb');
  });

  it('escapes administrator notes, plant names and account display names', () => {
    const mail = buildSuggestionChangesEmail({ ...input, localName: '<script>bad</script>', name: '<b>Owner</b>',
      reviewNotes: '<img src=x onerror=bad>\n"quoted" & notes' });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;b&gt;Owner&lt;/b&gt;');
    expect(mail.html).toContain('&quot;quoted&quot; &amp; notes');
  });

  it.each([0, -1, 1.5, 2147483648, NaN])('rejects an invalid submission identifier %s', id => {
    expect(() => suggestionEditPath(id)).toThrow();
  });

  it.each(['javascript:bad', 'http://example.com', 'data:text/plain,bad'])('rejects unsafe frontend origins %s', frontendUrl => {
    expect(() => buildSuggestionChangesEmail({ ...input, frontendUrl })).toThrow();
  });

  it('allows a loopback HTTP origin for isolated development only', () => {
    expect(buildSuggestionChangesEmail({ ...input, frontendUrl: 'http://127.0.0.1:3000' }).html)
      .toContain('http://127.0.0.1:3000/suggest?edit=7');
  });
});
