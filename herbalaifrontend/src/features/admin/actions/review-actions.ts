import { requestChangesFeedback } from '@/features/suggestions/suggestion-review';
import api from '@/lib/axios';
import { invalidateApiGetCache } from '@/lib/request-cache';
import type React from 'react';
import type { Suggestion, DashboardStats } from '../types';
import { getErrorMessage } from '../admin-feedback';

interface ReviewActionsContext {
  actioningId: number | null;
  setActioningId: React.Dispatch<React.SetStateAction<number | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccessMsg: React.Dispatch<React.SetStateAction<string | null>>;
  evidenceClassById: Record<number, string>;
  suggestions: Suggestion[];
  reviewNotesById: Record<number, string>;
  refreshSuggestions: () => Promise<void>;
  setDashboardStats: React.Dispatch<React.SetStateAction<DashboardStats | null>>;
}

export function createReviewActions({
  actioningId,
  setActioningId,
  setError,
  setSuccessMsg,
  evidenceClassById,
  suggestions,
  reviewNotesById,
  refreshSuggestions,
  setDashboardStats,
}: ReviewActionsContext) {
  const handleApprove = async (id: number) => {
    if (actioningId !== null) return;
    try {
      setActioningId(id);
      setError(null);
      setSuccessMsg(null);
      const evidenceClass = evidenceClassById[id];
      if (!evidenceClass || evidenceClass === 'UNASSESSED') {
        setError('Select an evidence classification before publishing.');
        return;
      }
      const res = await api.post(`/suggest/${id}/approve`, {
        revision: suggestions.find((suggestion) => suggestion.id === id)?.revision,
        evidenceClass,
        reviewNotes: reviewNotesById[id]?.trim() || undefined,
      });
      if (res.data?.status === 'success') {
        invalidateApiGetCache('/herbs');
        setSuccessMsg(`Herb suggestion approved and added to the library!`);
        await refreshSuggestions();
        setDashboardStats((prev) => prev ? {
          ...prev,
          totalHerbs: prev.totalHerbs + 1,
          suggestionsByStatus: prev.suggestionsByStatus.map((s) =>
            s.name === 'Pending' ? { ...s, value: Math.max(0, s.value - 1) } :
            s.name === 'Approved' ? { ...s, value: s.value + 1 } : s
          ),
        } : null);
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to approve suggestion.'));
    } finally {
      setActioningId(null);
    }
  };

  const handleRequestChanges = async (id: number) => {
    if (actioningId !== null) return;
    const reviewNotes = reviewNotesById[id]?.trim();
    if (!reviewNotes || reviewNotes.length < 10) {
      setError('Provide at least 10 characters explaining the required changes.');
      return;
    }
    let decisionSaved = false;
    try {
      setActioningId(id);
      setError(null);
      setSuccessMsg(null);
      const res = await api.post(`/suggest/${id}/request-changes`, {
        reviewNotes, revision: suggestions.find((suggestion) => suggestion.id === id)?.revision,
      });
      if (res.data?.status === 'success') {
        decisionSaved = true;
        setSuccessMsg(requestChangesFeedback(res.data.data?.notificationDelivery));
        await refreshSuggestions();
        setDashboardStats((prev) => prev ? {
          ...prev,
          suggestionsByStatus: prev.suggestionsByStatus.map((s) =>
            s.name === 'Pending' ? { ...s, value: Math.max(0, s.value - 1) } :
            s.name === 'ChangesRequested' ? { ...s, value: s.value + 1 } : s
          ),
        } : null);
      } else {
        throw new Error('The change-request result could not be confirmed.');
      }
    } catch (error: unknown) {
      setError(decisionSaved
        ? 'Changes were saved, but the review list could not refresh. Refresh before taking another action.'
        : getErrorMessage(error, 'Could not confirm the change request. Refresh the submission before retrying.'));
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (id: number) => {
    if (actioningId !== null) return;
    try {
      setActioningId(id);
      setError(null);
      setSuccessMsg(null);
      const res = await api.post(`/suggest/${id}/reject`, {
        revision: suggestions.find((suggestion) => suggestion.id === id)?.revision,
        reviewNotes: reviewNotesById[id]?.trim() || undefined,
      });
      if (res.data?.status === 'success') {
        setSuccessMsg(`Suggestion has been rejected.`);
        await refreshSuggestions();
        setDashboardStats((prev) => prev ? {
          ...prev,
          suggestionsByStatus: prev.suggestionsByStatus.map((s) =>
            s.name === 'Pending' ? { ...s, value: Math.max(0, s.value - 1) } :
            s.name === 'Rejected' ? { ...s, value: s.value + 1 } : s
          ),
        } : null);
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to reject suggestion.'));
    } finally {
      setActioningId(null);
    }
  };

  return { handleApprove, handleRequestChanges, handleReject };
}
