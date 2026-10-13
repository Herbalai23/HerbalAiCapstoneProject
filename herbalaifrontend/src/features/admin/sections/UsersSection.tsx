'use client';

import { Search, Users, AlertCircle, X, Copy, Check, Filter } from 'lucide-react';
import type React from 'react';
import type { SystemUser } from '../types';
import type { User } from '@/lib/context/AuthContext';

interface UsersSectionProps {
  usersAllTotal: number;
  userSearch: string;
  setUserSearch: React.Dispatch<React.SetStateAction<string>>;
  setUsersPage: React.Dispatch<React.SetStateAction<number>>;
  setUserStatusFilter: React.Dispatch<React.SetStateAction<"ALL" | "ACTIVE" | "BANNED">>;
  userStatusFilter: "ALL" | "ACTIVE" | "BANNED";
  setUserRoleFilter: React.Dispatch<React.SetStateAction<"ALL" | "admin" | "contributor">>;
  userRoleFilter: "ALL" | "admin" | "contributor";
  usersBusy: boolean;
  usersLoadFailed: boolean;
  filteredUsersList: { isBanned: boolean; id: string; username: string; email: string; name: string; role: string; avatar: string | null; joined: string; banReason?: string | null; banExpiresAt?: string | null; }[];
  usersTotal: number;
  setUsersRefresh: React.Dispatch<React.SetStateAction<number>>;
  user: User;
  handleCopyEmail: (userId: string, email: string) => Promise<void>;
  copiedEmailId: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccessMsg: React.Dispatch<React.SetStateAction<string | null>>;
  setBanTarget: React.Dispatch<React.SetStateAction<SystemUser | null>>;
  banTarget: SystemUser | null;
  usersPage: number;
}

export default function UsersSection({
  usersAllTotal,
  userSearch,
  setUserSearch,
  setUsersPage,
  setUserStatusFilter,
  userStatusFilter,
  setUserRoleFilter,
  userRoleFilter,
  usersBusy,
  usersLoadFailed,
  filteredUsersList,
  usersTotal,
  setUsersRefresh,
  user,
  handleCopyEmail,
  copiedEmailId,
  setError,
  setSuccessMsg,
  setBanTarget,
  banTarget,
  usersPage,
}: UsersSectionProps) {
  return (
<div className="rounded-2xl border border-line bg-panel p-4 sm:p-6 shadow-sm font-sans">
              {/* Header with Title & Live Search */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="font-serif-custom font-black italic text-xl text-ink flex items-center gap-2">
                    <Users className="h-5 w-5 text-accent" />
                    User Management Console ({usersAllTotal})
                  </h2>
                  <p className="text-xs text-muted mt-1">
                    Manage roles, authentication credentials, and platform account status
                  </p>
                </div>

                {/* Quick Search */}
                <div className="relative w-full sm:w-72">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                    <Search className="h-3.5 w-3.5" />
                  </span>
                  <input name="userSearch"
                    type="text"
                    placeholder="Search name, @username, email..."
                    aria-label="Search users"
                    maxLength={100}
                    value={userSearch}
                    onChange={(e) => { setUserSearch(e.target.value); setUsersPage(1); }}
                    className="w-full rounded-xl border border-input bg-panel py-2 pl-9 pr-8 text-xs font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {userSearch && (
                    <button
                      type="button"
                      onClick={() => { setUserSearch(''); setUsersPage(1); }}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-muted hover:text-ink cursor-pointer"
                      title="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Toolbar: Status & Role */}
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-soft/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 text-xs font-bold text-muted mr-1">
                    <Filter className="h-3.5 w-3.5 text-muted" /> Filter:
                  </div>

                  {/* Status Pills */}
                  <div className="inline-flex rounded-lg border border-line bg-panel p-0.5 text-xs">
                    {(['ALL', 'ACTIVE', 'BANNED'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => { setUserStatusFilter(status); setUsersPage(1); }}
                        aria-pressed={userStatusFilter === status}
                        className={`rounded-md px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                          userStatusFilter === status
                            ? 'bg-[#606c38] text-white shadow-sm'
                            : 'text-muted hover:text-ink'
                        }`}
                      >
                        {status === 'ALL' ? 'All' : status === 'ACTIVE' ? 'Active' : 'Banned'}
                      </button>
                    ))}
                  </div>

                  {/* Role Pills */}
                  <div className="inline-flex rounded-lg border border-line bg-panel p-0.5 text-xs">
                    {(['ALL', 'admin', 'contributor'] as const).map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => { setUserRoleFilter(role); setUsersPage(1); }}
                        aria-pressed={userRoleFilter === role}
                        className={`rounded-md px-2.5 py-1 text-xs font-bold transition cursor-pointer capitalize ${
                          userRoleFilter === role
                            ? 'bg-[#2d6a4f] text-white shadow-sm'
                            : 'text-muted hover:text-ink'
                        }`}
                      >
                        {role === 'ALL' ? 'All Roles' : role === 'admin' ? 'Admins' : 'Contributors'}
                      </button>
                    ))}
                  </div>

                  {(userRoleFilter !== 'ALL' || userStatusFilter !== 'ALL' || userSearch) && (
                    <button
                      type="button"
                      onClick={() => {
                        setUserRoleFilter('ALL');
                        setUserStatusFilter('ALL');
                        setUserSearch('');
                        setUsersPage(1);
                      }}
                      className="text-xs font-bold text-accent hover:underline ml-1 cursor-pointer"
                    >
                      Reset filters
                    </button>
                  )}
                </div>

                <div className="text-xs font-semibold text-muted">
                  Showing <strong className="text-ink">{usersBusy || usersLoadFailed ? 0 : filteredUsersList.length}</strong> of {usersTotal} matching accounts
                </div>
              </div>

              {/* Users Cards / Rows */}
              {usersBusy || usersLoadFailed || filteredUsersList.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line p-12 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-soft text-muted mb-3">
                    <Users className="h-6 w-6" />
                  </div>
                  <h3 role="status" className="font-bold text-ink text-sm">{usersBusy ? 'Loading users…' : usersLoadFailed ? 'Users could not load' : 'No users found'}</h3>
                  <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
                    {usersBusy ? 'Checking all accounts for your selected filters.' : usersLoadFailed ? 'Retry to refresh the account list.' : userSearch || userRoleFilter !== 'ALL' || userStatusFilter !== 'ALL'
                      ? 'No users match the active filters or search keyword.'
                      : 'There are no registered accounts in this page view.'}
                  </p>
                  {!usersBusy && (usersLoadFailed || userSearch || userRoleFilter !== 'ALL' || userStatusFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        if (usersLoadFailed) { setUsersRefresh(previous => previous + 1); return; }
                        setUserSearch('');
                        setUserRoleFilter('ALL');
                        setUserStatusFilter('ALL');
                        setUsersPage(1);
                      }}
                      className="mt-4 text-xs font-bold text-accent hover:underline cursor-pointer"
                    >
                      {usersLoadFailed ? 'Retry' : 'Clear search & filters'}
                    </button>
                  )}
                </div>
              ) : (
                <div role="table" aria-label="Users list" className="space-y-3">
                  {filteredUsersList.map((u) => {
                    const isCurrentUser = u.id === user.id;
                    return (
                      <div
                        key={u.id}
                        role="row"
                        className={`group relative rounded-2xl border transition-all duration-200 p-4 sm:p-5 ${
                          u.isBanned
                            ? 'border-rose-500/30 bg-rose-500/[0.03] dark:bg-rose-950/[0.08]'
                            : 'border-line bg-panel hover:border-line-strong hover:shadow-sm'
                        }`}
                      >
                        {/* Top / Main Row: User details, Role, Status, and Action */}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4">
                          {/* Left: User Identity */}
                          <div className="flex items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
                            {/* Avatar */}
                            <div className="relative shrink-0">
                              {u.avatar ? (
                                <img
                                  src={u.avatar}
                                  alt={u.name}
                                  className="h-11 w-11 rounded-2xl object-cover border border-line"
                                />
                              ) : (
                                <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-[#2d6a4f]/20 to-[#606c38]/20 text-[#2d6a4f] dark:text-[#74c69d] flex items-center justify-center font-black text-sm border border-line shadow-inner select-none">
                                  {u.name?.trim().charAt(0).toUpperCase() || 'U'}
                                </div>
                              )}
                              {u.isBanned ? (
                                <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-rose-600 ring-2 ring-panel" title="Banned" />
                              ) : (
                                <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-panel" title="Active" />
                              )}
                            </div>

                            {/* Name, Username, and Badges */}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-extrabold text-ink text-sm sm:text-base tracking-tight truncate max-w-[200px] sm:max-w-xs md:max-w-sm" title={u.name}>
                                  {u.name}
                                </span>
                                {isCurrentUser && (
                                  <span className="shrink-0 rounded-md bg-[#2d6a4f]/15 px-2 py-0.5 text-[10px] font-black text-[#2d6a4f] dark:text-[#74c69d] border border-[#2d6a4f]/30">
                                    You
                                  </span>
                                )}
                                <span className={`shrink-0 text-[10px] font-black tracking-wider px-2 py-0.5 rounded-md uppercase border ${
                                  u.role === 'admin'
                                    ? 'bg-[#1b4332]/10 dark:bg-[#1b4332]/40 text-[#2d6a4f] dark:text-[#74c69d] border-[#2d6a4f]/30'
                                    : 'bg-soft text-ink border-line'
                                }`}>
                                  {u.role}
                                </span>
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted font-medium min-w-0">
                                <span className="font-semibold text-muted truncate max-w-[150px] sm:max-w-[220px]" title={`@${u.username}`}>
                                  @{u.username}
                                </span>
                                <span className="inline-block h-1 w-1 rounded-full bg-muted/40 shrink-0" />
                                <div className="inline-flex items-center gap-1.5 min-w-0">
                                  <span className="truncate max-w-[180px] sm:max-w-[260px] md:max-w-xs font-mono text-[11px] text-ink/80" title={u.email}>
                                    {u.email}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyEmail(u.id, u.email)}
                                    className="text-muted hover:text-ink cursor-pointer p-0.5 shrink-0 transition-colors"
                                    title="Copy email address"
                                  >
                                    {copiedEmailId === u.id ? (
                                      <Check className="h-3 w-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Right: Status Pill & Action Button (strictly side-by-side, no stacking/wrapping) */}
                          <div className="flex shrink-0 items-center justify-between sm:justify-end gap-2.5 sm:gap-3 pt-2.5 lg:pt-0 border-t lg:border-t-0 border-line/50">
                            {/* Status Indicator */}
                            <div className="shrink-0">
                              {u.isBanned ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-700 dark:text-rose-400">
                                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                                  {u.banExpiresAt ? 'Temporarily Banned' : 'Indefinitely Banned'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                  Active
                                </span>
                              )}
                            </div>

                            {/* Ban / Unban Button */}
                            <div className="shrink-0">
                              {!isCurrentUser && (
                                <button
                                  type="button"
                                  onClick={() => { setError(null); setSuccessMsg(null); setBanTarget(u); }}
                                  disabled={banTarget !== null}
                                  className={`inline-flex items-center gap-1.5 text-xs font-black px-3.5 py-1.5 rounded-xl border transition-all cursor-pointer shadow-sm disabled:opacity-50 ${
                                    u.isBanned
                                      ? 'border-[#2d6a4f]/40 text-[#2d6a4f] bg-[#eef5f0] hover:bg-[#2d6a4f] hover:text-white dark:border-[#74c69d]/40 dark:text-[#74c69d] dark:bg-[#2d6a4f]/20 dark:hover:bg-[#2d6a4f] dark:hover:text-white'
                                      : 'border-rose-600/40 text-rose-600 bg-rose-50 hover:bg-rose-600 hover:text-white dark:border-rose-400/40 dark:text-rose-400 dark:bg-rose-950/30 dark:hover:bg-rose-600 dark:hover:text-white'
                                  }`}
                                >
                                  {u.isBanned ? 'Unban User' : 'Ban User'}
                                </button>
                              )}
                              {isCurrentUser && (
                                <span className="text-[11px] font-bold text-muted px-2.5 py-1 rounded-lg border border-line bg-soft/60">
                                  Protected (Current Admin)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Ban Reason Callout (if account is banned) */}
                        {u.isBanned && (
                          <div className="mt-3.5 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] dark:bg-rose-950/20 p-3 text-xs">
                            <div className="flex items-center gap-2 font-bold text-rose-800 dark:text-rose-300">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                {u.banExpiresAt ? `Ban active until ${new Date(u.banExpiresAt).toLocaleString()}` : 'Indefinite suspension (until manual unban)'}
                              </span>
                            </div>
                            <p className="mt-1 pl-5.5 text-ink/80 font-medium leading-relaxed">
                              <span className="font-bold text-muted">Reason: </span>
                              {u.banReason || 'No reason recorded for this earlier ban.'}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-ink border-t border-line/60 pt-4">
                <span className="text-xs font-semibold text-muted">
                  Page <strong className="text-ink">{usersPage}</strong> of {Math.max(1, Math.ceil(usersTotal / 25))} · {usersTotal} matching users
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={usersBusy || usersLoadFailed || usersPage === 1}
                    onClick={() => setUsersPage((page) => page - 1)}
                    className="rounded-xl border border-line bg-panel px-3.5 py-1.5 text-xs font-bold text-ink transition hover:bg-soft disabled:opacity-40 cursor-pointer"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={usersBusy || usersLoadFailed || usersPage * 25 >= usersTotal}
                    onClick={() => setUsersPage((page) => page + 1)}
                    className="rounded-xl border border-line bg-panel px-3.5 py-1.5 text-xs font-bold text-ink transition hover:bg-soft disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
  );
}
