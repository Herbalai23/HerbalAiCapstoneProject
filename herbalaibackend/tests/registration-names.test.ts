import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signupSchema } from '../src/schema/auth.schema.js';
import { validateSchema } from '../src/middlewares/validate.js';

const base = { username: 'valid_user', email: 'test@example.invalid', password: 'TEST-safe-password' };

describe('Shared registration name contract', () => {
  it.each([
    ['Kevin', 'Mercado'], ['Élisa', 'Muñoza'], ['Åsaka', '山田太郎子'], ['Jose\u0301a', 'Mercado'],
    ['𐐀'.repeat(10), 'Mercado'], ['q\u0301'.repeat(10), 'Mercado'],
  ])('accepts and normalizes Unicode letters for %s %s', (firstName, lastName) => {
    const result = signupSchema.parse({ body: { ...base, firstName, lastName } });
    expect(result.body.name).toBe(`${firstName.normalize('NFC')} ${lastName.normalize('NFC')}`);
  });

  it.each([5, 10])('accepts names at the %i-character boundary', length => {
    const firstName = 'a'.repeat(length);
    const lastName = 'b'.repeat(length);
    expect(signupSchema.safeParse({ body: { ...base, firstName, lastName } }).success).toBe(true);
    expect(signupSchema.safeParse({ body: { ...base, name: `${firstName} ${lastName}` } }).success).toBe(true);
  });

  it.each([4, 11, 50])('rejects %i-character names in separate fields and legacy input', length => {
    const name = 'a'.repeat(length);
    expect(signupSchema.safeParse({ body: { ...base, firstName: name, lastName: 'Mercado' } }).success).toBe(false);
    expect(signupSchema.safeParse({ body: { ...base, firstName: 'Kevin', lastName: name } }).success).toBe(false);
    expect(signupSchema.safeParse({ body: { ...base, name: `${name} Mercado` } }).success).toBe(false);
    expect(signupSchema.safeParse({ body: { ...base, name: `Kevin ${name}` } }).success).toBe(false);
  });

  it.each(['', 'John', 'Kevin1', '12345', 'Kévin!', 'Kevin Juan', 'Anne-Marie', "O'Neil", '\u0301\u0301\u0301\u0301\u0301', '𐐀'.repeat(11), 'q\u0301'.repeat(11)])('rejects invalid first and last names: %s', name => {
    expect(signupSchema.safeParse({ body: { ...base, firstName: name, lastName: 'Mercado' } }).success).toBe(false);
    expect(signupSchema.safeParse({ body: { ...base, firstName: 'Kevin', lastName: name } }).success).toBe(false);
  });

  it('rejects missing pairs and a conflicting legacy name', () => {
    expect(signupSchema.safeParse({ body: { ...base, firstName: 'Kevin' } }).success).toBe(false);
    expect(signupSchema.safeParse({ body: { ...base, lastName: 'Mercado' } }).success).toBe(false);
    expect(signupSchema.safeParse({ body: { ...base, firstName: 'Kevin', lastName: 'Mercado', name: 'Different Person' } }).success).toBe(false);
    expect(signupSchema.safeParse({ body: { ...base, firstName: 'a'.repeat(50), lastName: 'b'.repeat(50) } }).success).toBe(false);
  });

  it('preserves valid legacy two-part names without permitting a validation bypass', () => {
    expect(signupSchema.parse({ body: { ...base, name: '  Kevin Mercado  ' } }).body.name).toBe('Kevin Mercado');
    for (const name of ['Kevin1 Mercado', 'John Smith', 'Kevin Doe', 'Kevin  Mercado', 'Kevin Mercado123', 'Kevin']) {
      expect(signupSchema.safeParse({ body: { ...base, name } }).success).toBe(false);
    }
  });

  it('returns field errors before the HTTP handler or any persistence', async () => {
    const handler = vi.fn((_req, res) => res.json({ status: 'success' }));
    const app = express();
    app.use(express.json());
    app.post('/signup', validateSchema(signupSchema), handler);
    const response = await request(app).post('/signup').send({ ...base, firstName: 'Kevin1', lastName: 'Doe' });
    expect(response.status).toBe(400);
    expect(response.body.errors).toHaveLength(2);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'body.firstName' }), expect.objectContaining({ path: 'body.lastName' }),
    ]));
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects overlong names before the HTTP handler or any persistence', async () => {
    const handler = vi.fn((_req, res) => res.json({ status: 'success' }));
    const app = express();
    app.use(express.json());
    app.post('/signup', validateSchema(signupSchema), handler);
    const response = await request(app).post('/signup').send({ ...base, firstName: 'a'.repeat(11), lastName: 'b'.repeat(11) });
    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'body.firstName' }), expect.objectContaining({ path: 'body.lastName' }),
    ]));
    expect(handler).not.toHaveBeenCalled();
  });
});
