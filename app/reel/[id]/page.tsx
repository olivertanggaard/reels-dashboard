'use client'
import { use, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

function beregnScore(m: any) {
  return (
    m.saves * 0.30 +
    m.shares * 0.25 +
    m.follows * 0.25 +
    m.retention_pct * 0.15 +
    (m.views / 1000) * 0.05
  ).toFixed(1)
}

function beregnDecision(score: number) {
  if (score >= 50) return '🚀 Skalér'
  if (score >= 30) return '🔁 Repost / test ny hook'
  if (score >= 15) return '⏳ Vent og observer'
  return '💀 Dræb reelen'
}

export default function ReelDetalje({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [reel, setReel] = useState<any>(null)
  const [metrics, setMetrics] = useState({ views: 0, saves: 0, shares: 0, follows: 0, retention_pct: 0 })
  const [gemt, setGemt] = useState(false)

  useEffect(() => {
    supabase.from('reels').select('*').eq('id', id).single().then(({ data }) => setReel(data))
    supabase.from('metrics').select('*').eq('reel_id', id).single().then(({ data }) => { if (data) setMetrics(data) })
  }, [id])

  async function gemMetrics() {
    await supabase.from('metrics').upsert({ ...metrics, reel_id: id })
    setGemt(true)
  }

  const score = Number(beregnScore(metrics))
  const decision = beregnDecision(score)

  if (!reel) return <p className="p-8">Loader...</p>

  return (
    <main className="p-8 max-w-lg">
      <h1 className="text-2xl font-bold mb-1">{reel.topic}</h1>
      <p className="text-gray-400 mb-6">{reel.hook_type} — {reel.status}</p>

      {['views','saves','shares','follows','retention_pct'].map(felt => (
        <div key={felt} className="mb-3">
          <label className="block text-sm mb-1 capitalize">{felt}</label>
          <input type="number" className="w-full border p-2 rounded bg-transparent"
            value={(metrics as any)[felt]}
            onChange={e => setMetrics({ ...metrics, [felt]: Number(e.target.value) })} />
        </div>
      ))}

      <button className="bg-white text-black px-4 py-2 rounded mb-6" onClick={gemMetrics}>Gem metrics</button>
      {gemt && <p className="text-green-400 mb-4">✅ Gemt</p>}

      <div className="border p-4 rounded">
        <p className="text-3xl font-bold mb-2">Score: {score}</p>
        <p className="text-xl">{decision}</p>
      </div>
    </main>
  )
}