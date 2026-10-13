'use client';

import SuggestionStatusBadge from '@/features/suggestions/SuggestionStatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Leaf, Users, BookOpen, ShieldCheck } from 'lucide-react';
import type React from 'react';
import type { DashboardStats } from '../types';
import type { ChartData } from '../AdminDashboardCharts';

interface DashboardSectionProps {
  dashboardStats: DashboardStats | null;
  AdminDashboardCharts: React.ComponentType<{ data: ChartData; }>;
  error: string | null;
}

export default function DashboardSection({
  dashboardStats,
  AdminDashboardCharts,
  error,
}: DashboardSectionProps) {
  return (
<div>
              <h1 className="mb-6 text-2xl font-semibold text-ink">
                Dashboard Overview
              </h1>
              {/* Stats Row */}
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 lg:gap-4">
                {[
                  { label: 'Total Herbs', value: dashboardStats?.totalHerbs, icon: Leaf },
                  { label: 'Pending Review', value: dashboardStats ? (dashboardStats.suggestionsByStatus.find((entry) => entry.name === 'Pending')?.value ?? 0) : undefined, icon: Clock },
                  { label: 'Approved Suggestions', value: dashboardStats ? (dashboardStats.suggestionsByStatus.find((entry) => entry.name === 'Approved')?.value ?? 0) : undefined, icon: ShieldCheck },
                  { label: 'Total Users', value: dashboardStats?.totalUsers, icon: Users },
                  { label: 'FAQ Facts', value: dashboardStats?.totalKnowledgeFacts, icon: BookOpen },
                ].map(({ label, value, icon: Icon }) => (
                  <Card key={label} className="min-w-0">
                    <CardContent className="flex min-h-36 flex-col justify-between gap-4 pt-5">
                      <Icon className="size-5 text-accent" aria-hidden="true" />
                      <div>
                        <div className="text-3xl font-semibold tabular-nums text-ink">{value ?? '—'}</div>
                        <div className="mt-1 text-xs font-medium leading-snug text-muted">{label}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {dashboardStats && <AdminDashboardCharts data={dashboardStats} />}


              <Card>
                  <CardHeader><CardTitle className="text-base text-ink">Recent Contribution Requests</CardTitle></CardHeader>
                  <CardContent className="pt-4">
                  {!dashboardStats ? (
                    <p role="status" className="py-8 text-center text-sm text-muted">{error ? 'Dashboard data is unavailable.' : 'Loading dashboard data…'}</p>
                  ) : dashboardStats.recentSuggestions.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted">No recent suggestions.</p>
                  ) : (
                    <div className="space-y-4">
                      {dashboardStats.recentSuggestions.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                          <div>
                            <h4 className="text-sm font-semibold text-ink">{s.localName}</h4>
                            <p className="text-xs italic text-muted">{s.scientificName}</p>
                          </div>
                          <SuggestionStatusBadge status={s.status} />
                        </div>
                      ))}
                    </div>
                  )}
                  </CardContent>
              </Card>
            </div>
  );
}
