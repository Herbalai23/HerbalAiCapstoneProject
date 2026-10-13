'use client';

import CreditsWallet from '@/features/credits/CreditsWallet';
import { useAuth } from '@/lib/context/AuthContext';

export default function DrAiCreditsStatus({ revision }: { revision: number }) {
  const { user } = useAuth();
  return <CreditsWallet key={user?.id ?? 'signed-out'} embedded revision={revision} />;
}
