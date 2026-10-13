import type { ReviewReference } from '@/features/suggestions/SuggestionReviewEditor';
import type { SuggestionStatus } from '@/features/suggestions/SuggestionStatusBadge';
import type { BanUser } from './user-ban';

export interface Suggestion {
  revision: number;
  references?: ReviewReference[];
  id: number;
  submitterId: string;
  localName: string;
  cebuanoName?: string;
  scientificName: string;
  category: string;
  medicinalUses: string;
  preparationMethod: string;
  dosage: string;
  regionFound?: string;
  warnings?: string;
  informationSource?: string;
  imageUrl?: string;
  status: SuggestionStatus;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewNotes?: string;
  evidenceClass?: 'DOH_PITAHC_LISTED' | 'EVIDENCE_SUPPORTED_PHILIPPINE_USE' | 'DOCUMENTED_TRADITIONAL_USE' | 'UNASSESSED';
}

export interface Herb {
  id: string;
  localName: string;
  cebuanoName?: string;
  scientificName: string;
  category: string;
  medicinalUses: string;
  preparationMethod?: string;
  dosage?: string;
  regionFound?: string;
  warnings?: string;
  imageUrl?: string;
  isDohApproved?: boolean;
}

export interface SystemUser extends BanUser {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  avatar: string | null;
  joined: string;
  isBanned: boolean;
}

export interface KBItem {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  tags: string[];
  metadata: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KBImportFact {
  question: string;
  answer: string;
  category?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface AuditLog {
  id: number;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: any; /* eslint-disable-line @typescript-eslint/no-explicit-any */
  createdAt: string;
  admin: {
    id: string;
    name: string;
    username: string;
    email?: string;
    avatar: string | null;
    role: string;
  };
}

export interface DashboardStats {
  totalHerbs: number;
  totalUsers: number;
  totalKnowledgeFacts: number;
  recentSuggestions: Pick<Suggestion, 'id' | 'localName' | 'scientificName' | 'status'>[];
  herbsByCategory: { name: string; value: number }[];
  suggestionsByStatus: { name: string; value: number }[];
  threadsByCategory: { name: string; value: number }[];
}

export type SuggestionFilter = 'All' | SuggestionStatus;
