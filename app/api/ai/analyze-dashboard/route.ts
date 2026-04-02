import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type ActionState = 'scale' | 'repost' | 'wait' | 'kill'

type DashboardAnalysis = {
  summary: string
  winning_patterns: string[]
  losing_patterns: string[]
  best_hook_types: string[]
  weakest_hook_types: string[]
  best_topics: string[]
  weakest_topics: string[]
  repost_candidates: string[]
  kill_candidates: string[]
  next_content_ideas: string[]
  strategic_recommendations: string[]
}

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

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function extractOutputText(response: any): string {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim()
  }

  const parts: string[] = []

  if (Array.isArray(response?.output)) {
    for (const item of response.output) {
      if (!Array.isArray(item?.content)) continue

      for (const contentItem of item.content) {
        if (contentItem?.type === 'output_text' && typeof contentItem?.text === 'string') {
          parts.push(contentItem.text)
        }
      }
    }
  }

  return parts.join('\n').trim()
}

async function buildMergedDataset() {
  const { data: reels, error: reelsError } = await supabase
    .from('reels')
    .select(`
      id,
      created_at,
      topic,
      hook_type,
      hook_text,
      body_summary,
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
      ai_summary,
      ai_strengths,
      ai_weaknesses,
      ai_verdict,
      ai_next_move,
      ai_analyzed_at,
      deleted_at
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (reelsError) {
    throw new Error(reelsError.message)
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
      throw new Error(instagramError.message)
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

    const views = num(instagramReel?.views)
    const reach = num(instagramReel?.reach)
    const saved = num(instagramReel?.saved)
    const shares = num(instagramReel?.shares)
    const likes = num(instagramReel?.like_count)
    const comments = num(instagramReel?.comments_count)
    const totalInteractions = num(instagramReel?.total_interactions)

    const base = reach > 0 ? reach : views

    return {
      id: reel.id,
      topic: reel.topic ?? '',
      hook_type: reel.hook_type ?? '',
      hook_text: reel.hook_text ?? '',
      body_summary: reel.body_summary ?? '',
      status: reel.status ?? '',
      action_state: reel.action_state ?? '',
      sync_status: reel.sync_status ?? '',
      posted_at: reel.posted_at ?? null,
      created_at: reel.created_at ?? null,
      reel_url: reel.reel_url ?? null,
      instagram_shortcode: reel.instagram_shortcode ?? null,
      instagram_media_id: reel.instagram_media_id ?? null,
      ai_summary: reel.ai_summary ?? null,
      ai_strengths: normalizeStringArray(reel.ai_strengths),
      ai_weaknesses: normalizeStringArray(reel.ai_weaknesses),
      ai_verdict: reel.ai_verdict ?? null,
      ai_next_move: reel.ai_next_move ?? null,
      ai_analyzed_at: reel.ai_analyzed_at ?? null,

      views,
      reach,
      saved,
      shares,
      likes,
      comments,
      total_interactions: totalInteractions,
      save_rate_pct: base > 0 ? Number(((saved / base) * 100).toFixed(2)) : 0,
      share_rate_pct: base > 0 ? Number(((shares / base) * 100).toFixed(2)) : 0,
      like_rate_pct: base > 0 ? Number(((likes / base) * 100).toFixed(2)) : 0,
      comment_rate_pct: base > 0 ? Number(((comments / base) * 100).toFixed(2)) : 0,
      interaction_rate_pct: base > 0 ? Number(((totalInteractions / base) * 100).toFixed(2)) : 0,

      calculated_score: calculatedScore,
      recommended_action: recommendedAction,
    }
  })

  const syncedReels = merged.filter((reel) => reel.instagram_media_id)
  const avgScore =
    merged.length > 0
      ? Number(
          (
            merged.reduce((sum, reel) => sum + reel.calculated_score, 0) /
            merged.length
          ).toFixed(2)
        )
      : 0

  const topReels = [...merged]
    .sort((a, b) => b.calculated_score - a.calculated_score)
    .slice(0, 8)

  const bottomReels = [...merged]
    .sort((a, b) => a.calculated_score - b.calculated_score)
    .slice(0, 8)

  return {
    merged,
    syncedReels,
    avgScore,
    topReels,
    bottomReels,
  }
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('dashboard_analyses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json({
        success: true,
        analysis: null,
      })
    }

    const analysis: DashboardAnalysis = {
      summary: data.summary ?? '',
      winning_patterns: normalizeStringArray(data.winning_patterns),
      losing_patterns: normalizeStringArray(data.losing_patterns),
      best_hook_types: normalizeStringArray(data.best_hook_types),
      weakest_hook_types: normalizeStringArray(data.weakest_hook_types),
      best_topics: normalizeStringArray(data.best_topics),
      weakest_topics: normalizeStringArray(data.weakest_topics),
      repost_candidates: normalizeStringArray(data.repost_candidates),
      kill_candidates: normalizeStringArray(data.kill_candidates),
      next_content_ideas: normalizeStringArray(data.next_content_ideas),
      strategic_recommendations: normalizeStringArray(data.strategic_recommendations),
    }

    return NextResponse.json({
      success: true,
      analysis,
      meta: {
        id: data.id,
        created_at: data.created_at,
        dataset_total_reels: data.dataset_total_reels,
        dataset_synced_reels: data.dataset_synced_reels,
        avg_score: data.avg_score,
      },
    })
  } catch (error) {
    console.error('analyze-dashboard GET error:', error)

    return NextResponse.json(
      { success: false, error: 'Something went wrong' },
      { status: 500 }
    )
  }
}

export async function POST(_req: NextRequest) {
  try {
    const { merged, syncedReels, avgScore, topReels, bottomReels } =
      await buildMergedDataset()

    const payloadForAi = {
      account_context: {
        description: 'Smaller creator account in sales/business content',
        view_benchmark: 'Around 2,000 to 5,000 views can be considered solid',
        judging_rule: 'Do not evaluate by large creator standards',
      },
      summary: {
        total_reels: merged.length,
        synced_reels: syncedReels.length,
        avg_score: avgScore,
      },
      reels: merged,
      top_reels: topReels,
      bottom_reels: bottomReels,
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: `
You are a content strategist analyzing an Instagram Reels dashboard for a smaller sales/business creator.

Your job:
- Find patterns in what performs well and badly
- Distinguish between strong resonance and weak resonance
- Distinguish between raw distribution and actual engagement quality
- Use BOTH metrics and structured body summaries
- Be concrete, not generic
- Do not judge like a big creator brand
- Around 2,000 to 5,000 views can be considered solid on this account

Return only valid JSON matching the schema.
          `.trim(),
        },
        {
          role: 'user',
          content: JSON.stringify(payloadForAi),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'dashboard_analysis_schema',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              summary: { type: 'string' },
              winning_patterns: { type: 'array', items: { type: 'string' } },
              losing_patterns: { type: 'array', items: { type: 'string' } },
              best_hook_types: { type: 'array', items: { type: 'string' } },
              weakest_hook_types: { type: 'array', items: { type: 'string' } },
              best_topics: { type: 'array', items: { type: 'string' } },
              weakest_topics: { type: 'array', items: { type: 'string' } },
              repost_candidates: { type: 'array', items: { type: 'string' } },
              kill_candidates: { type: 'array', items: { type: 'string' } },
              next_content_ideas: { type: 'array', items: { type: 'string' } },
              strategic_recommendations: { type: 'array', items: { type: 'string' } },
            },
            required: [
              'summary',
              'winning_patterns',
              'losing_patterns',
              'best_hook_types',
              'weakest_hook_types',
              'best_topics',
              'weakest_topics',
              'repost_candidates',
              'kill_candidates',
              'next_content_ideas',
              'strategic_recommendations',
            ],
          },
          strict: true,
        },
      },
    })

    const outputText = extractOutputText(response)

    if (!outputText) {
      return NextResponse.json(
        { success: false, error: 'No output from OpenAI' },
        { status: 500 }
      )
    }

    let parsed: DashboardAnalysis

    try {
      parsed = JSON.parse(outputText)
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON returned from OpenAI',
          raw: outputText,
        },
        { status: 500 }
      )
    }

    const insertPayload = {
      summary: parsed.summary,
      winning_patterns: parsed.winning_patterns,
      losing_patterns: parsed.losing_patterns,
      best_hook_types: parsed.best_hook_types,
      weakest_hook_types: parsed.weakest_hook_types,
      best_topics: parsed.best_topics,
      weakest_topics: parsed.weakest_topics,
      repost_candidates: parsed.repost_candidates,
      kill_candidates: parsed.kill_candidates,
      next_content_ideas: parsed.next_content_ideas,
      strategic_recommendations: parsed.strategic_recommendations,
      dataset_total_reels: merged.length,
      dataset_synced_reels: syncedReels.length,
      avg_score: avgScore,
    }

    const { data: savedAnalysis, error: saveError } = await supabase
      .from('dashboard_analyses')
      .insert(insertPayload)
      .select('*')
      .single()

    if (saveError) {
      return NextResponse.json(
        { success: false, error: saveError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      analysis: parsed,
      meta: {
        id: savedAnalysis.id,
        created_at: savedAnalysis.created_at,
        dataset_total_reels: savedAnalysis.dataset_total_reels,
        dataset_synced_reels: savedAnalysis.dataset_synced_reels,
        avg_score: savedAnalysis.avg_score,
      },
    })
  } catch (error) {
    console.error('analyze-dashboard POST error:', error)

    return NextResponse.json(
      { success: false, error: 'Something went wrong' },
      { status: 500 }
    )
  }
}