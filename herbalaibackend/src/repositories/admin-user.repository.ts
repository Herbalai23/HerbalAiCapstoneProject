import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { eligibleAccountFilter, isAccountBanned } from '../lib/user-ban.js';
import type { AdminUserQuery } from '../lib/admin-user-query.js';

export const findAdminUserPage = async (query: AdminUserQuery) => {
  const now = new Date();
  const conditions: Prisma.UserWhereInput[] = [];
  if (query.role !== 'ALL') conditions.push({ role: query.role });
  if (query.status === 'ACTIVE') conditions.push(eligibleAccountFilter(now));
  if (query.status === 'BANNED') conditions.push({ isBanned: true, OR: [{ banExpiresAt: null }, { banExpiresAt: { gt: now } }] });
  if (query.search) {
    const contains = query.search.replace(/[\\%_]/g, character => `\\${character}`);
    conditions.push({ OR: ['name', 'username', 'email'].map(field => ({ [field]: { contains, mode: 'insensitive' } })) });
  }
  const where: Prisma.UserWhereInput = conditions.length ? { AND: conditions } : {};
  return prisma.$transaction(async transaction => {
    const total = await transaction.user.count({ where });
    const allTotal = conditions.length ? await transaction.user.count() : total;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.limit)));
    const users = await transaction.user.findMany({
      where,
      select: { id: true, username: true, email: true, name: true, avatar: true, role: true, joined: true,
        isBanned: true, banReason: true, banExpiresAt: true, emailVerified: true },
      orderBy: [{ joined: 'desc' }, { id: 'desc' }],
      take: query.limit,
      skip: (page - 1) * query.limit,
    });
    return { users: users.map(account => ({ ...account, isBanned: isAccountBanned(account, now) })), total, allTotal, page, limit: query.limit };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
};
