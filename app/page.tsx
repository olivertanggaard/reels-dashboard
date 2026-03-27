export const dynamic = 'force-dynamic'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const HOOK_TYPES = ['alle', 'curiosity', 'bold_claim', 'question', 'story', 'contrast']

function beregnScore(m: any) {
  if (!m) return null
  return (
    m.saves * 0.30 +
    m.shares * 0.25 +
    m.follows * 0.25 +
    m.retention_pct * 0.15 +
    (m.views / 1000) * 0.05
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

export default async function Home({ searchParams }: { searchParams: Promise<{ hook?: string }> }) {
  const { hook } = await searchParams
  const aktiv = hook || 'alle'

  let query = supabase.from('reels').select('*, metrics(*)')
  if (aktiv !== 'alle') query = query.eq('hook_type', aktiv)

  const { data: reels } = await query

  const reelsMedScore = reels?.map(reel => ({
    ...reel,
    score: beregnScore(reel.metrics?.[0])
  })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

  return (
    <main className="p-8 relative min-h-screen">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <img src="/cs-logo.png" alt="" className="w-96 opacity-5 select-none" />
      </div>

      <div className="relative z-10">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Reels Dashboard</h1>
          <Link href="/opret" className="bg-white text-black px-4 py-2 rounded text-sm">+ Opret reel</Link>
        </div>

        <div className="flex gap-4 mb-6 border-b border-gray-800 pb-3">
          {HOOK_TYPES.map(h => (
            <Link
              key={h}
              href={`/?hook=${h}`}
              className={`text-sm capitalize pb-2 ${aktiv === h ? 'border-b-2 border-white font-bold' : 'text-gray-500'}`}
            >
              {h.replace('_', ' ')}
            </Link>
          ))}
        </div>

        {reelsMedScore?.length === 0 && <p className="text-gray-500">Ingen reels endnu.</p>}
        {reelsMedScore?.map(reel => (
          <Link key={reel.id} href={`/reel/${reel.id}`}>
            <div className="border border-gray-800 p-4 mb-2 rounded hover:border-gray-600 cursor-pointer flex justify-between items-center">
              <div>
                <p className="font-bold">{reel.topic}</p>
                <p className="text-sm text-gray-500">{reel.hook_type} — {reel.status}</p>
              </div>
              {reel.score !== null ? (
                <div className="text-right">
                  <p className={`font-bold ${scoreFarve(reel.score)}`}>{scoreLabel(reel.score)} {reel.score.toFixed(1)}</p>
                  <p className="text-xs text-gray-600">score</p>
                </div>
              ) : (
                <p className="text-xs text-gray-600">ingen metrics</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}