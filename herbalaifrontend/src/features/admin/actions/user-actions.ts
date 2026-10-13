import { invalidateApiGetCache } from '@/lib/request-cache';
import { type BanUser } from '@/features/admin/user-ban';
import type React from 'react';
import type { SystemUser } from '../types';

interface UserActionsContext {
  setUsersList: React.Dispatch<React.SetStateAction<SystemUser[]>>;
  setUsersRefresh: React.Dispatch<React.SetStateAction<number>>;
  setSuccessMsg: React.Dispatch<React.SetStateAction<string | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setBanTarget: React.Dispatch<React.SetStateAction<SystemUser | null>>;
  setCopiedEmailId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function createUserActions({
  setUsersList,
  setUsersRefresh,
  setSuccessMsg,
  setError,
  setBanTarget,
  setCopiedEmailId,
}: UserActionsContext) {
  const handleBanSaved = (updated: BanUser) => {
    invalidateApiGetCache('/auth/users');
    invalidateApiGetCache('/admin/audit-logs');
    setUsersList(previous => previous.map(account => account.id === updated.id ? { ...account, ...updated } : account));
    setUsersRefresh(previous => previous + 1);
    setSuccessMsg(updated.isBanned ? 'User banned. Existing sessions were revoked.' : 'User unbanned. They can sign in again.');
    setError(null);
    setBanTarget(null);
  };

  const handleCopyEmail = async (userId: string, email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmailId(userId);
      setTimeout(() => setCopiedEmailId(null), 2000);
    } catch {
      // Fallback
    }
  };

  return { handleBanSaved, handleCopyEmail };
}
