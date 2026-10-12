import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ find: vi.fn(), approve: vi.fn(), requestChanges: vi.fn(), reject: vi.fn(), notify: vi.fn(), embed: vi.fn(), mail: vi.fn(), emit: vi.fn(), resubmit: vi.fn(), upload: vi.fn(), user: vi.fn() }));
vi.mock('../src/repositories/suggest.repository.js', () => ({ findSuggestionById: mocks.find, approveSuggestion: mocks.approve, requestChanges: mocks.requestChanges, rejectSuggestion: mocks.reject, resubmitSuggestion: mocks.resubmit }));
vi.mock('../src/lib/prisma.js', () => ({ prisma: { herb: { findFirst: vi.fn(async () => null) }, suggestedHerb: { findFirst: vi.fn(async () => null) }, user: { findUnique: mocks.user } } }));
vi.mock('../src/repositories/herb.repository.js', () => ({ invalidateHerbCache: vi.fn() }));
vi.mock('../src/repositories/notification.repository.js', () => ({ createNotification: mocks.notify }));
vi.mock('../src/services/ai/core/gemini-service.js', () => ({ generateEmbedding: mocks.embed }));
vi.mock('../src/services/cloudinary.service.js', () => ({ uploadToCloudinary: mocks.upload }));
vi.mock('../src/lib/mailer.js', () => ({ sendMail: mocks.mail }));
vi.mock('../src/server.js', () => ({ io: { to: () => ({ emit: mocks.emit }) } }));

import { SuggestController } from '../src/controllers/suggest.controller.js';
import { approveSuggestionSchema, requestSuggestionChangesSchema, rejectSuggestionSchema } from '../src/schema/suggest.schema.js';
import { validateSchema } from '../src/middlewares/validate.js';
import { errorResponse } from '../src/utils/error-response.js';

const app = express();
const controller = new SuggestController();
app.use(express.json());
app.use((req, _res, next) => { Object.assign(req, { user: { userId: 'qa-admin', role: 'admin' } }); next(); });
app.post('/:id/approve', validateSchema(approveSuggestionSchema), controller.approveSuggestion);
app.post('/:id/request-changes', validateSchema(requestSuggestionChangesSchema), controller.requestChanges);
app.post('/:id/reject', validateSchema(rejectSuggestionSchema), controller.rejectSuggestion);
app.post('/:id/resubmit', controller.resubmit);
app.get('/:id', controller.getOwnSuggestion);
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  const response = errorResponse(error, false);
  res.status(response.status).json(response.body);
});

const content = { localName: 'QA', scientificName: 'QA only', category: 'Test', medicinalUses: 'None', preparationMethod: 'None', dosage: 'None', informationSource: 'QA citation' };
const body = { revision: 2, evidenceClass: 'DOCUMENTED_TRADITIONAL_USE', reviewNotes: 'Please clarify the source.' };
describe('Review HTTP results and side effects', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.find.mockResolvedValue({ ...content, id: 7, status: 'Pending', revision: 2, submitterId: 'qa-owner', references: [{ title: 'QA source', citation: 'QA citation', supports: ['identity', 'medicinalUses', 'preparationMethod', 'dosage'] }] });
    mocks.embed.mockResolvedValue([1, 0]);
    mocks.notify.mockResolvedValue({ id: 1 });
    mocks.user.mockResolvedValue({ name: 'QA', email: 'qa@example.invalid' });
    mocks.mail.mockResolvedValue(undefined);
  });

  it.each(['approve', 'request-changes', 'reject'])('requires a browser revision for %s', async (action) => {
    const { revision, ...withoutRevision } = body;
    expect((await request(app).post(`/7/${action}`).send(withoutRevision)).status).toBe(400);
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.requestChanges).not.toHaveBeenCalled();
    expect(mocks.reject).not.toHaveBeenCalled();
  });

  it.each(['approve', 'request-changes', 'reject'])('returns conflict for a lost %s race without notifications', async (action) => {
    mocks.approve.mockResolvedValue(null);
    mocks.requestChanges.mockResolvedValue(null);
    mocks.reject.mockResolvedValue(null);
    const response = await request(app).post(`/7/${action}`).send(body);
    expect(response.status).toBe(409);
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.mail).not.toHaveBeenCalled();
  });

  it('returns a safe error when a transaction cannot start', async () => {
    mocks.requestChanges.mockRejectedValue(Object.assign(new Error('Transaction API error: Unable to start a transaction in the given time.'), { code: 'P2028' }));
    const response = await request(app).post('/7/request-changes').send(body);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('DATABASE_UNAVAILABLE');
    expect(response.body.message).toContain('Refresh');
    expect(response.body).not.toHaveProperty('stack');
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it.each(['approve', 'request-changes', 'reject'])('returns conflict for %s on an already decided submission', async (action) => {
    mocks.find.mockResolvedValue({ id: 7, status: 'Approved', revision: 3 });
    expect((await request(app).post(`/7/${action}`).send(body)).status).toBe(409);
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.requestChanges).not.toHaveBeenCalled();
    expect(mocks.reject).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('stops publication when embedding generation fails', async () => {
    mocks.embed.mockRejectedValue(new Error('Test provider failure'));
    expect((await request(app).post('/7/approve').send(body)).status).toBe(503);
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('blocks publication when references do not cover every published claim field', async () => {
    mocks.find.mockResolvedValue({ ...content, id: 7, status: 'Pending', revision: 2, submitterId: 'qa-owner', references: [{ title: 'Identity only', citation: 'QA citation', supports: ['identity'] }] });
    const response = await request(app).post('/7/approve').send(body);
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('identity, medicinal uses, preparation, dosage');
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.mail).not.toHaveBeenCalled();
  });

  it.each(['identity', 'medicinalUses', 'preparationMethod', 'dosage', 'warnings'])
    ('blocks approval with missing %s coverage before any side effect', async (missingField) => {
      const supports = ['identity', 'medicinalUses', 'preparationMethod', 'dosage', 'warnings'].filter((field) => field !== missingField);
      mocks.find.mockResolvedValue({
        ...content, id: 7, status: 'Pending', revision: 2, submitterId: 'qa-owner',
        warnings: 'Safety information is limited.', references: [{ title: 'QA source', citation: 'QA citation', supports }],
      });
      const response = await request(app).post('/7/approve').send(body);
      expect(response.status).toBe(400);
      expect(mocks.embed).not.toHaveBeenCalled();
      expect(mocks.approve).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();
      expect(mocks.mail).not.toHaveBeenCalled();
    });

  it('publishes warnings with coverage distributed across reviewed references', async () => {
    mocks.find.mockResolvedValue({
      ...content, id: 7, status: 'Pending', revision: 2, submitterId: 'qa-owner', warnings: 'Safety information is limited.',
      references: [
        { title: 'Identity and uses', citation: 'QA reference A', supports: ['identity', 'medicinalUses'] },
        { title: 'Preparation and safety', citation: 'QA reference B', supports: ['preparationMethod', 'dosage', 'warnings'] },
      ],
    });
    mocks.approve.mockResolvedValue({ id: 'qa-herb' });
    expect((await request(app).post('/7/approve').send(body)).status).toBe(200);
    expect(mocks.approve).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it('publishes once and sends notification only after repository success', async () => {
    mocks.approve.mockResolvedValue({ id: 'qa-herb' });
    const response = await request(app).post('/7/approve').send(body);
    expect(response.status).toBe(200);
    expect(mocks.approve).toHaveBeenCalledWith(7, 'qa-admin', '[1,0]', body.evidenceClass, body.reviewNotes, 2);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.mail).toHaveBeenCalledTimes(1);
    expect(mocks.approve.mock.invocationCallOrder[0]).toBeLessThan(mocks.notify.mock.invocationCallOrder[0]!);
  });

  it('does not turn a committed publication into a failure when notifications fail', async () => {
    mocks.approve.mockResolvedValue({ id: 'qa-herb' });
    mocks.notify.mockRejectedValue(new Error('Test notification failure'));
    expect((await request(app).post('/7/approve').send(body)).status).toBe(200);
    expect(mocks.approve).toHaveBeenCalledTimes(1);
  });

  it('passes rejection notes to the repository', async () => {
    mocks.reject.mockResolvedValue({ id: 7, status: 'Rejected' });
    const response = await request(app).post('/7/reject').send({ revision: 2, reviewNotes: '  QA reason  ' });
    expect(response.status).toBe(200);
    expect(mocks.reject).toHaveBeenCalledWith(7, 'qa-admin', 2, 'QA reason');
  });

  it('does not repeat or report failed publication when email delivery fails', async () => {
    mocks.approve.mockResolvedValue({ id: 'qa-herb' });
    mocks.mail.mockRejectedValue(new Error('Test mail failure'));
    expect((await request(app).post('/7/approve').send(body)).status).toBe(200);
    expect(mocks.approve).toHaveBeenCalledTimes(1);
    expect(mocks.mail).toHaveBeenCalledTimes(1);
  });

  it('preserves an existing image when the owner resubmits without uploading', async () => {
    mocks.find.mockResolvedValue({ ...content, id: 7, submitterId: 'qa-admin', status: 'ChangesRequested', imageUrl: '/images/herbs/qa.jpg' });
    mocks.resubmit.mockResolvedValue({ id: 7, status: 'Pending' });
    expect((await request(app).post('/7/resubmit').send(content)).status).toBe(200);
    expect(mocks.resubmit).toHaveBeenCalledWith(7, 'qa-admin', expect.objectContaining({ imageUrl: '/images/herbs/qa.jpg' }));
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('saves a change request and sends an exact-submission notification and email once', async () => {
    mocks.requestChanges.mockResolvedValue({ id: 7, status: 'ChangesRequested' });
    mocks.mail.mockResolvedValue({ id: 'qa-accepted' });
    const response = await request(app).post('/7/request-changes').send(body);
    expect(response.status).toBe(200);
    expect(response.body.data.notificationDelivery).toEqual({ inAppStatus: 'created', emailStatus: 'provider_accepted' });
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'qa-owner', link: '/suggest?edit=7' }));
    expect(mocks.mail).toHaveBeenCalledTimes(1);
    expect(mocks.mail).toHaveBeenCalledWith(expect.objectContaining({ to: 'qa@example.invalid', html: expect.stringContaining('/suggest?edit=7') }));
    expect(mocks.requestChanges.mock.invocationCallOrder[0]).toBeLessThan(mocks.mail.mock.invocationCallOrder[0]!);
  });

  it.each(['failure', 'suppressed', 'missing recipient'])('preserves the review decision when email delivery is %s', async scenario => {
    mocks.requestChanges.mockResolvedValue({ id: 7, status: 'ChangesRequested' });
    if (scenario === 'failure') mocks.mail.mockRejectedValue(new Error('Private provider detail'));
    if (scenario === 'suppressed') mocks.mail.mockResolvedValue({ suppressed: true, messageId: 'qa-suppressed' });
    if (scenario === 'missing recipient') mocks.user.mockResolvedValue(null);
    const response = await request(app).post('/7/request-changes').send(body);
    expect(response.status).toBe(200);
    expect(response.body.data.suggestion.status).toBe('ChangesRequested');
    expect(response.body.data.notificationDelivery.emailStatus).toBe(scenario === 'failure' ? 'unavailable' : scenario === 'suppressed' ? 'suppressed' : 'no_recipient');
    expect(JSON.stringify(response.body)).not.toContain('Private provider detail');
    expect(mocks.requestChanges).toHaveBeenCalledTimes(1);
  });

  it('attempts email independently if the in-app notification fails', async () => {
    mocks.requestChanges.mockResolvedValue({ id: 7, status: 'ChangesRequested' });
    mocks.notify.mockRejectedValue(new Error('QA notification failure'));
    mocks.mail.mockResolvedValue({ id: 'qa-accepted' });
    const response = await request(app).post('/7/request-changes').send(body);
    expect(response.status).toBe(200);
    expect(response.body.data.notificationDelivery).toEqual({ inAppStatus: 'unavailable', emailStatus: 'provider_accepted' });
    expect(mocks.mail).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'Short', '         ', 'x'.repeat(2001)])('rejects invalid revision notes before any mutation or mail: %s', notes => {
    return request(app).post('/7/request-changes').send({ revision: 2, reviewNotes: notes }).then(response => {
      expect(response.status).toBe(400);
      expect(mocks.requestChanges).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();
      expect(mocks.mail).not.toHaveBeenCalled();
    });
  });

  it('sends one email and one notice for two concurrent decisions when only one repository claim wins', async () => {
    let claimed = false;
    mocks.requestChanges.mockImplementation(async () => {
      if (claimed) return null;
      claimed = true;
      return { id: 7, status: 'ChangesRequested' };
    });
    mocks.mail.mockResolvedValue({ id: 'qa-accepted' });
    const responses = await Promise.all([
      request(app).post('/7/request-changes').send(body), request(app).post('/7/request-changes').send(body),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.mail).toHaveBeenCalledTimes(1);
  });

  it('returns no detail for a nonexistent linked submission without triggering notifications', async () => {
    mocks.find.mockResolvedValue(null);
    const response = await request(app).get('/7');
    expect(response.status).toBe(404);
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.mail).not.toHaveBeenCalled();
  });

  it('opens only the authenticated owner\'s exact submission with no-store caching', async () => {
    mocks.find.mockResolvedValue({ ...content, id: 7, submitterId: 'qa-admin', status: 'ChangesRequested' });
    const response = await request(app).get('/7');
    expect(response.status).toBe(200);
    expect(response.body.data.suggestion.id).toBe(7);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('does not grant another submission access even to an admin following the owner link', async () => {
    const response = await request(app).get('/7');
    expect(response.status).toBe(404);
    expect(response.body).not.toHaveProperty('data');
  });

  it.each(['0', '-1', '1.5', '2147483648', '07'])('rejects an invalid owner-detail ID %s before storage access', async id => {
    expect((await request(app).get(`/${id}`)).status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('requires authentication before reading owner-only details', async () => {
    const anonymous = express();
    anonymous.get('/:id', controller.getOwnSuggestion);
    expect((await request(anonymous).get('/7')).status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
  });
});
