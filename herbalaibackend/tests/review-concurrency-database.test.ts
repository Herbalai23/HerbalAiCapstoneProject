import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { adminEditDatabaseBoundary } from './helpers/admin-edit-database-boundary.js';
import { prisma } from '../src/lib/prisma.js';
import { createSuggestion, requestChanges, rejectSuggestion } from '../src/repositories/suggest.repository.js';

const enabled = adminEditDatabaseBoundary(process.env['HERBALAI_TEST_DATABASE_URL'], process.env['DATABASE_URL'], process.env['CI'] === 'true');

describe.skipIf(!enabled)('Real isolated concurrent suggestion decisions', () => {
  it('allows exactly one simultaneous decision, with one revision and one audit entry', async () => {
    const identity = await prisma.$queryRaw<Array<{ database: string; host: string }>>`SELECT current_database() AS database, host(inet_server_addr()) AS host`;
    expect(identity[0]?.database).toBe('herbalai_test');
    expect(['127.0.0.1', '::1']).toContain(identity[0]?.host);
    const suffix = randomUUID();
    const users = [`qa-owner-${suffix}`, `qa-reviewer-a-${suffix}`, `qa-reviewer-b-${suffix}`];
    let submissionId: number | undefined;
    try {
      for (const [index, id] of users.entries()) {
        await prisma.user.create({ data: { id, username: id, email: `${id}@example.invalid`, name: 'Isolated QA fixture',
          password: 'disabled-test-only', isBanned: true, role: index === 0 ? 'contributor' : 'admin' } });
      }
      const submission = await createSuggestion({ submitterId: users[0]!, localName: `QA ${suffix}`, scientificName: `QA ${suffix}`,
        category: 'Test only', medicinalUses: 'No medicinal use', preparationMethod: 'Do not use', dosage: 'None', informationSource: 'Synthetic QA fixture' });
      submissionId = submission.id;
      expect(Number.isInteger(submission.id) && submission.id > 0).toBe(true);
      const results = await Promise.all([
        requestChanges(submission.id, users[1]!, 'Please clarify the test-only source.', submission.revision),
        rejectSuggestion(submission.id, users[2]!, submission.revision, 'Rejected test fixture'),
      ]);
      expect(results.filter(result => result !== null)).toHaveLength(1);
      expect(results.filter(result => result === null)).toHaveLength(1);
      const saved = await prisma.suggestedHerb.findUniqueOrThrow({ where: { id: submission.id } });
      expect(['ChangesRequested', 'Rejected']).toContain(saved.status);
      expect(saved.revision).toBe(submission.revision + 1);
      expect(await prisma.auditLog.count({ where: { targetType: 'SuggestedHerb', targetId: String(submission.id), adminId: { in: users } } })).toBe(1);
      expect(await requestChanges(submission.id, users[1]!, 'Repeated outdated test-only request.', submission.revision)).toBeNull();
    } finally {
      try {
        if (typeof submissionId === 'number') await prisma.suggestedHerb.deleteMany({ where: { id: submissionId, submitterId: users[0]! } });
      } finally {
        await prisma.auditLog.deleteMany({ where: { adminId: { in: users } } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      }
    }
  });
});
