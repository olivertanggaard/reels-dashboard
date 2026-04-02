'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { extractInstagramShortcode } from '@/lib/instagram'

type ActionState = 'scale' | 'repost' | 'wait' | 'kill'
type SyncStatus = 'not_connected' | 'pending' | 'synced' | 'error'
type ReelStatus = 'draft' | 'planned' | 'posted'

type ReelRow = {
  id: string
  topic: string | null
  hook_type: string | null
  hook_text: string | null
  body_summary: string | null
  script: string | null
  status: ReelStatus | null
  action_state: ActionState | null
  sync_status: SyncStatus | null
  last_synced_at: string | null
  reel_url: string | null
  instagram_shortcode: string | null
  instagram_media_id: string | null
  ig_user_id: string | null
  last_sync_error: string | null
  posted_at: string | null
  score: number | null
  ai_summary: string | null
  ai_strengths: string[] | null
  ai_weaknesses: string[] | null
  ai_verdict: string | null
  ai_next_move: string | null
  ai_analyzed_at: string | null
}

type InstagramReelRow = {
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
  instagram_account_id?: string | null
}

const ACTION_LABELS: Record<ActionState, string> = {
  scale: '🚀 Scale',
  repost: '🔁 Repost',
  wait: '⏳ Wait',
  kill: '💀 Kill',
}

const SYNC_LABELS: Record<SyncStatus, string> = {
  not_connected: 'Not connected',
  pending: 'Pending',
  synced: 'Synced',
  error: 'Error',
}

const STATUS_OPTIONS: ReelStatus[] = ['draft', 'planned', 'posted']

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('da-DK').format(value)
}

function formatPct(value: number): string {
  return `${value.toFixed(2)}%`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function calculateScore(ig: InstagramReelRow | null): number {
  if (!ig) return 0

  const views = num(ig.views)
  const reach = num(ig.reach)
  const saved = num(ig.saved)
  const shares = num(ig.shares)
  const likes = num(ig.like_count)
  const comments = num(ig.comments_count)
  const totalInteractions = num(ig.total_interactions)

  const base = reach > 0 ? reach : views
  if (base <= 0) return 0

  const saveRate = (saved / base) * 100
  const shareRate = (shares / base) * 100
  const commentRate = (comments / base) * 100
  const likeRate = (likes / base) * 100
  const interactionRate = (totalInteractions / base) * 100

  const saveScore = (clamp(saveRate, 0, 1.5) / 1.5) * 22
  const shareScore = (clamp(shareRate, 0, 0.6) / 0.6) * 10
  const commentScore = (clamp(commentRate, 0, 0.4) / 0.4) * 8
  const likeScore = (clamp(likeRate, 0, 6) / 6) * 24
  const interactionScore = (clamp(interactionRate, 0, 8) / 8) * 16

  const volumeScore =
    views >= 5000 ? 20 :
    views >= 3000 ? 16 :
    views >= 2000 ? 12 :
    views >= 1200 ? 8 :
    views >= 700 ? 5 :
    views >= 300 ? 2 : 0

  return Math.round(
    clamp(
      saveScore +
        shareScore +
        commentScore +
        likeScore +
        interactionScore +
        volumeScore,
      0,
      100
    )
  )
}

function seedActionState(score: number): ActionState {
  if (score >= 70) return 'scale'
  if (score >= 45) return 'repost'
  if (score >= 25) return 'wait'
  return 'kill'
}

function normalizeStatus(value: string | null | undefined): ReelStatus {
  if (value === 'planned' || value === 'posted') return value
  return 'draft'
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

export default function ReelDetalje({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [savingAction, setSavingAction] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingInstagram, setSavingInstagram] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [analyzingAi, setAnalyzingAi] = useState(false)
  const [generatingBodySummary, setGeneratingBodySummary] = useState(false)
  const [showScript, setShowScript] = useState(false)

  const [reel, setReel] = useState<ReelRow | null>(null)
  const [instagramReel, setInstagramReel] = useState<InstagramReelRow | null>(null)

  const [reelUrl, setReelUrl] = useState('')
  const [actionState, setActionState] = useState<ActionState>('wait')
  const [status, setStatus] = useState<ReelStatus>('draft')

  const [actionSaved, setActionSaved] = useState(false)
  const [statusSaved, setStatusSaved] = useState(false)
  const [instagramSaved, setInstagramSaved] = useState(false)
  const [aiSaved, setAiSaved] = useState(false)
  const [bodySummarySaved, setBodySummarySaved] = useState(false)

  async function tryResolveInstagramByShortcode(shortcode: string) {
    const { data, error } = await supabase
      .from('instagram_reels')
      .select('*')
      .eq('shortcode', shortcode)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Fejl ved lookup i instagram_reels:', error)
      return null
    }

    return data as InstagramReelRow | null
  }

  async function loadPage() {
    setLoading(true)
    setActionSaved(false)
    setStatusSaved(false)
    setInstagramSaved(false)
    setAiSaved(false)
    setBodySummarySaved(false)

    const { data: reelData, error: reelError } = await supabase
      .from('reels')
      .select('*')
      .eq('id', id)
      .single()

    if (reelError) {
      console.error('Fejl ved hentning af reel:', reelError)
      setLoading(false)
      return
    }

    const typedReel = {
      ...reelData,
      ai_strengths: normalizeStringArray(reelData?.ai_strengths),
      ai_weaknesses: normalizeStringArray(reelData?.ai_weaknesses),
    } as ReelRow

    setReel(typedReel)
    setReelUrl(typedReel.reel_url || '')
    setActionState((typedReel.action_state as ActionState) || 'wait')
    setStatus(normalizeStatus(typedReel.status))

    let linkedInstagramReel: InstagramReelRow | null = null

    if (typedReel.instagram_media_id) {
      const { data: instagramData, error: instagramError } = await supabase
        .from('instagram_reels')
        .select('*')
        .eq('id', typedReel.instagram_media_id)
        .single()

      if (instagramError && instagramError.code !== 'PGRST116') {
        console.error('Fejl ved hentning af instagram_reel via media id:', instagramError)
      }

      if (instagramData) {
        linkedInstagramReel = instagramData as InstagramReelRow
      }
    }

    if (!linkedInstagramReel && typedReel.instagram_shortcode) {
      const shortcodeMatch = await tryResolveInstagramByShortcode(typedReel.instagram_shortcode)

      if (shortcodeMatch) {
        linkedInstagramReel = shortcodeMatch

        const patch = {
          instagram_media_id: shortcodeMatch.id,
          sync_status: 'synced' as SyncStatus,
          last_synced_at: shortcodeMatch.last_synced_at || new Date().toISOString(),
          last_sync_error: null,
          ig_user_id: shortcodeMatch.instagram_account_id ?? null,
        }

        const { error: patchError } = await supabase
          .from('reels')
          .update(patch)
          .eq('id', id)

        if (patchError) {
          console.error('Fejl ved auto-linking via shortcode:', patchError)
        } else {
          setReel((prev) => (prev ? { ...prev, ...patch } : prev))
        }
      }
    }

    setInstagramReel(linkedInstagramReel)
    setLoading(false)
  }

  useEffect(() => {
    loadPage()
  }, [id])

  const score = useMemo(() => calculateScore(instagramReel), [instagramReel])
  const recommendedAction = useMemo(() => seedActionState(score), [score])

  const views = num(instagramReel?.views)
  const reach = num(instagramReel?.reach)
  const saved = num(instagramReel?.saved)
  const shares = num(instagramReel?.shares)
  const likes = num(instagramReel?.like_count)
  const comments = num(instagramReel?.comments_count)
  const totalInteractions = num(instagramReel?.total_interactions)

  const base = reach > 0 ? reach : views
  const saveRate = base > 0 ? (saved / base) * 100 : 0
  const shareRate = base > 0 ? (shares / base) * 100 : 0
  const likeRate = base > 0 ? (likes / base) * 100 : 0
  const commentRate = base > 0 ? (comments / base) * 100 : 0
  const interactionRate = base > 0 ? (totalInteractions / base) * 100 : 0

  async function saveActionState() {
    if (!reel) return

    setSavingAction(true)
    setActionSaved(false)

    const { error } = await supabase
      .from('reels')
      .update({
        action_state: actionState,
        score,
      })
      .eq('id', reel.id)

    setSavingAction(false)

    if (error) {
      console.error('Fejl ved gem af action state:', error)
      alert('Kunne ikke gemme action state.')
      return
    }

    setReel((prev) => (prev ? { ...prev, action_state: actionState, score } : prev))
    setActionSaved(true)
    setTimeout(() => setActionSaved(false), 2000)
  }

  async function saveStatus() {
    if (!reel) return

    setSavingStatus(true)
    setStatusSaved(false)

    const updatePayload: {
      status: ReelStatus
      posted_at?: string | null
    } = {
      status,
    }

    if (status === 'posted') {
      updatePayload.posted_at = reel.posted_at || new Date().toISOString()
    }

    if (status !== 'posted') {
      updatePayload.posted_at = null
    }

    const { error } = await supabase
      .from('reels')
      .update(updatePayload)
      .eq('id', reel.id)

    setSavingStatus(false)

    if (error) {
      console.error('Fejl ved gem af status:', error)
      alert('Kunne ikke gemme status.')
      return
    }

    setReel((prev) => (prev ? { ...prev, ...updatePayload } : prev))
    setStatusSaved(true)
    setTimeout(() => setStatusSaved(false), 2000)
  }

  async function saveInstagramLink() {
    if (!reel) return

    setSavingInstagram(true)
    setInstagramSaved(false)

    const trimmedUrl = reelUrl.trim()

    if (!trimmedUrl) {
      const clearPayload = {
        reel_url: null,
        instagram_shortcode: null,
        instagram_media_id: null,
        sync_status: 'not_connected' as SyncStatus,
        last_synced_at: null,
        last_sync_error: null,
        ig_user_id: null,
      }

      const { error } = await supabase
        .from('reels')
        .update(clearPayload)
        .eq('id', reel.id)

      setSavingInstagram(false)

      if (error) {
        console.error('Fejl ved clearing af Instagram-link:', error)
        alert('Kunne ikke rydde Instagram-link.')
        return
      }

      setReel((prev) => (prev ? { ...prev, ...clearPayload } : prev))
      setInstagramReel(null)
      setInstagramSaved(true)
      setTimeout(() => setInstagramSaved(false), 2000)
      return
    }

    const shortcode = extractInstagramShortcode(trimmedUrl)

    if (!shortcode) {
      const invalidPayload = {
        reel_url: trimmedUrl,
        instagram_shortcode: null,
        instagram_media_id: null,
        sync_status: 'error' as SyncStatus,
        last_sync_error: 'Invalid Instagram reel URL',
        ig_user_id: null,
      }

      const { error } = await supabase
        .from('reels')
        .update(invalidPayload)
        .eq('id', reel.id)

      setSavingInstagram(false)

      if (error) {
        console.error('Fejl ved gem af ugyldig Instagram URL:', error)
        alert('Kunne ikke gemme reel-information.')
        return
      }

      setReel((prev) => (prev ? { ...prev, ...invalidPayload } : prev))
      setInstagramReel(null)
      setInstagramSaved(true)
      setTimeout(() => setInstagramSaved(false), 2000)
      return
    }

    let matchedInstagramReel = await tryResolveInstagramByShortcode(shortcode)

    if (!matchedInstagramReel) {
      try {
        await fetch('/api/instagram/sync', { method: 'GET' })
      } catch (syncError) {
        console.error('Fejl ved automatisk sync:', syncError)
      }

      matchedInstagramReel = await tryResolveInstagramByShortcode(shortcode)
    }

    if (!matchedInstagramReel) {
      const pendingPayload = {
        reel_url: trimmedUrl,
        instagram_shortcode: shortcode,
        instagram_media_id: null,
        sync_status: 'pending' as SyncStatus,
        last_sync_error: null,
        ig_user_id: null,
      }

      const { error } = await supabase
        .from('reels')
        .update(pendingPayload)
        .eq('id', reel.id)

      setSavingInstagram(false)

      if (error) {
        console.error('Fejl ved gem af pending Instagram-link:', error)
        alert('Kunne ikke gemme reel-information.')
        return
      }

      setReel((prev) => (prev ? { ...prev, ...pendingPayload } : prev))
      setInstagramReel(null)
      setInstagramSaved(true)
      setTimeout(() => setInstagramSaved(false), 2000)
      return
    }

    const syncedPayload = {
      reel_url: trimmedUrl,
      instagram_shortcode: matchedInstagramReel.shortcode,
      instagram_media_id: matchedInstagramReel.id,
      ig_user_id: matchedInstagramReel.instagram_account_id ?? null,
      sync_status: 'synced' as SyncStatus,
      last_synced_at: matchedInstagramReel.last_synced_at || new Date().toISOString(),
      last_sync_error: null,
    }

    const { error } = await supabase
      .from('reels')
      .update(syncedPayload)
      .eq('id', reel.id)

    setSavingInstagram(false)

    if (error) {
      console.error('Fejl ved gem af synced Instagram-link:', error)
      alert('Kunne ikke gemme reel-information.')
      return
    }

    setReel((prev) => (prev ? { ...prev, ...syncedPayload } : prev))
    setInstagramReel(matchedInstagramReel)
    setInstagramSaved(true)
    setTimeout(() => setInstagramSaved(false), 2000)
  }

  async function analyzeWithAi() {
    if (!reel) return

    setAnalyzingAi(true)
    setAiSaved(false)

    try {
      const res = await fetch('/api/ai/analyze-reel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reelId: reel.id }),
      })

      const json = await res.json()

      setAnalyzingAi(false)

      if (!res.ok || !json?.success) {
        console.error('AI analyze error:', json)
        alert(json?.error || 'Kunne ikke analysere reel med AI.')
        return
      }

      const analysis = json.analysis || {}

      setReel((prev) =>
        prev
          ? {
              ...prev,
              ai_summary: analysis.ai_summary ?? null,
              ai_strengths: normalizeStringArray(analysis.ai_strengths),
              ai_weaknesses: normalizeStringArray(analysis.ai_weaknesses),
              ai_verdict: analysis.ai_verdict ?? null,
              ai_next_move: analysis.ai_next_move ?? null,
              ai_analyzed_at: analysis.ai_analyzed_at ?? new Date().toISOString(),
            }
          : prev
      )

      setAiSaved(true)
      setTimeout(() => setAiSaved(false), 2000)
    } catch (error) {
      setAnalyzingAi(false)
      console.error('AI analyze error:', error)
      alert('Kunne ikke analysere reel med AI.')
    }
  }

  async function generateBodySummary() {
    if (!reel) return

    setGeneratingBodySummary(true)
    setBodySummarySaved(false)

    try {
      const res = await fetch('/api/ai/generate-body-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reelId: reel.id }),
      })

      const json = await res.json()

      setGeneratingBodySummary(false)

      if (!res.ok || !json?.success) {
        console.error('Generate body summary error:', json)
        alert(json?.error || 'Kunne ikke generere body summary.')
        return
      }

      setReel((prev) =>
        prev
          ? {
              ...prev,
              body_summary: json.body_summary ?? prev.body_summary,
            }
          : prev
      )

      setBodySummarySaved(true)
      setTimeout(() => setBodySummarySaved(false), 2000)
    } catch (error) {
      setGeneratingBodySummary(false)
      console.error('Generate body summary error:', error)
      alert('Kunne ikke generere body summary.')
    }
  }

  async function deleteReel() {
    if (!reel) return

    const confirmed = window.confirm(
      'Er du sikker på, at du vil slette denne reel?'
    )

    if (!confirmed) return

    setDeleting(true)

    try {
      const res = await fetch('/api/reels/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: reel.id }),
      })

      const json = await res.json()

      if (!res.ok || !json?.success) {
        console.error('Delete reel error:', json)
        alert(json?.error || 'Kunne ikke slette reel.')
        setDeleting(false)
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch (error) {
      console.error('Delete reel error:', error)
      alert('Kunne ikke slette reel.')
      setDeleting(false)
    }
  }

  if (loading) {
    return <p className="p-8 text-gray-500">Loader...</p>
  }

  if (!reel) {
    return <p className="p-8 text-red-400">Kunne ikke finde reel.</p>
  }

  return (
    <main className="p-8 max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white">
          ← Tilbage til dashboard
        </Link>

        <button
          onClick={deleteReel}
          disabled={deleting}
          className="rounded border border-red-500/40 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
        >
          {deleting ? 'Sletter...' : 'Slet reel'}
        </button>
      </div>

      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">{reel.topic}</h1>
        <p className="text-gray-400 text-lg">
          {reel.hook_type} — {reel.status}
        </p>
      </div>

      {reel.hook_text && (
        <div className="mb-5">
          <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Hook</p>
          <p className="text-base text-gray-300">{reel.hook_text}</p>
        </div>
      )}

      <div className="mb-8 border border-gray-800 rounded p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <p className="text-sm font-bold text-gray-300">Body Summary</p>

          <button
            className="bg-white text-black px-4 py-2 rounded text-sm disabled:opacity-50"
            onClick={generateBodySummary}
            disabled={generatingBodySummary}
          >
            {generatingBodySummary ? 'Genererer...' : 'Generér body summary'}
          </button>
        </div>

        {bodySummarySaved && <p className="text-green-400 text-sm mb-4">✅ Body summary gemt</p>}

        <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">
          {reel.body_summary || 'Ingen body summary endnu.'}
        </pre>

        {reel.script && (
          <div className="mt-6 border border-gray-800 rounded-xl p-4">
            <button
              onClick={() => setShowScript(!showScript)}
              className="text-sm text-gray-400 hover:text-white mb-3"
            >
              {showScript ? 'Skjul script' : 'Vis script'}
            </button>

            {showScript && (
              <pre className="whitespace-pre-wrap text-sm text-gray-300">
                {reel.script}
              </pre>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-8 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <div className="border border-gray-800 rounded p-5">
            <p className="text-sm font-bold mb-4 text-gray-300">Status</p>

            <label className="block text-sm text-gray-400 mb-1">Reel status</label>
            <select
              className="w-full border border-gray-700 p-2 rounded bg-transparent mb-4"
              value={status}
              onChange={(e) => setStatus(e.target.value as ReelStatus)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <div className="text-sm text-gray-400 mb-2">
              Posted at:{' '}
              <span className="text-gray-200">
                {reel.posted_at ? new Date(reel.posted_at).toLocaleString() : '—'}
              </span>
            </div>

            <button
              className="bg-white text-black px-4 py-2 rounded text-sm disabled:opacity-50"
              onClick={saveStatus}
              disabled={savingStatus}
            >
              {savingStatus ? 'Gemmer...' : 'Gem status'}
            </button>

            {statusSaved && <p className="text-green-400 text-sm mt-2">✅ Gemt</p>}
          </div>

          <div className="border border-gray-800 rounded p-5">
            <p className="text-sm font-bold mb-4 text-gray-300">Action</p>

            <label className="block text-sm text-gray-400 mb-1">Action state</label>
            <select
              className="w-full border border-gray-700 p-2 rounded bg-transparent mb-4"
              value={actionState}
              onChange={(e) => setActionState(e.target.value as ActionState)}
            >
              <option value="scale">🚀 Scale</option>
              <option value="repost">🔁 Repost</option>
              <option value="wait">⏳ Wait</option>
              <option value="kill">💀 Kill</option>
            </select>

            <div className="text-sm text-gray-400 mb-2">
              Recommended: <span className="text-gray-200">{ACTION_LABELS[recommendedAction]}</span>
            </div>

            <button
              className="bg-white text-black px-4 py-2 rounded text-sm disabled:opacity-50"
              onClick={saveActionState}
              disabled={savingAction}
            >
              {savingAction ? 'Gemmer...' : 'Gem action'}
            </button>

            {actionSaved && <p className="text-green-400 text-sm mt-2">✅ Gemt</p>}
          </div>

          <div className="border border-gray-800 rounded p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <p className="text-sm font-bold text-gray-300">AI Analyse</p>

              <button
                className="bg-white text-black px-4 py-2 rounded text-sm disabled:opacity-50"
                onClick={analyzeWithAi}
                disabled={analyzingAi}
              >
                {analyzingAi ? 'Analyserer...' : 'Analyser reel med AI'}
              </button>
            </div>

            {aiSaved && <p className="text-green-400 text-sm mb-4">✅ AI-analyse gemt</p>}

            {!reel.ai_summary ? (
              <p className="text-sm text-gray-500">
                Ingen AI-analyse endnu.
              </p>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Summary</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">
                    {reel.ai_summary}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Strengths</p>
                  <ul className="space-y-2">
                    {normalizeStringArray(reel.ai_strengths).map((item, index) => (
                      <li key={index} className="text-sm text-gray-300">
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Weaknesses</p>
                  <ul className="space-y-2">
                    {normalizeStringArray(reel.ai_weaknesses).map((item, index) => (
                      <li key={index} className="text-sm text-gray-300">
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">AI verdict</p>
                  <p className="text-sm text-gray-300">{reel.ai_verdict || '—'}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Next move</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">
                    {reel.ai_next_move || '—'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Analyzed at</p>
                  <p className="text-sm text-gray-300">
                    {reel.ai_analyzed_at ? new Date(reel.ai_analyzed_at).toLocaleString() : '—'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="border border-gray-800 rounded p-5">
            <p className="text-sm font-bold mb-4 text-gray-300">Instagram</p>

            <label className="block text-xs text-gray-500 mb-1">Instagram URL</label>
            <input
              className="w-full border border-gray-700 p-2 mb-4 rounded bg-transparent text-sm"
              placeholder="https://www.instagram.com/reel/..."
              value={reelUrl}
              onChange={(e) => setReelUrl(e.target.value)}
            />

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Sync</span>
                <span className="text-gray-300">
                  {SYNC_LABELS[(reel.sync_status as SyncStatus) || 'not_connected']}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Shortcode</span>
                <span className="text-gray-300 break-all text-right">
                  {reel.instagram_shortcode || '—'}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Instagram media id</span>
                <span className="text-gray-300 break-all text-right">
                  {reel.instagram_media_id || '—'}
                </span>
              </div>

              {reel.last_synced_at && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">Last synced</span>
                  <span className="text-gray-300 text-right">
                    {new Date(reel.last_synced_at).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {reel.last_sync_error && (
              <p className="text-xs text-red-400 mb-4">{reel.last_sync_error}</p>
            )}

            <button
              className="bg-white text-black px-4 py-2 rounded text-sm disabled:opacity-50"
              onClick={saveInstagramLink}
              disabled={savingInstagram}
            >
              {savingInstagram ? 'Gemmer...' : 'Gem Instagram-link'}
            </button>

            {instagramSaved && <p className="text-green-400 text-sm mt-2">✅ Gemt</p>}
          </div>
        </div>

        <div className="space-y-6">
          <div className="border border-gray-800 rounded p-5">
            <p className="text-sm font-bold mb-4 text-gray-300">Performance</p>

            {!instagramReel ? (
              <p className="text-sm text-gray-500">
                Ingen linked Instagram reel endnu.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Metric label="Views" value={formatNumber(views)} />
                  <Metric label="Reach" value={formatNumber(reach)} />
                  <Metric label="Saved" value={formatNumber(saved)} sub={formatPct(saveRate)} />
                  <Metric label="Shares" value={formatNumber(shares)} sub={formatPct(shareRate)} />
                  <Metric label="Likes" value={formatNumber(likes)} sub={formatPct(likeRate)} />
                  <Metric label="Comments" value={formatNumber(comments)} sub={formatPct(commentRate)} />
                  <Metric
                    label="Interactions"
                    value={formatNumber(totalInteractions)}
                    sub={formatPct(interactionRate)}
                  />
                  <Metric
                    label="Posted"
                    value={
                      instagramReel.timestamp
                        ? new Date(instagramReel.timestamp).toLocaleDateString()
                        : '—'
                    }
                  />
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">Permalink</span>
                    {instagramReel.permalink ? (
                      <a
                        href={instagramReel.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline break-all text-right"
                      >
                        Åbn reel
                      </a>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>

                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">Caption</span>
                    <span className="text-gray-300 break-all text-right max-w-[60%]">
                      {instagramReel.caption || '—'}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="border border-gray-800 rounded p-5">
            <p className="text-sm font-bold mb-4 text-gray-300">Score</p>
            <p className="text-4xl font-bold mb-2">{score}</p>
            <p className="text-gray-400">{ACTION_LABELS[recommendedAction]}</p>
          </div>
        </div>
      </div>
    </main>
  )
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="border border-gray-800 rounded p-3">
      <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">{label}</p>
      <p className="text-lg text-gray-100">{value}</p>
      {sub ? <p className="text-xs text-gray-500 mt-1">{sub}</p> : null}
    </div>
  )
}