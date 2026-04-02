'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type ActionState = 'scale' | 'repost' | 'wait' | 'kill'
type SyncStatus = 'not_connected' | 'pending' | 'synced' | 'error'

type InstagramReel = {
  id: string
  shortcode: string | null
  caption: string | null
  permalink: string | null
  thumbnail_url: string | null
  media_url: string | null
  media_type: string | null
  media_product_type: string | null
  timestamp: string | null
  views: number | null
  reach: number | null
  saved: number | null
  shares: number | null
  like_count: number | null
  comments_count: number | null
  total_interactions: number | null
  last_synced_at: string | null
}

type Reel = {
  id: string
  created_at: string | null
  topic: string | null
  hook_type: string | null
  hook_text: string | null
  body_summary: string | null
  posted_at: string | null
  status: string | null
  action_state: ActionState | null
  sync_status: SyncStatus | null
  last_synced_at: string | null
  reel_url: string | null
  instagram_shortcode: string | null
  instagram_media_id: string | null
  ig_user_id: string | null
  last_sync_error: string | null
  score: number | null
  deleted_at?: string | null
  ai_summary?: string | null
  ai_strengths?: string[] | null
  ai_weaknesses?: string[] | null
  ai_verdict?: string | null
  ai_next_move?: string | null
  ai_analyzed_at?: string | null
  instagram_reel: InstagramReel | null
  calculated_score: number
  recommended_action: ActionState
}

type DashboardAnalysis = {
  summary: string
  winning_patterns: string[]
  losing_patterns: string[]
  best_hook_types: string[]
  weakest_hook_types: string[]
  best_topics: string[]
  weakest_topics: string[]
  repost_candidates: string[]
  kill_candidates: string[]
  next_content_ideas: string[]
  strategic_recommendations: string[]
}

type ReelsResponse = {
  success: boolean
  count: number
  data: Reel[]
  error?: string
}

type DashboardAnalysisResponse = {
  success: boolean
  analysis: DashboardAnalysis | null
  meta?: {
    id: string
    created_at: string
    dataset_total_reels: number
    dataset_synced_reels: number
    avg_score: number
  }
  error?: string
}

const HOOK_TYPES = ['alle', 'curiosity', 'bold_claim', 'question', 'story', 'contrast']

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function syncDot(status: string | null | undefined) {
  if (status === 'synced') return 'bg-green-400'
  if (status === 'pending') return 'bg-yellow-400'
  if (status === 'error') return 'bg-red-400'
  return 'bg-gray-700'
}

function scoreColor(score: number) {
  if (score >= 70) return 'text-green-400'
  if (score >= 45) return 'text-blue-400'
  if (score >= 25) return 'text-yellow-400'
  return 'text-red-400'
}

function actionLabel(action: ActionState) {
  if (action === 'scale') return '🚀 Scale'
  if (action === 'repost') return '🔁 Repost'
  if (action === 'wait') return '⏳ Wait'
  return '💀 Kill'
}

function safeHookTypeLabel(value: string | null | undefined) {
  return value ? value.replace('_', ' ') : 'ukendt'
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('da-DK').format(value)
}

export default function DashboardPage() {
  const [reels, setReels] = useState<Reel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeHook, setActiveHook] = useState('alle')

  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<DashboardAnalysis | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysisLoaded, setAnalysisLoaded] = useState(false)
  const [analysisMeta, setAnalysisMeta] = useState<DashboardAnalysisResponse['meta'] | null>(null)

  async function loadReels() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/reels', {
        cache: 'no-store',
      })

      const json: ReelsResponse = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to fetch reels')
      }

      setReels(json.data ?? [])
    } catch (err) {
      console.error('Dashboard fetch reels error:', err)
      setError(err instanceof Error ? err.message : 'Noget gik galt ved hentning af reels.')
    } finally {
      setLoading(false)
    }
  }

  async function loadLatestAnalysis() {
    try {
      const res = await fetch('/api/ai/analyze-dashboard', {
        method: 'GET',
        cache: 'no-store',
      })

      const json: DashboardAnalysisResponse = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Kunne ikke hente seneste dashboard-analyse.')
      }

      setAnalysis(json.analysis ?? null)
      setAnalysisMeta(json.meta ?? null)
      setAnalysisLoaded(true)
    } catch (err) {
      console.error('Load latest dashboard analysis error:', err)
      setAnalysisError(err instanceof Error ? err.message : 'Kunne ikke hente seneste analyse.')
      setAnalysisLoaded(true)
    }
  }

  async function analyzeDashboard() {
    setAnalyzing(true)
    setAnalysisError(null)

    try {
      const res = await fetch('/api/ai/analyze-dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const json: DashboardAnalysisResponse = await res.json()

      if (!res.ok || !json.success || !json.analysis) {
        throw new Error(json.error || 'Kunne ikke analysere dashboard.')
      }

      setAnalysis(json.analysis)
      setAnalysisMeta(json.meta ?? null)
      setAnalysisLoaded(true)
    } catch (err) {
      console.error('Dashboard AI error:', err)
      setAnalysisError(err instanceof Error ? err.message : 'Noget gik galt ved AI-analysen.')
      setAnalysisLoaded(true)
    } finally {
      setAnalyzing(false)
    }
  }

  useEffect(() => {
    loadReels()
    loadLatestAnalysis()
  }, [])

  const filteredReels = useMemo(() => {
    const base = [...reels]

    if (activeHook === 'alle') {
      return base.sort((a, b) => b.calculated_score - a.calculated_score)
    }

    return base
      .filter((reel) => (reel.hook_type || '').toLowerCase() === activeHook.toLowerCase())
      .sort((a, b) => b.calculated_score - a.calculated_score)
  }, [reels, activeHook])

  const summary = useMemo(() => {
    const total = reels.length
    const synced = reels.filter((r) => r.sync_status === 'synced').length
    const pending = reels.filter((r) => r.sync_status === 'pending').length
    const errors = reels.filter((r) => r.sync_status === 'error').length
    const avgScore =
      total > 0
        ? Math.round(reels.reduce((sum, reel) => sum + num(reel.calculated_score), 0) / total)
        : 0
    const repostOrScale = reels.filter(
      (r) => r.recommended_action === 'repost' || r.recommended_action === 'scale'
    ).length

    return { total, synced, pending, errors, avgScore, repostOrScale }
  }, [reels])

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-500">Loader dashboard...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen bg-black text-white p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={loadReels}
            className="bg-white text-black px-4 py-2 rounded"
          >
            Prøv igen
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-5 mb-8 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Reels Dashboard</h1>
            <p className="text-gray-400">{summary.total} reels fundet</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                setAnalysis(null)
                setAnalysisError(null)
                setAnalysisLoaded(false)
                setAnalysisMeta(null)
              }}
              className="border border-red-500 text-red-400 px-4 py-2 rounded text-sm hover:bg-red-500/10"
            >
              Reset AI
            </button>

            <button
              onClick={analyzeDashboard}
              disabled={analyzing}
              className="bg-white text-black px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              {analyzing ? 'Analyserer dashboard...' : 'Analyser hele dashboard'}
            </button>

            <button
              onClick={loadReels}
              className="border border-gray-700 px-4 py-2 rounded text-sm hover:border-gray-500"
            >
              Opdater data
            </button>

            <Link
              href="/opret"
              className="bg-white text-black px-4 py-2 rounded text-sm"
            >
              + Opret reel
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 mb-8">
          <SummaryCard label="Reels total" value={String(summary.total)} />
          <SummaryCard label="Synced" value={String(summary.synced)} />
          <SummaryCard label="Pending" value={String(summary.pending)} />
          <SummaryCard label="Errors" value={String(summary.errors)} />
          <SummaryCard label="Avg. score" value={String(summary.avgScore)} />
        </div>

        <div className="grid gap-8 xl:grid-cols-[1.25fr_1fr] mb-10">
          <div className="border border-gray-800 rounded-2xl bg-zinc-950 p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold">Dashboard AI</h2>
                <p className="text-sm text-gray-500">
                  Strategisk analyse af hele content-billedet
                </p>
              </div>

              {analysisMeta?.created_at ? (
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Seneste analyse</p>
                  <p className="text-sm text-gray-300">
                    {new Date(analysisMeta.created_at).toLocaleString()}
                  </p>
                </div>
              ) : null}
            </div>

            {analysisMeta ? (
              <div className="grid gap-3 md:grid-cols-3 mb-5">
                <MiniCard
                  label="Dataset reels"
                  value={String(analysisMeta.dataset_total_reels ?? 0)}
                />
                <MiniCard
                  label="Dataset synced"
                  value={String(analysisMeta.dataset_synced_reels ?? 0)}
                />
                <MiniCard
                  label="Saved avg score"
                  value={String(analysisMeta.avg_score ?? 0)}
                />
              </div>
            ) : null}

            {!analysisLoaded && !analysis && !analysisError ? (
              <p className="text-sm text-gray-500">
                Klik på <span className="text-gray-300">Analyser hele dashboard</span> for at få
                mønstre, content-retning og næste idéer.
              </p>
            ) : null}

            {analysisError ? (
              <p className="text-sm text-red-400">{analysisError}</p>
            ) : null}

            {analysis ? (
              <div className="space-y-6">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Summary</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{analysis.summary}</p>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <AnalysisList title="Winning patterns" items={analysis.winning_patterns} />
                  <AnalysisList title="Losing patterns" items={analysis.losing_patterns} />
                  <AnalysisList title="Best hook types" items={analysis.best_hook_types} />
                  <AnalysisList title="Weakest hook types" items={analysis.weakest_hook_types} />
                  <AnalysisList title="Best topics" items={analysis.best_topics} />
                  <AnalysisList title="Weakest topics" items={analysis.weakest_topics} />
                  <AnalysisList title="Repost candidates" items={analysis.repost_candidates} />
                  <AnalysisList title="Kill candidates" items={analysis.kill_candidates} />
                </div>

                <AnalysisList
                  title="Next content ideas"
                  items={analysis.next_content_ideas}
                  wide
                />

                <AnalysisList
                  title="Strategic recommendations"
                  items={analysis.strategic_recommendations}
                  wide
                />
              </div>
            ) : null}
          </div>

          <div className="border border-gray-800 rounded-2xl bg-zinc-950 p-5">
            <h2 className="text-lg font-bold mb-4">Quick filters</h2>

            <div className="flex flex-wrap gap-2 mb-6">
              {HOOK_TYPES.map((hook) => {
                const isActive = activeHook === hook

                return (
                  <button
                    key={hook}
                    onClick={() => setActiveHook(hook)}
                    className={`px-3 py-2 rounded text-sm border ${
                      isActive
                        ? 'bg-white text-black border-white'
                        : 'border-gray-700 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {hook.replace('_', ' ')}
                  </button>
                )
              })}
            </div>

            <div className="space-y-3 text-sm">
              <QuickStat
                label="Scale/Repost candidates"
                value={String(summary.repostOrScale)}
              />
              <QuickStat
                label="Connected to Instagram"
                value={`${summary.synced}/${summary.total}`}
              />
              <QuickStat
                label="Current filter"
                value={activeHook === 'alle' ? 'Alle' : activeHook.replace('_', ' ')}
              />
            </div>
          </div>
        </div>

        {filteredReels.length === 0 ? (
          <p className="text-gray-500">Ingen reels matcher det valgte filter.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredReels.map((reel) => {
              const instagram = reel.instagram_reel
              const preview = instagram?.thumbnail_url || instagram?.media_url || null
              const views = num(instagram?.views)
              const reach = num(instagram?.reach)

              return (
                <Link
                  key={reel.id}
                  href={`/reel/${reel.id}`}
                  className="border border-gray-800 rounded-2xl bg-zinc-950 p-4 hover:border-gray-600 transition"
                >
                  <div className="mb-4">
                    {preview ? (
                      <img
                        src={preview}
                        alt={reel.topic || 'reel preview'}
                        className="w-full h-56 object-cover rounded-xl"
                      />
                    ) : (
                      <div className="w-full h-56 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500">
                        Ingen preview endnu
                      </div>
                    )}
                  </div>

                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`w-3 h-3 rounded-full flex-shrink-0 ${syncDot(reel.sync_status)}`}
                        />
                        <h3 className="font-bold text-2xl truncate">{reel.topic || 'Uden titel'}</h3>
                      </div>

                      <p className="text-sm text-gray-400">
                        {safeHookTypeLabel(reel.hook_type)} — {reel.status || 'ukendt'}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className={`font-bold text-3xl ${scoreColor(reel.calculated_score)}`}>
                        {reel.calculated_score}
                      </p>
                      <p className="text-xs text-gray-500">score</p>
                    </div>
                  </div>

                  {reel.hook_text ? (
                    <p className="text-base text-gray-300 mb-4 line-clamp-2">{reel.hook_text}</p>
                  ) : null}

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <MiniCard label="Sync" value={reel.sync_status || 'not_connected'} />
                    <MiniCard label="Action" value={actionLabel(reel.recommended_action)} />
                    <MiniCard label="Views" value={formatNumber(views)} />
                    <MiniCard label="Reach" value={formatNumber(reach)} />
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {reel.posted_at
                        ? new Date(reel.posted_at).toLocaleDateString()
                        : 'Ikke postet endnu'}
                    </span>
                    <span>{instagram ? 'Linked' : 'Unlinked'}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-800 rounded-2xl bg-zinc-950 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  )
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-800 pb-3">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200 text-right">{value}</span>
    </div>
  )
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-800 rounded-xl p-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-lg text-gray-100">{value}</p>
    </div>
  )
}

function AnalysisList({
  title,
  items,
  wide = false,
}: {
  title: string
  items: string[]
  wide?: boolean
}) {
  return (
    <div className={`border border-gray-800 rounded-xl p-4 ${wide ? '' : ''}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">{title}</p>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Ingen data endnu.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="text-sm text-gray-300">
              • {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}