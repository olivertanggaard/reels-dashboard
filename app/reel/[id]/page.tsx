'use client'
import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { extractInstagramShortcode } from '@/lib/instagram'

function beregnScore(m: any): number {
  return (
    ((m?.saves ?? 0) * 0.30) +
    ((m?.shares ?? 0) * 0.25) +
    ((m?.follows ?? 0) * 0.25) +
    ((m?.retention_pct ?? 0) * 0.15) +
    (((m?.views ?? 0) / 1000) * 0.05)
  )
}

function seedActionState(score: number): string {
  if (score >= 50) return 'scale'
  if (score >= 30) return 'repost'
  if (score >= 15) return 'wait'
  return 'kill'
}

const ACTION_LABELS: Record<string, string> = {
  scale: '🚀 Scale',
  repost: '🔁 Repost',
  wait: '⏳ Wait',
  kill: '💀 Kill',
}

const SYNC_LABELS: Record<string, string> = {
  not_connected: 'Not connected',
  pending: 'Pending',
  synced: 'Synced',
  error: 'Error',
}

export default function ReelDetalje({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [reel, setReel] = useState<any>(null)
  const [metrics, setMetrics] = useState({
    views: 0,
    saves: 0,
    shares: 0,
    follows: 0,
    retention_pct: 0,
  })
  const [gemt, setGemt] = useState(false)
  const [gemtReel, setGemtReel] = useState(false)
  const [reelUrl, setReelUrl] = useState('')
  const [actionState, setActionState] = useState('wait')
  const [actionTouched, setActionTouched] = useState(false)

  useEffect(() => {
    async function hentData() {
      const { data: reelData, error: reelError } = await supabase
        .from('reels')
        .select('*')
        .eq('id', id)
        .single()

      if (reelError) {
        console.error('Fejl ved hentning af reel:', reelError)
        return
      }

      if (reelData) {
        setReel(reelData)
        setReelUrl(reelData.reel_url || '')
        setActionState(reelData.action_state || 'wait')
      }

      const { data: metricsData, error: metricsError } = await supabase
        .from('metrics')
        .select('*')
        .eq('reel_id', id)
        .single()

      if (metricsError && metricsError.code !== 'PGRST116') {
        console.error('Fejl ved hentning af metrics:', metricsError)
        return
      }

      if (metricsData) {
        setMetrics(metricsData)
      }
    }

    hentData()
  }, [id])

  async function gemMetrics() {
    setGemt(false)

    const score = beregnScore(metrics)
    const nextActionState = actionTouched ? actionState : seedActionState(score)

    const { error: metricsError } = await supabase
      .from('metrics')
      .upsert({ ...metrics, reel_id: id })

    if (metricsError) {
      console.error('Fejl ved gem af metrics:', metricsError)
      alert('Kunne ikke gemme metrics.')
      return
    }

    const { error: reelError } = await supabase
      .from('reels')
      .update({ action_state: nextActionState })
      .eq('id', id)

    if (reelError) {
      console.error('Fejl ved opdatering af action state:', reelError)
      alert('Metrics blev gemt, men action state kunne ikke opdateres.')
      return
    }

    setActionState(nextActionState)
    setReel((prev: any) =>
      prev ? { ...prev, action_state: nextActionState } : prev
    )
    setGemt(true)
  }

  async function gemReelInfo() {
    setGemtReel(false)

    const trimmedUrl = reelUrl.trim()
    let updatePayload: Record<string, any>

    if (!trimmedUrl) {
      updatePayload = {
        reel_url: '',
        instagram_shortcode: null,
        sync_status: 'not_connected',
        last_sync_error: null,
        action_state: actionState,
      }
    } else {
      const shortcode = extractInstagramShortcode(trimmedUrl)

      if (shortcode) {
        updatePayload = {
          reel_url: trimmedUrl,
          instagram_shortcode: shortcode,
          sync_status: 'pending',
          last_sync_error: null,
          action_state: actionState,
        }
      } else {
        updatePayload = {
          sync_status: 'error',
          last_sync_error: 'Invalid Instagram reel URL',
          action_state: actionState,
        }
      }
    }

    const { error } = await supabase
      .from('reels')
      .update(updatePayload)
      .eq('id', id)

    if (error) {
      console.error('Fejl ved gem af reel info:', error)
      alert('Kunne ikke gemme reel-information.')
      return
    }

    setReel((prev: any) => (prev ? { ...prev, ...updatePayload } : prev))
    setGemtReel(true)
    setTimeout(() => setGemtReel(false), 2000)
  }

  const score = beregnScore(metrics)

  if (!reel) return <p className="p-8 text-gray-500">Loader...</p>

  return (
    <main className="p-8 max-w-lg">
      <div className="mb-6">
        <Link href="/" className="text-sm text-gray-400 hover:text-white">
          ← Tilbage til dashboard
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-1">{reel.topic}</h1>
      <p className="text-gray-400 mb-6">
        {reel.hook_type} — {reel.status}
      </p>

      {reel.hook_text && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1">Hook</p>
          <p className="text-sm text-gray-300">{reel.hook_text}</p>
        </div>
      )}

      {reel.body_summary && (
        <div className="mb-6">
          <p className="text-xs text-gray-500 mb-1">Summary</p>
          <p className="text-sm text-gray-300">{reel.body_summary}</p>
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm text-gray-400 mb-1">Action</label>
        <select
          className="w-full border border-gray-700 p-2 rounded bg-transparent"
          value={actionState}
          onChange={e => {
            setActionState(e.target.value)
            setActionTouched(true)
          }}
        >
          <option value="scale">🚀 Scale</option>
          <option value="repost">🔁 Repost</option>
          <option value="wait">⏳ Wait</option>
          <option value="kill">💀 Kill</option>
        </select>
      </div>

      {['views', 'saves', 'shares', 'follows', 'retention_pct'].map(felt => (
        <div key={felt} className="mb-3">
          <label className="block text-sm mb-1 text-gray-400">
            {felt === 'retention_pct'
              ? 'Retention %'
              : felt.charAt(0).toUpperCase() + felt.slice(1)}
          </label>
          <input
            type="number"
            className="w-full border border-gray-700 p-2 rounded bg-transparent"
            value={(metrics as any)[felt]}
            onChange={e =>
              setMetrics({ ...metrics, [felt]: Number(e.target.value) })
            }
          />
        </div>
      ))}

      <button
        className="bg-white text-black px-4 py-2 rounded mb-2"
        onClick={gemMetrics}
      >
        Gem metrics
      </button>
      {gemt && <p className="text-green-400 mb-4 text-sm">✅ Metrics gemt</p>}

      <div className="border border-gray-800 p-4 rounded mb-8">
        <p className="text-3xl font-bold mb-1">Score: {score.toFixed(1)}</p>
        <p className="text-lg text-gray-400">{ACTION_LABELS[actionState]}</p>
      </div>

      <div className="border border-gray-800 p-4 rounded">
        <p className="text-sm font-bold mb-4 text-gray-300">Instagram</p>

        <label className="block text-xs text-gray-500 mb-1">Instagram URL</label>
        <input
          className="w-full border border-gray-700 p-2 mb-4 rounded bg-transparent text-sm"
          placeholder="https://www.instagram.com/reel/..."
          value={reelUrl}
          onChange={e => setReelUrl(e.target.value)}
        />

        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-500">Sync</span>
          <span className="text-gray-300">
            {SYNC_LABELS[reel.sync_status] || 'Not connected'}
          </span>
        </div>

        {reel.last_synced_at && (
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500">Last synced</span>
            <span className="text-gray-300">
              {new Date(reel.last_synced_at).toLocaleString()}
            </span>
          </div>
        )}

        {reel.last_sync_error && (
          <p className="text-xs text-red-400 mt-2">{reel.last_sync_error}</p>
        )}

        <button
          className="bg-white text-black px-4 py-2 rounded text-sm mt-4"
          onClick={gemReelInfo}
        >
          Gem
        </button>
        {gemtReel && <p className="text-green-400 text-sm mt-2">✅ Gemt</p>}
      </div>
    </main>
  )
}