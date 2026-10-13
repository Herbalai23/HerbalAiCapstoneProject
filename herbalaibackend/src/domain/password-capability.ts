import type { AccountPasswordCapability } from '../contracts/workflow-contracts.js';

export const passwordCapability = (user: { localPasswordSet?: boolean | null }): AccountPasswordCapability => ({
  hasLocalPassword: user.localPasswordSet ?? null,
  passwordStatus: user.localPasswordSet === true ? 'set' as const
    : user.localPasswordSet === false ? 'unset' as const : 'unknown' as const,
});
