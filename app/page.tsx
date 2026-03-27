import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default async function Home() {
  const { data: reels } = await supabase.from('reels').select('*')

  return (
    <main className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Reels Dashboard</h1>
        <Link href="/opret" className="bg-white text-black px-4 py-2 rounded text-sm">+ Opret reel</Link>
      </div>
      {reels?.length === 0 && <p>Ingen reels endnu.</p>}
      {reels?.map(reel => (
        <Link key={reel.id} href={`/reel/${reel.id}`}>
          <div className="border p-4 mb-2 rounded hover:border-white cursor-pointer">
            <p className="font-bold">{reel.topic}</p>
            <p className="text-sm text-gray-500">{reel.hook_type} — {reel.status}</p>
          </div>
        </Link>
      ))}
    </main>
  )
}