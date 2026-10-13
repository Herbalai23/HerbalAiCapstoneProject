import type { SuggestionStatus } from './SuggestionStatusBadge';

export interface Submission {
  id: number;
  localName: string;
  scientificName: string;
  cebuanoName?: string | null;
  category: string;
  medicinalUses: string;
  preparationMethod: string;
  dosage: string;
  regionFound?: string | null;
  warnings?: string | null;
  informationSource?: string | null;
  imageUrl?: string | null;
  status: SuggestionStatus;
  reviewNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  historyEligibleAt?: string | null;
}
