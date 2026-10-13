import api from '@/lib/axios';
import { getKnowledgePrimarySource } from '@/features/admin/knowledge-source';
import type { KBItem, KBImportFact } from '../types';
import type React from 'react';
import { getErrorMessage } from '../admin-feedback';

interface KnowledgeBaseActionsContext {
  kbQuestion: string;
  kbAnswer: string;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  kbSourceTitle: string;
  kbSourcePublisher: string;
  kbSourceUrl: string;
  setSuccessMsg: React.Dispatch<React.SetStateAction<string | null>>;
  editingKbItem: KBItem | null;
  kbCategory: string;
  kbTags: string;
  refreshKbPage: () => Promise<void>;
  setIsImportingKb: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingKbItem: React.Dispatch<React.SetStateAction<KBItem | null>>;
  setKbQuestion: React.Dispatch<React.SetStateAction<string>>;
  setKbAnswer: React.Dispatch<React.SetStateAction<string>>;
  setKbCategory: React.Dispatch<React.SetStateAction<string>>;
  setKbTags: React.Dispatch<React.SetStateAction<string>>;
  setKbSourceTitle: React.Dispatch<React.SetStateAction<string>>;
  setKbSourcePublisher: React.Dispatch<React.SetStateAction<string>>;
  setKbSourceUrl: React.Dispatch<React.SetStateAction<string>>;
  setIsKbModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setExpandedKbIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setCopiedKbId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function createKnowledgeBaseActions({
  kbQuestion,
  kbAnswer,
  setError,
  kbSourceTitle,
  kbSourcePublisher,
  kbSourceUrl,
  setSuccessMsg,
  editingKbItem,
  kbCategory,
  kbTags,
  refreshKbPage,
  setIsImportingKb,
  setEditingKbItem,
  setKbQuestion,
  setKbAnswer,
  setKbCategory,
  setKbTags,
  setKbSourceTitle,
  setKbSourcePublisher,
  setKbSourceUrl,
  setIsKbModalOpen,
  setExpandedKbIds,
  setCopiedKbId,
}: KnowledgeBaseActionsContext) {
  const handleSaveKbItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kbQuestion.trim().length < 5 || kbAnswer.trim().length < 10) {
      setError('Use at least 5 characters for the question and 10 for the answer.');
      return;
    }
    if (!kbSourceTitle.trim() || !kbSourcePublisher.trim() || !URL.canParse(kbSourceUrl.trim())
      || !['http:', 'https:'].includes(new URL(kbSourceUrl.trim()).protocol)) {
      setError('Add a source title, publisher, and valid HTTP(S) URL.');
      return;
    }

    try {
      setError(null);
      setSuccessMsg(null);

      const previousSources = editingKbItem?.metadata?.['sources'];
      const previousSource = Array.isArray(previousSources) && previousSources[0]
        && typeof previousSources[0] === 'object' ? previousSources[0] as Record<string, unknown> : {};
      const payload = {
        question: kbQuestion.trim(),
        answer: kbAnswer.trim(),
        category: kbCategory.trim() || undefined,
        tags: kbTags.split(',').map(t => t.trim()).filter(Boolean),
        metadata: {
          ...(editingKbItem?.metadata ?? {}),
          jurisdiction: 'Philippines',
          sources: [{ ...previousSource, title: kbSourceTitle.trim(), publisher: kbSourcePublisher.trim(), url: kbSourceUrl.trim() },
            ...(Array.isArray(previousSources) ? previousSources.slice(1) : [])],
        },
      };

      if (editingKbItem) {
        const res = await api.patch(`/knowledge-base/${editingKbItem.id}`, payload);
        if (res.data?.status === 'success') {
          setSuccessMsg('Knowledge base entry updated successfully!');
          // Refresh list
          await refreshKbPage();
          closeKbModal();
        }
      } else {
        const res = await api.post('/knowledge-base/create', payload);
        if (res.data?.status === 'success') {
          setSuccessMsg('Knowledge base entry created successfully!');
          // Refresh list
          await refreshKbPage();
          closeKbModal();
        }
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to save knowledge base entry.'));
    }
  };

  const handleKbFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setError(null);
      setSuccessMsg(null);
      setIsImportingKb(true);
      if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Choose a JSON file.');
      if (file.size > 1_000_000) throw new Error('The JSON file must be smaller than 1 MB.');

      const parsed: unknown = JSON.parse(await file.text());
      const records = Array.isArray(parsed) ? parsed : [parsed];
      if (records.length === 0) throw new Error('The JSON file does not contain any facts.');
      if (records.length > 50) throw new Error('Import up to 50 facts at a time.');

      const facts: KBImportFact[] = records.map((record, index) => {
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
          throw new Error(`Fact ${index + 1} must be a JSON object.`);
        }
        const fact = record as Record<string, unknown>;
        if (typeof fact.question !== 'string' || fact.question.trim().length < 5) {
          throw new Error(`Fact ${index + 1} needs a question of at least 5 characters.`);
        }
        if (typeof fact.answer !== 'string' || fact.answer.trim().length < 10) {
          throw new Error(`Fact ${index + 1} needs an answer of at least 10 characters.`);
        }
        if (fact.tags !== undefined && (!Array.isArray(fact.tags) || !fact.tags.every((tag) => typeof tag === 'string'))) {
          throw new Error(`Fact ${index + 1} has invalid tags.`);
        }
        if (fact.metadata !== undefined && (!fact.metadata || typeof fact.metadata !== 'object' || Array.isArray(fact.metadata))) {
          throw new Error(`Fact ${index + 1} has invalid metadata.`);
        }
        const metadata = fact.metadata as Record<string, unknown> | undefined;
        const sources = metadata?.sources;
        if (typeof metadata?.jurisdiction !== 'string' || metadata.jurisdiction.trim().toLowerCase() !== 'philippines') {
          throw new Error(`Fact ${index + 1} must declare metadata.jurisdiction as "Philippines".`);
        }
        if (!Array.isArray(sources) || sources.length === 0) {
          throw new Error(`Fact ${index + 1} must include at least one Philippine-relevant source in metadata.sources.`);
        }
        return {
          question: fact.question.trim(),
          answer: fact.answer.trim(),
          ...(typeof fact.category === 'string' && fact.category.trim() ? { category: fact.category.trim() } : {}),
          ...(Array.isArray(fact.tags) ? { tags: fact.tags as string[] } : {}),
          ...(fact.metadata ? { metadata: fact.metadata as Record<string, unknown> } : {}),
        };
      });

      const res = await api.post('/knowledge-base/import', { facts }, { timeout: 120_000 });
      if (res.data?.status === 'success') {
        await refreshKbPage();
        const summary = res.data.data;
        setSuccessMsg(`Imported ${summary.total} fact${summary.total === 1 ? '' : 's'}: ${summary.created} new, ${summary.updated} updated.`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to import the knowledge base file.';
      const apiMessage = typeof err === 'object' && err !== null && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(apiMessage || message);
    } finally {
      setIsImportingKb(false);
    }
  };

  const handleDeleteKbItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this knowledge base entry?')) return;
    try {
      setError(null);
      setSuccessMsg(null);
      const res = await api.delete(`/knowledge-base/${id}`);
      if (res.data?.status === 'success') {
        setSuccessMsg('Knowledge base entry deleted successfully.');
        await refreshKbPage();
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to delete knowledge base entry.'));
    }
  };

  const handleToggleKbActive = async (id: string, currentIsActive: boolean) => {
    try {
      setError(null);
      setSuccessMsg(null);
      const res = await api.patch(`/knowledge-base/${id}`, { isActive: !currentIsActive });
      if (res.data?.status === 'success') {
        setSuccessMsg(`Entry has been ${!currentIsActive ? 'activated' : 'deactivated'}.`);
        await refreshKbPage();
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to update entry status.'));
    }
  };

  const openKbModal = (item: KBItem | null = null) => {
    if (item) {
      setEditingKbItem(item);
      setKbQuestion(item.question);
      setKbAnswer(item.answer);
      setKbCategory(item.category || '');
      setKbTags(item.tags.join(', '));
      const sources = item.metadata?.['sources'];
      const source = Array.isArray(sources) && sources[0] && typeof sources[0] === 'object'
        ? sources[0] as Record<string, unknown> : null;
      setKbSourceTitle(typeof source?.['title'] === 'string' ? source['title'] : '');
      setKbSourcePublisher(typeof source?.['publisher'] === 'string' ? source['publisher'] : '');
      setKbSourceUrl(typeof source?.['url'] === 'string' ? source['url'] : '');
    } else {
      setEditingKbItem(null);
      setKbQuestion('');
      setKbAnswer('');
      setKbCategory('');
      setKbTags('');
      setKbSourceTitle('');
      setKbSourcePublisher('');
      setKbSourceUrl('');
    }
    setIsKbModalOpen(true);
  };

  const closeKbModal = () => {
    setIsKbModalOpen(false);
    setEditingKbItem(null);
    setKbQuestion('');
    setKbAnswer('');
    setKbCategory('');
    setKbTags('');
    setKbSourceTitle('');
    setKbSourcePublisher('');
    setKbSourceUrl('');
  };

  const toggleKbExpand = (id: string) => {
    setExpandedKbIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyKbFact = async (item: KBItem) => {
    try {
      await navigator.clipboard.writeText(`Q: ${item.question}\n\nA: ${item.answer}`);
      setCopiedKbId(item.id);
      setTimeout(() => setCopiedKbId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const getKbPrimarySource = (item: KBItem) => {
    return getKnowledgePrimarySource(item.metadata);
  };

  return { handleSaveKbItem, handleKbFileImport, handleDeleteKbItem, handleToggleKbActive, openKbModal, closeKbModal, toggleKbExpand, handleCopyKbFact, getKbPrimarySource };
}
