import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type ActionState = 'scale' | 'repost' | 'wait' | 'kill'

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

function getRecommendedAction(score: number): ActionState {
  if (score >= 70) return 'scale'
  if (score >= 45) return 'repost'
  if (score >= 25) return 'wait'
  return 'kill'
}

export async function GET() {
  try {
    const { data: reels, error: reelsError } = await supabase
      .from('reels')
      .select(`
        id,
        created_at,
        topic,
        hook_type,
        hook_text,
        body_summary,
        script,
        posted_at,
        status,
        action_state,
        sync_status,
        last_synced_at,
        reel_url,
        instagram_shortcode,
        instagram_media_id,
        ig_user_id,
        last_sync_error,
        score,
        deleted_at,
        ai_summary,
        ai_strengths,
        ai_weaknesses,
        ai_verdict,
        ai_next_move,
        ai_analyzed_at
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (reelsError) {
      return NextResponse.json(
        { success: false, error: reelsError.message },
        { status: 500 }
      )
    }

    const instagramMediaIds = (reels ?? [])
      .map((reel) => reel.instagram_media_id)
      .filter((id): id is string => Boolean(id))

    let instagramReelsById = new Map<string, any>()

    if (instagramMediaIds.length > 0) {
      const { data: instagramReels, error: instagramError } = await supabase
        .from('instagram_reels')
        .select(`
          id,
          shortcode,
          caption,
          permalink,
          thumbnail_url,
          media_url,
          media_type,
          media_product_type,
          timestamp,
          views,
          reach,
          saved,
          shares,
          like_count,
          comments_count,
          total_interactions,
          last_synced_at
        `)
        .in('id', instagramMediaIds)

      if (instagramError) {
        return NextResponse.json(
          { success: false, error: instagramError.message },
          { status: 500 }
        )
      }

      instagramReelsById = new Map(
        (instagramReels ?? []).map((item) => [item.id, item])
      )
    }

    const merged = (reels ?? []).map((reel) => {
      const instagramReel = reel.instagram_media_id
        ? instagramReelsById.get(reel.instagram_media_id) ?? null
        : null

      const calculatedScore = calculateScore(instagramReel)
      const recommendedAction = getRecommendedAction(calculatedScore)

      return {
        ...reel,
        instagram_reel: instagramReel,
        calculated_score: calculatedScore,
        recommended_action: recommendedAction,
      }
    })

    return NextResponse.json({
      success: true,
      count: merged.length,
      data: merged,
    })
  } catch (error) {
    console.error('api/reels GET error:', error)

    return NextResponse.json(
      { success: false, error: 'Something went wrong' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const topic = typeof body?.topic === 'string' ? body.topic.trim() : ''
    const hook_type = typeof body?.hook_type === 'string' ? body.hook_type.trim() : ''
    const hook_text = typeof body?.hook_text === 'string' ? body.hook_text.trim() : ''
    const body_summary =
      typeof body?.body_summary === 'string' && body.body_summary.trim()
        ? body.body_summary.trim()
        : null
    const reel_url =
      typeof body?.reel_url === 'string' && body.reel_url.trim()
        ? body.reel_url.trim()
        : null
    const script =
      typeof body?.script === 'string' && body.script.trim()
        ? body.script.trim()
        : null

    if (!topic || !hook_type || !hook_text) {
      return NextResponse.json(
        { success: false, error: 'Missing topic, hook_type or hook_text' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('reels')
      .insert({
        topic,
        hook_type,
        hook_text,
        body_summary,
        reel_url,
        script,
        status: 'draft',
        action_state: 'wait',
        sync_status: reel_url ? 'pending' : 'not_connected',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      reel: data,
    })
  } catch (error) {
    console.error('api/reels POST error:', error)

    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    )
  }
}