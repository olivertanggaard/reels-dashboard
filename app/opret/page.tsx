'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function OpretReel() {
  const [topic, setTopic] = useState('')
  const [hookType, setHookType] = useState('curiosity')
  const [hookText, setHookText] = useState('')
  const [script, setScript] = useState('')
  const [bodySummary, setBodySummary] = useState('')
  const [reelUrl, setReelUrl] = useState('')

  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  async function generateBodySummary() {
    if (!script.trim() && !hookText.trim()) {
      alert('Tilføj enten script eller hook først.')
      return
    }

    setGenerating(true)

    try {
      const res = await fetch('/api/ai/generate-body-summary-from-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          hook_type: hookType,
          hook_text: hookText,
          script,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data?.error || 'AI fejl')
      }

      setBodySummary(data.body_summary || '')
    } catch (err) {
      console.error(err)
      alert('Kunne ikke generere body summary.')
    } finally {
      setGenerating(false)
    }
  }

  async function saveReel() {
    if (!topic.trim() || !hookText.trim()) {
      alert('Topic og hook er påkrævet.')
      return
    }

    setSaving(true)

    try {
      const res = await fetch('/api/reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          hook_type: hookType,
          hook_text: hookText,
          body_summary: bodySummary,
          reel_url: reelUrl,
          script,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data?.error || 'Kunne ikke gemme reel')
      }

      alert('Reel gemt!')

      setTopic('')
      setHookType('curiosity')
      setHookText('')
      setScript('')
      setBodySummary('')
      setReelUrl('')
    } catch (err) {
      console.error(err)
      alert('Fejl ved oprettelse')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white">
          ← Tilbage til dashboard
        </Link>

        <div className="mt-8 border border-gray-800 rounded-2xl bg-zinc-950 p-6">
          <h1 className="text-3xl font-bold mb-8">Opret reel</h1>

          <input
            className="w-full border border-gray-700 p-3 mb-6 rounded bg-transparent"
            placeholder="Topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />

          <select
            className="w-full border border-gray-700 p-3 mb-6 rounded bg-transparent"
            value={hookType}
            onChange={(e) => setHookType(e.target.value)}
          >
            <option value="curiosity">Curiosity</option>
            <option value="bold_claim">Bold Claim</option>
            <option value="question">Question</option>
            <option value="story">Story</option>
            <option value="contrast">Contrast</option>
          </select>

          <textarea
            className="w-full border border-gray-700 p-3 mb-6 rounded bg-transparent"
            placeholder="Hook"
            value={hookText}
            onChange={(e) => setHookText(e.target.value)}
          />

          {/* 🔥 SCRIPT */}
          <div className="mb-6">
            <label className="text-sm text-gray-400 mb-2 block">Script (valgfri)</label>
            <textarea
              className="w-full border border-gray-700 p-3 rounded bg-transparent min-h-[180px] whitespace-pre-wrap"
              placeholder="Indsæt hele reel script her..."
              value={script}
              onChange={(e) => setScript(e.target.value)}
            />
          </div>

          <input
            className="w-full border border-gray-700 p-3 mb-6 rounded bg-transparent"
            placeholder="Reel URL (valgfri)"
            value={reelUrl}
            onChange={(e) => setReelUrl(e.target.value)}
          />

          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">Body summary</label>

            <button
              onClick={generateBodySummary}
              disabled={generating}
              className="bg-white text-black px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              {generating ? 'Genererer...' : 'Generér'}
            </button>
          </div>

          <textarea
            className="w-full border border-gray-700 p-3 mb-6 rounded bg-transparent min-h-[200px] whitespace-pre-wrap"
            value={bodySummary}
            onChange={(e) => setBodySummary(e.target.value)}
          />

          <button
            onClick={saveReel}
            disabled={saving}
            className="bg-white text-black px-5 py-3 rounded disabled:opacity-50"
          >
            {saving ? 'Gemmer...' : 'Gem reel'}
          </button>
        </div>
      </div>
    </main>
  )
}