'use client';

import { Edit2, Trash2, Search } from 'lucide-react';
import type React from 'react';
import type { Herb } from '../types';
import type { useRouter } from 'next/navigation';

interface HerbsSectionProps {
  herbsTotal: number;
  librarySearch: string;
  setLibrarySearch: React.Dispatch<React.SetStateAction<string>>;
  setHerbsPage: React.Dispatch<React.SetStateAction<number>>;
  filteredHerbs: Herb[];
  openEditHerbModal: (herb: Herb) => void;
  router: ReturnType<typeof useRouter>;
  handleDeleteHerb: (id: string) => Promise<void>;
  herbsPage: number;
}

export default function HerbsSection({
  herbsTotal,
  librarySearch,
  setLibrarySearch,
  setHerbsPage,
  filteredHerbs,
  openEditHerbModal,
  router,
  handleDeleteHerb,
  herbsPage,
}: HerbsSectionProps) {
  return (
<div className="rounded-2xl border border-line bg-panel p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h2 className="font-black italic text-xl text-ink">
                  Published Herbs ({herbsTotal})
                </h2>

                {/* Search Bar */}
                <div className="relative max-w-xs w-full">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                  <input name="librarySearch"
                    type="text"
                    placeholder="Search herbs..."
                    aria-label="Search herbs"
                    value={librarySearch}
                    onChange={(e) => { setLibrarySearch(e.target.value); setHerbsPage(1); }}
                    className="w-full rounded-lg border border-input bg-panel py-2 pl-9 pr-4 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              {filteredHerbs.length === 0 ? (
                <p className="text-sm font-semibold text-muted text-center py-8">No matching records found.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Image</th>
                        <th>Local Name</th>
                        <th>Scientific Name</th>
                        <th>Category</th>
                        <th>Medicinal Uses</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHerbs.map((herb) => (
                        <tr key={herb.id}>
                          <td>
                            <div className="h-10 w-10 rounded-lg overflow-hidden border border-line bg-soft">
                              {herb.imageUrl ? (
                                <img src={herb.imageUrl} alt={herb.localName} className="h-full w-full object-cover" />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-lg">🌿</span>
                              )}
                            </div>
                          </td>
                          <td className="font-extrabold text-ink">{herb.localName}</td>
                          <td className="italic text-accent font-bold">{herb.scientificName}</td>
                          <td>
                            <span className="admin-role-pill">{herb.category}</span>
                          </td>
                          <td className="max-w-xs truncate text-muted font-semibold">{herb.medicinalUses}</td>
                          <td>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => openEditHerbModal(herb)}
                                className="text-xs text-amber-600 hover:underline font-black flex items-center gap-0.5"
                              >
                                <Edit2 className="h-3.5 w-3.5 inline" /> Edit
                              </button>
                              <button
                                onClick={() => router.push(`/library`)}
                                className="text-xs text-accent hover:underline font-black"
                              >
                                View in Library
                              </button>
                              <button
                                onClick={() => handleDeleteHerb(herb.id)}
                                className="text-xs text-rose-600 hover:underline font-black flex items-center gap-0.5"
                              >
                                <Trash2 className="h-3.5 w-3.5 inline" /> Delete
                              </button>
                            </div>
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-4 flex items-center justify-between text-sm text-ink">
                <span>Page {herbsPage} of {Math.max(1, Math.ceil(herbsTotal / 25))}</span>
                <div className="flex gap-2">
                  <button type="button" disabled={herbsPage === 1} onClick={() => setHerbsPage((page) => page - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Previous</button>
                  <button type="button" disabled={herbsPage * 25 >= herbsTotal} onClick={() => setHerbsPage((page) => page + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Next</button>
                </div>
              </div>
            </div>
  );
}
