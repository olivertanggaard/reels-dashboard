export const dynamic = 'force-dynamic'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const HOOK_TYPES = ['alle', 'curiosity', 'bold_claim', 'question', 'story', 'contrast']

function beregnScore(m: any): number | null {
  if (!m) return null

  return (
    ((m.saves ?? 0) * 0.30) +
    ((m.shares ?? 0) * 0.25) +
    ((m.follows ?? 0) * 0.25) +
    ((m.retention_pct ?? 0) * 0.15) +
    (((m.views ?? 0) / 1000) * 0.05)
  )
}

function scoreFarve(score: number) {
  if (score >= 30) return 'text-green-400'
  if (score >= 15) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreLabel(score: number) {
  if (score >= 50) return '🚀'
  if (score >= 30) return '🔁'
  if (score >= 15) return '⏳'
  return '💀'
}

function syncDot(status: string | null | undefined) {
  if (status === 'synced') return 'bg-green-400'
  if (status === 'pending') return 'bg-yellow-400'
  if (status === 'error') return 'bg-red-400'
  return 'bg-gray-700'
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ hook?: string }>
}) {
  const { hook } = await searchParams
  const aktiv = hook || 'alle'

  let reelsQuery = supabase.from('reels').select('*')
  if (aktiv !== 'alle') reelsQuery = reelsQuery.eq('hook_type', aktiv)

  const [{ data: reels, error: reelsError }, { data: metrics, error: metricsError }] =
    await Promise.all([
      reelsQuery,
      supabase.from('metrics').select('*'),
    ])

  if (reelsError) {
    console.error('Fejl ved hentning af reels:', reelsError)
  }

  if (metricsError) {
    console.error('Fejl ved hentning af metrics:', metricsError)
  }

  const metricsMap = new Map((metrics || []).map((m: any) => [m.reel_id, m]))

  const reelsMedScore = (reels || [])
    .map((reel: any) => {
      const reelMetrics = metricsMap.get(reel.id) || null
      return {
        ...reel,
        metrics: reelMetrics,
        score: beregnScore(reelMetrics),
      }
    })
    .sort((a: any, b: any) => (b.score ?? -1) - (a.score ?? -1))

  return (
    <main className="p-8 relative min-h-screen">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <img src="/cs-logo.png" alt="" className="w-96 opacity-5 select-none" />
      </div>

      <div className="relative z-10">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Reels Dashboard</h1>
          <Link
            href="/opret"
            className="bg-white text-black px-4 py-2 rounded text-sm"
          >
            + Opret reel
          </Link>
        </div>

        <div className="flex gap-4 mb-6 border-b border-gray-800 pb-3">
          {HOOK_TYPES.map(h => (
            <Link
              key={h}
              href={`/?hook=${h}`}
              className={`text-sm capitalize pb-2 ${
                aktiv === h ? 'border-b-2 border-white font-bold' : 'text-gray-500'
              }`}
            >
              {h.replace('_', ' ')}
            </Link>
          ))}
        </div>

        {reelsMedScore.length === 0 && (
          <p className="text-gray-500">Ingen reels endnu.</p>
        )}

        {reelsMedScore.map((reel: any) => (
          <Link key={reel.id} href={`/reel/${reel.id}`}>
            <div className="border border-gray-800 p-4 mb-2 rounded hover:border-gray-600 cursor-pointer flex justify-between items-center">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${syncDot(reel.sync_status)}`}
                  />
                  <p className="font-bold truncate">{reel.topic}</p>
                </div>

                <p className="text-sm text-gray-500 mb-1">
                  {reel.hook_type} — {reel.status}
                </p>

                {reel.hook_text && (
                  <p className="text-xs text-gray-600 truncate">{reel.hook_text}</p>
                )}
              </div>

              {reel.score !== null ? (
                <div className="text-right flex-shrink-0">
                  <p className={`font-bold ${scoreFarve(reel.score)}`}>
                    {scoreLabel(reel.score)} {reel.score.toFixed(1)}
                  </p>
                  <p className="text-xs text-gray-600">score</p>
                </div>
              ) : (
                <p className="text-xs text-gray-600 flex-shrink-0">ingen metrics</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}