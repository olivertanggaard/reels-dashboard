'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function OpretReel() {
  const [topic, setTopic] = useState('')
  const [hookType, setHookType] = useState('curiosity')
  const [hookText, setHookText] = useState('')

  async function gem() {
    await supabase.from('reels').insert({ topic, hook_type: hookType, hook_text: hookText })
    alert('Reel gemt!')
  }

  return (
    <main className="p-8 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Opret Reel</h1>
      <input className="w-full border p-2 mb-4 rounded bg-transparent" placeholder="Topic" value={topic} onChange={e => setTopic(e.target.value)} />
      <select className="w-full border p-2 mb-4 rounded bg-transparent" value={hookType} onChange={e => setHookType(e.target.value)}>
        <option value="curiosity">Curiosity</option>
        <option value="bold_claim">Bold Claim</option>
        <option value="question">Question</option>
        <option value="story">Story</option>
        <option value="contrast">Contrast</option>
      </select>
      <textarea className="w-full border p-2 mb-4 rounded bg-transparent" placeholder="Hook tekst" value={hookText} onChange={e => setHookText(e.target.value)} />
      <button className="bg-white text-black px-4 py-2 rounded" onClick={gem}>Gem reel</button>
    </main>
  )
}