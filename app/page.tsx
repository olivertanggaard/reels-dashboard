export const dynamic = 'force-dynamic'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const HOOK_TYPES = ['alle', 'curiosity', 'bold_claim', 'question', 'story', 'contrast']

export default async function Home({ searchParams }: { searchParams: Promise<{ hook?: string }> }) {
  const { hook } = await searchParams
  const aktiv = hook || 'alle'

  let query = supabase.from('reels').select('*').order('created_at', { ascending: false })
  if (aktiv !== 'alle') query = query.eq('hook_type', aktiv)

  const { data: reels } = await query

  return (
    <main className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Reels Dashboard</h1>
        <Link href="/opret" className="bg-white text-black px-4 py-2 rounded text-sm">+ Opret reel</Link>
      </div>

      <div className="flex gap-4 mb-6 border-b border-gray-800 pb-3">
        {HOOK_TYPES.map(hook => (
          <Link
            key={hook}
            href={`/?hook=${hook}`}
            className={`text-sm capitalize pb-2 ${aktiv === hook ? 'border-b-2 border-white font-bold' : 'text-gray-500'}`}
          >
            {hook.replace('_', ' ')}
          </Link>
        ))}
      </div>

      {reels?.length === 0 && <p className="text-gray-500">Ingen reels endnu.</p>}
      {reels?.map(reel => (
        <Link key={reel.id} href={`/reel/${reel.id}`}>
          <div className="border border-gray-800 p-4 mb-2 rounded hover:border-white cursor-pointer">
            <p className="font-bold">{reel.topic}</p>
            <p className="text-sm text-gray-500">{reel.hook_type} — {reel.status}</p>
          </div>
        </Link>
      ))}
    </main>
  )
}