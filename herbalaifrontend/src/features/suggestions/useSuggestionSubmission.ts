'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import api from '@/lib/axios';
import { loadRevisionSubmission, submissionEditId, submissionSignInPath } from './suggestion-review';
import { requestError } from '@/lib/request-feedback';
import type { Submission } from './types';

export function useSuggestionSubmission() {
  const { user, isAuthenticated, loading: authLoading, sessionUnavailable, checkSession } = useAuth();

  const router = useRouter();

  const linkedSearch = useSearchParams().toString();

  const [localName, setLocalName] = useState('');

  const [scientificName, setScientificName] = useState('');

  const [cebuanoName, setCebuanoName] = useState('');

  const [category, setCategory] = useState('');

  const [medicinalUses, setMedicinalUses] = useState('');

  const [preparationMethod, setPreparationMethod] = useState('');

  const [dosage, setDosage] = useState('');

  const [regionFound, setRegionFound] = useState('');

  const [warnings, setWarnings] = useState('');

  const [informationSource, setInformationSource] = useState('');

  const [imageFile, setImageFile] = useState<File | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState(false);

  const [submittedHerb, setSubmittedHerb] = useState<Submission | null>(null);

  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const [submissionsError, setSubmissionsError] = useState<string | null>(null);

  const [submissionsRefresh, setSubmissionsRefresh] = useState(0);

  const [editingSubmission, setEditingSubmission] = useState<Submission | null>(null);

  const [linkedSubmissionLoading, setLinkedSubmissionLoading] = useState(false);

  const [submissionsTab, setSubmissionsTab] = useState<'all' | 'active' | 'history'>('all');

  const [submissionsPage, setSubmissionsPage] = useState(1);

  const [submissionsTotal, setSubmissionsTotal] = useState(0);

  const [submissionsCounts, setSubmissionsCounts] = useState({ all: 0, active: 0, history: 0 });

  const [submissionsLoading, setSubmissionsLoading] = useState(true);

  const SUBMISSIONS_PER_PAGE = 5;

  const totalSubmissionPages = Math.max(1, Math.ceil(submissionsTotal / SUBMISSIONS_PER_PAGE));

  const handleTabChange = (tab: 'all' | 'active' | 'history') => {
    if (tab === submissionsTab && submissionsPage === 1) return;
    setSubmissionsTab(tab);
    setSubmissionsPage(1);
    setSubmissionsLoading(true);
  };

  const categories = [
    'Respiratory',
    'Kidney Health',
    'Blood Sugar',
    'Wound Care',
    'Immune System',
    'Digestive',
    'General Wellness',
    'Other'
  ];

  useEffect(() => {
    if (!authLoading && !isAuthenticated && !sessionUnavailable) {
      router.push(submissionSignInPath(linkedSearch));
    }
  }, [authLoading, isAuthenticated, sessionUnavailable, router, linkedSearch]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    let latestRequest = 0;

    const loadSubmissions = async () => {
      const requestId = ++latestRequest;
      setSubmissionsLoading(true);
      try {
        setSubmissionsError(null);
        const res = await api.get('/suggest', { params: {
          view: submissionsTab, scope: 'mine', page: submissionsPage, limit: SUBMISSIONS_PER_PAGE,
        } });
        if (!cancelled && requestId === latestRequest && res.data?.status === 'success') {
          const data = res.data.data;
          const lastPage = Math.max(1, Math.ceil(data.total / SUBMISSIONS_PER_PAGE));
          if (submissionsPage > lastPage) {
            setSubmissionsPage(lastPage);
            return;
          }
          setSubmissions(data.suggestions || []);
          setSubmissionsTotal(data.total);
          setSubmissionsCounts(data.counts);
        } else if (!cancelled && requestId === latestRequest) {
          throw new Error('Failed to load your previous suggestions.');
        }
      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!cancelled && requestId === latestRequest) {
          setSubmissionsError(err.response?.data?.message || 'Failed to load your previous suggestions.');
        }
      } finally {
        if (!cancelled && requestId === latestRequest) setSubmissionsLoading(false);
      }
    };

    const handleFocus = () => { void loadSubmissions(); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadSubmissions();
    };

    void loadSubmissions();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const historyTimer = window.setInterval(() => { void loadSubmissions(); }, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(historyTimer);
    };
  }, [isAuthenticated, user?.id, submissionsRefresh, submissionsTab, submissionsPage]);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];

    // Type Validation
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file format. Only JPG, JPEG, PNG, and WEBP images are allowed.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setImageFile(null);
      setImagePreview(null);
      return;
    }

    // Size Validation (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size too large. Images must be under 5MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setImageFile(null);
      setImagePreview(null);
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (linkedSubmissionLoading || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    // Basic Validation
    if (!localName.trim()) return triggerValidationError('Local / Filipino Name is required.');
    if (!scientificName.trim()) return triggerValidationError('Scientific Name is required.');
    if (!category) return triggerValidationError('Please select a category.');
    if (!medicinalUses.trim()) return triggerValidationError('Medicinal Uses are required.');
    if (!informationSource.trim()) return triggerValidationError('A source for this information is required.');
    if (!preparationMethod.trim()) return triggerValidationError('Preparation Method is required.');
    if (!dosage.trim()) return triggerValidationError('Dosage instructions are required.');

    try {
      const formData = new FormData();
      formData.append('localName', localName.trim());
      formData.append('scientificName', scientificName.trim());
      if (cebuanoName.trim()) formData.append('cebuanoName', cebuanoName.trim());
      formData.append('category', category);
      formData.append('medicinalUses', medicinalUses.trim());
      formData.append('preparationMethod', preparationMethod.trim());
      formData.append('dosage', dosage.trim());
      if (regionFound.trim()) formData.append('regionFound', regionFound.trim());
      if (warnings.trim()) formData.append('warnings', warnings.trim());
      formData.append('informationSource', informationSource.trim());

      if (imageFile) {
        formData.append('image', imageFile);
      }

      const response = await api.post(editingSubmission ? `/suggest/${editingSubmission.id}/resubmit` : '/suggest', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data?.status === 'success') {
        setSubmittedHerb(response.data.data.suggestion);
        setSubmissionsTab('active');
        setSubmissionsPage(1);
        setSubmissionsRefresh(current => current + 1);
        setEditingSubmission(null);
        setSuccess(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        throw new Error(response.data?.message || 'Failed to submit suggestion.');
      }
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error('Error submitting herb:', err);
      setError(
        err.response?.data?.message ||
        err.message ||
        'An unexpected error occurred while submitting your suggestion. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const triggerValidationError = (msg: string) => {
    setError(msg);
    setIsSubmitting(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReset = useCallback(() => {
    setEditingSubmission(null);
    setLocalName('');
    setScientificName('');
    setCebuanoName('');
    setCategory('');
    setMedicinalUses('');
    setPreparationMethod('');
    setDosage('');
    setRegionFound('');
    setWarnings('');
    setInformationSource('');
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setError(null);
    setSuccess(false);
    setSubmittedHerb(null);
  }, []);

  const editSubmission = useCallback((submission: Submission) => {
    handleReset();
    setEditingSubmission(submission);
    setLocalName(submission.localName);
    setScientificName(submission.scientificName);
    setCebuanoName(submission.cebuanoName || '');
    setCategory(submission.category);
    setMedicinalUses(submission.medicinalUses);
    setPreparationMethod(submission.preparationMethod);
    setDosage(submission.dosage);
    setRegionFound(submission.regionFound || '');
    setWarnings(submission.warnings || '');
    setInformationSource(submission.informationSource || '');
  }, [handleReset]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const openLinkedSubmission = async () => {
      handleReset();
      setLinkedSubmissionLoading(false);
      const search = linkedSearch;
      if (!new URLSearchParams(search).has('edit')) return;
      const id = submissionEditId(search);
      if (id === null) {
        setError('Invalid submission link. Choose Edit and resubmit from My Submissions.');
        return;
      }
      setLinkedSubmissionLoading(true);
      try {
        const submission = await loadRevisionSubmission<Submission>(id, () => api.get(`/suggest/${id}`));
        if (!cancelled) editSubmission(submission);
      } catch (caught) {
        if (!cancelled) setError(requestError(caught, caught instanceof Error ? caught.message : 'This submission could not be opened.'));
      } finally {
        if (!cancelled) setLinkedSubmissionLoading(false);
      }
    };
    void openLinkedSubmission();
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.id, editSubmission, handleReset, linkedSearch]);

  const currentSubmission = submittedHerb
    ? submissions.find((submission) => submission.id === submittedHerb.id) ?? submittedHerb
    : null;

  const currentStatus = currentSubmission?.status ?? 'Pending';

  return {
    authLoading,
    sessionUnavailable,
    isAuthenticated,
    checkSession,
    linkedSubmissionLoading,
    editingSubmission,
    user,
    setSubmissionsRefresh,
    submissionsCounts,
    handleTabChange,
    submissionsTab,
    submissionsLoading,
    submissionsError,
    submissionsTotal,
    submissions,
    isSubmitting,
    editSubmission,
    totalSubmissionPages,
    submissionsPage,
    setSubmissionsPage,
    handleReset,
    error,
    success,
    currentStatus,
    currentSubmission,
    localName,
    submittedHerb,
    scientificName,
    category,
    cebuanoName,
    imagePreview,
    router,
    handleSubmit,
    setLocalName,
    setScientificName,
    setCebuanoName,
    setCategory,
    categories,
    medicinalUses,
    setMedicinalUses,
    preparationMethod,
    setPreparationMethod,
    dosage,
    setDosage,
    regionFound,
    setRegionFound,
    informationSource,
    setInformationSource,
    warnings,
    setWarnings,
    imageFile,
    handleRemoveImage,
    fileInputRef,
    handleFileChange,
  };
}
