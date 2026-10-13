'use client';

import { Search, ClipboardList } from 'lucide-react';
import type React from 'react';
import type { AuditLog } from '../types';

interface AuditLogsSectionProps {
  auditSearch: string;
  setAuditSearch: React.Dispatch<React.SetStateAction<string>>;
  auditLoading: boolean;
  auditLoadFailed: boolean;
  auditLogs: AuditLog[];
}

export default function AuditLogsSection({
  auditSearch,
  setAuditSearch,
  auditLoading,
  auditLoadFailed,
  auditLogs,
}: AuditLogsSectionProps) {
  return (
<div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-2xl font-black text-ink italic">
                    Administrative Audit Logs
                  </h1>
                  <p className="text-xs text-muted font-medium mt-1">
                    Records selected administrator actions in Herbal-Ai. Direct database edits and routine activity are not logged.
                  </p>
                </div>

                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                  <input name="auditSearch"
                    type="text"
                    placeholder="Filter audit logs..."
                    aria-label="Filter audit logs"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    className="w-full rounded-xl border border-input bg-panel py-2 pl-9 pr-4 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              {auditLoading || auditLoadFailed || auditLogs.length === 0 ? (
                <div className="bg-panel p-12 text-center rounded-2xl border border-line shadow-sm flex flex-col items-center gap-3">
                  <ClipboardList className="h-10 w-10 text-muted stroke-[1.5]" />
                  <p role="status" className="text-sm font-bold text-muted">{auditLoading ? 'Loading audit logs…' : auditLoadFailed ? 'Audit logs could not be loaded. Please try again.' : 'No audit logs recorded yet'}</p>
                </div>
              ) : (
                <div className="bg-panel rounded-2xl border border-line shadow-sm overflow-x-auto">
                  <table className="admin-table w-full text-left">
                    <thead>
                      <tr className="border-b border-line bg-soft text-[11px] font-extrabold uppercase tracking-wider text-muted">
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Admin Actor</th>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">Target</th>
                        <th className="py-3 px-4">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line text-xs font-semibold text-ink">
                      {auditLogs
                        .filter((log) => {
                          const query = auditSearch.toLowerCase();
                          return (
                            log.action.toLowerCase().includes(query) ||
                            log.targetType.toLowerCase().includes(query) ||
                            log.admin.name.toLowerCase().includes(query) ||
                            (log.admin.email && log.admin.email.toLowerCase().includes(query)) ||
                            (log.details && JSON.stringify(log.details).toLowerCase().includes(query))
                          );
                        })
                        .map((log) => {
                          const getBadgeColor = (action: string) => {
                            if (action.includes('APPROVE')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
                            if (action.includes('REJECT')) return 'bg-amber-50 text-amber-700 border-amber-200';
                            if (action.includes('BAN') && !action.includes('UNBAN')) return 'bg-rose-50 text-rose-700 border-rose-200';
                            if (action.includes('UNBAN')) return 'bg-teal-50 text-teal-700 border-teal-200';
                            if (action.includes('DELETE')) return 'bg-rose-50 text-rose-700 border-rose-200';
                            return 'bg-blue-50 text-blue-700 border-blue-200';
                          };

                          return (
                            <tr key={log.id} className="transition hover:bg-soft">
                              <td className="py-3 px-4 text-muted font-mono text-[11px] whitespace-nowrap">
                                {new Date(log.createdAt).toLocaleString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  {log.admin.avatar?.startsWith('http') ? (
                                    <img src={log.admin.avatar} alt="Admin" className="h-6 w-6 rounded-full object-cover" />
                                  ) : (
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2d6a4f] text-[10px] font-bold text-white uppercase">
                                      {log.admin.name ? log.admin.name.charAt(0) : 'A'}
                                    </span>
                                  )}
                                  <div>
                                    <div className="font-bold text-ink text-xs leading-none">{log.admin.name}</div>
                                    <div className="text-[10px] text-muted">{log.admin.email || log.admin.username}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <span className={`inline-block text-[10px] font-black px-2.5 py-1 rounded-full border ${getBadgeColor(log.action)}`}>
                                  {log.action}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-bold text-ink">{log.targetType}</span>
                                {log.targetId && (
                                  <span className="text-muted text-[11px] block font-mono">ID: {log.targetId}</span>
                                )}
                              </td>
                              <td className="py-3 px-4 max-w-md text-sm text-muted">
                                {log.details ? (
                                  <details>
                                    <summary className="cursor-pointer font-semibold">View change details</summary>
                                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-soft p-3 text-xs">
                                      {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                                    </pre>
                                  </details>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
  );
}
