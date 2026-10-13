'use client';

import SuggestionStatusBadge from '@/features/suggestions/SuggestionStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import type React from 'react';
import type { Suggestion, SuggestionFilter } from '../types';

interface SuggestionsSectionProps {
  suggestionsLoading: boolean;
  suggestionFilters: { value: SuggestionFilter; label: string; }[];
  suggestionFilter: SuggestionFilter;
  setSuggestionFilter: React.Dispatch<React.SetStateAction<SuggestionFilter>>;
  setSuggestionsPage: React.Dispatch<React.SetStateAction<number>>;
  suggestions: Suggestion[];
  suggestionsLoaded: boolean;
  error: string | null;
  visibleSuggestions: Suggestion[];
  actioningId: number | null;
  setReviewEditing: React.Dispatch<React.SetStateAction<Suggestion | null>>;
  evidenceClassById: Record<number, string>;
  setEvidenceClassById: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  reviewNotesById: Record<number, string>;
  setReviewNotesById: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  handleApprove: (id: number) => Promise<void>;
  handleRequestChanges: (id: number) => Promise<void>;
  handleReject: (id: number) => Promise<void>;
  filteredSuggestions: Suggestion[];
  currentSuggestionsPage: number;
  suggestionPageCount: number;
}

export default function SuggestionsSection({
  suggestionsLoading,
  suggestionFilters,
  suggestionFilter,
  setSuggestionFilter,
  setSuggestionsPage,
  suggestions,
  suggestionsLoaded,
  error,
  visibleSuggestions,
  actioningId,
  setReviewEditing,
  evidenceClassById,
  setEvidenceClassById,
  reviewNotesById,
  setReviewNotesById,
  handleApprove,
  handleRequestChanges,
  handleReject,
  filteredSuggestions,
  currentSuggestionsPage,
  suggestionPageCount,
}: SuggestionsSectionProps) {
  return (
<div aria-busy={suggestionsLoading}>
              <h1 className="mb-2 text-2xl font-semibold text-ink">Herb Suggestions</h1>
              <p className="mb-6 text-sm text-muted">Review pending submissions and revisit previous decisions.</p>
              <div role="group" aria-label="Filter suggestions by status" className="mb-6 flex flex-wrap gap-2">
                {suggestionFilters.map(({ value, label }) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={suggestionFilter === value ? 'default' : 'outline'}
                    aria-pressed={suggestionFilter === value}
                    onClick={() => { setSuggestionFilter(value); setSuggestionsPage(1); }}
                    className="min-h-10 gap-2 px-3"
                  >
                    {label}
                    <span className="tabular-nums opacity-75">{value === 'All' ? suggestions.length : suggestions.filter((suggestion) => suggestion.status === value).length}</span>
                  </Button>
                ))}
              </div>
              {!suggestionsLoaded ? (
                <div role="status" aria-label="Loading suggestions" className="grid gap-3">
                  {[1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />)}
                </div>
              ) : error && suggestions.length === 0 ? null : visibleSuggestions.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center">
                    <h2 className="text-lg font-semibold text-ink">No suggestions to show</h2>
                    <p className="mt-2 text-sm text-muted">{suggestionFilter === 'Pending' ? 'New submissions will appear here for review.' : 'There are no submissions with this status yet.'}</p>
                  </CardContent>
                </Card>
              ) : suggestionFilter === 'Pending' ? (
                <div className="grid gap-6 md:grid-cols-2">
                  {visibleSuggestions.map((suggestion) => (
                    <Card
                      key={suggestion.id}
                      className="flex flex-col p-5 rounded-3xl"
                    >
                      {/* Submitter Info & Actions */}
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
                        <div className="min-w-0">
                          <span className="mb-2 inline-block rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-ink">
                            {suggestion.category}
                          </span>
                          <CardTitle className="text-xl text-ink">
                            {suggestion.localName}
                          </CardTitle>
                          <p className="mt-0.5 text-sm italic text-muted">
                            {suggestion.scientificName} {suggestion.cebuanoName ? `(${suggestion.cebuanoName})` : ''}
                          </p>
                        </div>
                        <SuggestionStatusBadge status={suggestion.status} />
                        {suggestion.imageUrl && (
                          <img
                            src={suggestion.imageUrl}
                            alt={suggestion.localName}
                            className="h-16 w-16 rounded-lg border border-border object-cover"
                          />
                        )}
                      </div>

                      {/* Content details */}
                      <div className="mb-4 space-y-2 text-sm text-ink">
                        <p><strong>Contributor source: </strong>{suggestion.informationSource || 'Not provided'}</p>
                        <h3 className="font-bold">Reviewed references ({suggestion.references?.length || 0})</h3>
                        {suggestion.references?.map((source, index) => <div key={index} className="rounded-lg border border-border p-3">
                          {source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">{source.title}</a> : <span>{source.title}</span>}
                          <p>{source.publisher} {source.publishedAt}</p><p>{source.citation}</p>
                          <p>Supports: {source.supports.map((claim) => ({ identity: 'Identity', medicinalUses: 'Uses', preparationMethod: 'Preparation', dosage: 'Dosage', warnings: 'Safety', isDohApproved: 'Official listing' })[claim] || claim).join(', ')}</p>
                        </div>)}
                        {suggestion.reviewNotes && <p className="whitespace-pre-wrap">Reviewer notes: {suggestion.reviewNotes}</p>}
                        <Button type="button" size="sm" variant="outline" disabled={actioningId !== null} onClick={() => setReviewEditing(suggestion)}>Edit & references</Button>
                      </div>
                      <div className="flex-1 space-y-4 text-sm text-ink">
                        <div>
                          <h4 className="text-xs font-semibold text-muted">Medicinal Uses</h4>
                          <p className="mt-1 text-sm">{suggestion.medicinalUses}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-muted">Preparation</h4>
                          <p className="mt-1 text-sm">{suggestion.preparationMethod}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-muted">Dosage</h4>
                          <p className="mt-1 text-sm">{suggestion.dosage}</p>
                        </div>
                        {suggestion.warnings && (
                          <div className="rounded-lg border border-warning-ink/25 bg-warning-surface p-3 text-sm text-warning-ink">
                            <span className="mb-1 flex items-center gap-1.5 font-semibold"><AlertCircle className="size-4" aria-hidden="true" /> Safety warning</span>
                            {suggestion.warnings}
                          </div>
                        )}
                        <div className="grid gap-3 border-t border-border pt-4">
                          <label className="grid gap-1 text-sm font-medium text-ink">
                            Evidence classification
                            <select name={`evidence-class-${suggestion.id}`}
                              value={evidenceClassById[suggestion.id] || ''}
                              onChange={(event) => setEvidenceClassById((current) => ({ ...current, [suggestion.id]: event.target.value }))}
                              className="min-h-11 rounded-lg border border-input bg-card px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <option value="">Select before approval</option>
                              <option value="DOH_PITAHC_LISTED">DOH/PITAHC listed</option>
                              <option value="EVIDENCE_SUPPORTED_PHILIPPINE_USE">Evidence-supported Philippine use</option>
                              <option value="DOCUMENTED_TRADITIONAL_USE">Documented traditional use</option>
                            </select>
                          </label>
                          <label className="grid gap-1 text-sm font-medium text-ink">
                            Reviewer notes
                            <textarea name={`review-notes-${suggestion.id}`}
                              value={reviewNotesById[suggestion.id] || ''}
                              onChange={(event) => setReviewNotesById((current) => ({ ...current, [suggestion.id]: event.target.value }))}
                              rows={3}
                              maxLength={2000}
                              placeholder="Record the decision; Request Changes needs at least 10 characters."
                              className="resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="mt-6 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-3">
                        <Button
                          type="button"
                          onClick={() => handleApprove(suggestion.id)}
                          disabled={actioningId !== null}
                          className="w-full min-h-[38px] text-xs flex items-center justify-center gap-1.5"
                        >
                          {actioningId === suggestion.id ? (
                            <>
                              <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent inline-block shrink-0"></span>
                              <span>Publishing…</span>
                            </>
                          ) : (
                            'Approve & Publish'
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleRequestChanges(suggestion.id)}
                          disabled={actioningId !== null}
                          className="w-full min-h-[38px] border-warning-ink text-xs text-warning-ink hover:bg-warning-surface flex items-center justify-center gap-1.5"
                        >
                          Request Changes
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleReject(suggestion.id)}
                          disabled={actioningId !== null}
                          className="w-full min-h-[38px] border-error-ink text-xs text-error-ink hover:bg-error-surface flex items-center justify-center gap-1.5"
                        >
                          Reject
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3">
                  {visibleSuggestions.map((suggestion) => (
                    <Card key={suggestion.id}>
                      <CardContent className="pt-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-base text-ink">{suggestion.localName}</CardTitle>
                            <p className="text-sm italic text-muted">{suggestion.scientificName}</p>
                          </div>
                          <SuggestionStatusBadge status={suggestion.status} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                          <span>{suggestion.category}</span>
                          <span>Submitted {new Date(suggestion.submittedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                          {suggestion.reviewedAt && <span>Reviewed {new Date(suggestion.reviewedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</span>}
                        </div>
                        {suggestion.reviewNotes && (
                          <p className="mt-4 whitespace-pre-wrap rounded-lg bg-secondary p-3 text-sm text-ink"><strong className="mr-1">Reviewer notes:</strong>{suggestion.reviewNotes}</p>
                        )}
                        <details className="mt-4 border-t border-border pt-3 text-sm text-ink">
                          <summary className="cursor-pointer font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View submission details</summary>
                          <div className="mt-3 grid gap-2 text-muted">
                            <p><strong className="text-ink">Medicinal uses:</strong> {suggestion.medicinalUses}</p>
                            <p><strong className="text-ink">Preparation:</strong> {suggestion.preparationMethod}</p>
                            <p><strong className="text-ink">Dosage:</strong> {suggestion.dosage}</p>
                            {suggestion.informationSource && <p><strong className="text-ink">Source:</strong> {suggestion.informationSource}</p>}
                          </div>
                        </details>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              {suggestionsLoaded && filteredSuggestions.length > 10 && (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
                  <span>Page {currentSuggestionsPage} of {suggestionPageCount} · {filteredSuggestions.length} suggestions</span>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={currentSuggestionsPage === 1} onClick={() => setSuggestionsPage(currentSuggestionsPage - 1)}>Previous</Button>
                    <Button type="button" size="sm" variant="outline" disabled={currentSuggestionsPage === suggestionPageCount} onClick={() => setSuggestionsPage(currentSuggestionsPage + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </div>
  );
}
