import { z } from 'zod';

const scalar = z.string().optional();
const boundedInteger = (value: string | undefined, fallback: number, maximum: number): number => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
};

export const adminUserQuerySchema = z.object({
  page: scalar.transform(value => boundedInteger(value, 1, 10_000)),
  limit: scalar.transform(value => boundedInteger(value, 25, 100)),
  search: z.string().trim().max(100).default(''),
  role: z.enum(['ALL', 'admin', 'contributor']).default('ALL'),
  status: z.enum(['ALL', 'ACTIVE', 'BANNED']).default('ALL'),
});

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;
