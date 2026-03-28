'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function OpretReel() {
  const [topic, setTopic] = useState('')
  const [hookType, setHookType] = useState('curiosity')
  const [hookText, setHookText] = useState('')
  const [bodySummary, setBodySummary] = useState('')

  async function gem() {
    const { error } = await supabase.from('reels').insert({
      topic,
      hook_type: hookType,
      hook_text: hookText,
      body_summary: bodySummary,
      status: 'draft',
      action_state: 'wait',
      sync_status: 'not_connected',
    })

    if (error) {
      console.error('Supabase error:', error)
      alert('Noget gik galt. Prøv igen.')
      return
    }

    // reset form efter succes
    setTopic('')
    setHookType('curiosity')
    setHookText('')
    setBodySummary('')

    alert('Reel gemt!')
  }

  return (
    <main className="p-8 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Opret Reel</h1>

      <label className="block text-sm mb-1 text-gray-400">Topic</label>
      <input
        className="w-full border border-gray-700 p-2 mb-4 rounded bg-transparent"
        placeholder="Topic"
        value={topic}
        onChange={e => setTopic(e.target.value)}
      />

      <label className="block text-sm mb-1 text-gray-400">Hook type</label>
      <select
        className="w-full border border-gray-700 p-2 mb-4 rounded bg-transparent"
        value={hookType}
        onChange={e => setHookType(e.target.value)}
      >
        <option value="curiosity">Curiosity</option>
        <option value="bold_claim">Bold Claim</option>
        <option value="question">Question</option>
        <option value="story">Story</option>
        <option value="contrast">Contrast</option>
      </select>

      <label className="block text-sm mb-1 text-gray-400">Hook</label>
      <textarea
        className="w-full border border-gray-700 p-2 mb-4 rounded bg-transparent"
        placeholder="Hook tekst"
        value={hookText}
        onChange={e => setHookText(e.target.value)}
      />

      <label className="block text-sm mb-1 text-gray-400">Summary</label>
      <textarea
        className="w-full border border-gray-700 p-2 mb-6 rounded bg-transparent"
        placeholder="Kort beskrivelse af reelens indhold"
        value={bodySummary}
        onChange={e => setBodySummary(e.target.value)}
      />

      <button
        className="bg-white text-black px-4 py-2 rounded"
        onClick={gem}
      >
        Gem reel
      </button>
    </main>
  )
}