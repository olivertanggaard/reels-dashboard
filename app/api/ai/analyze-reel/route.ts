import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function calculateScore(instagramReel: any | null): number {
  if (!instagramReel) return 0

  const views = num(instagramReel.views)
  const reach = num(instagramReel.reach)
  const saved = num(instagramReel.saved)
  const shares = num(instagramReel.shares)
  const likes = num(instagramReel.like_count)
  const comments = num(instagramReel.comments_count)
  const totalInteractions = num(instagramReel.total_interactions)

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

function getRecommendedAction(score: number): 'scale' | 'repost' | 'wait' | 'kill' {
  if (score >= 70) return 'scale'
  if (score >= 45) return 'repost'
  if (score >= 25) return 'wait'
  return 'kill'
}

export async function POST(req: Request) {
  try {
    const { reelId } = await req.json()

    if (!reelId) {
      return NextResponse.json({ error: 'Missing reelId' }, { status: 400 })
    }

    const { data: reel, error: reelError } = await supabase
      .from('reels')
      .select('*')
      .eq('id', reelId)
      .single()

    if (reelError || !reel) {
      return NextResponse.json({ error: 'Reel not found' }, { status: 404 })
    }

    let instagramReel: any = null

    if (reel.instagram_media_id) {
      const { data: igData } = await supabase
        .from('instagram_reels')
        .select('*')
        .eq('id', reel.instagram_media_id)
        .single()

      instagramReel = igData || null
    }

    const score = calculateScore(instagramReel)
    const recommendedAction = getRecommendedAction(score)

    const views = num(instagramReel?.views)
    const reach = num(instagramReel?.reach)
    const saved = num(instagramReel?.saved)
    const shares = num(instagramReel?.shares)
    const likes = num(instagramReel?.like_count)
    const comments = num(instagramReel?.comments_count)
    const totalInteractions = num(instagramReel?.total_interactions)

    const prompt = `
Du analyserer performance på én Instagram reel for en mindre creator account.

Vigtig kontekst:
- 2.000 til 5.000 views kan være en god reel på denne konto.
- Du må ikke vurdere den som om det er en stor profil.
- Fokusér på relativ performance, hook, topic, engagementkvalitet og næste iteration.

Reel data:
- topic: ${reel.topic ?? ''}
- hook_type: ${reel.hook_type ?? ''}
- hook_text: ${reel.hook_text ?? ''}
- body_summary: ${reel.body_summary ?? ''}
- status: ${reel.status ?? ''}
- sync_status: ${reel.sync_status ?? ''}
- reel_url: ${reel.reel_url ?? ''}

Performance:
- views: ${views}
- reach: ${reach}
- saves: ${saved}
- shares: ${shares}
- likes: ${likes}
- comments: ${comments}
- total_interactions: ${totalInteractions}
- internal_score: ${score}
- recommended_action: ${recommendedAction}

Returnér KUN valid JSON i dette format:
{
  "summary": "kort analyse",
  "strengths": ["styrke 1", "styrke 2", "styrke 3"],
  "weaknesses": ["svaghed 1", "svaghed 2", "svaghed 3"],
  "verdict": "scale | repost | wait | kill",
  "next_move": "helt konkret næste move"
}
`.trim()

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      input: prompt,
    })

    const text = response.output_text

    if (!text) {
      return NextResponse.json({ error: 'No AI output returned' }, { status: 500 })
    }

    let parsed: any

    try {
      parsed = JSON.parse(text)
    } catch {
      return NextResponse.json(
        {
          error: 'AI returned invalid JSON',
          raw: text,
        },
        { status: 500 }
      )
    }

    const updatePayload = {
      ai_summary: parsed.summary ?? null,
      ai_strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      ai_weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      ai_verdict: parsed.verdict ?? null,
      ai_next_move: parsed.next_move ?? null,
      ai_analyzed_at: new Date().toISOString(),
    }

    const { error: updateError } = await supabase
      .from('reels')
      .update(updatePayload)
      .eq('id', reelId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      score,
      recommendedAction,
      analysis: updatePayload,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}