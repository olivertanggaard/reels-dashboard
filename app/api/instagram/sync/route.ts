import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN

const GRAPH_BASE = 'https://graph.facebook.com/v23.0'

type GraphPage = {
  id: string
  name?: string
  instagram_business_account?: {
    id: string
  }
}

type GraphMedia = {
  id: string
  caption?: string
  media_product_type?: string
  media_type?: string
  media_url?: string
  permalink?: string
  shortcode?: string
  thumbnail_url?: string
  timestamp?: string
}

type InsightValue = {
  name: string
  values?: Array<{ value: number }>
}

function jsonError(message: string, extra: Record<string, unknown> = {}, status = 500) {
  return NextResponse.json(
    { success: false, error: message, ...extra },
    { status }
  )
}

async function graphFetch<T>(url: string) {
  const res = await fetch(url, { cache: 'no-store' })
  const json = await res.json()

  if (!res.ok || json?.error) {
    return {
      ok: false as const,
      status: res.status,
      json,
    }
  }

  return {
    ok: true as const,
    status: res.status,
    json: json as T,
  }
}

async function getPages() {
  const url = `${GRAPH_BASE}/me/accounts?access_token=${META_ACCESS_TOKEN}`

  return graphFetch<{ data: GraphPage[] }>(url)
}

async function getInstagramBusinessAccount(pageId: string) {
  const url =
    `${GRAPH_BASE}/${pageId}` +
    `?fields=instagram_business_account{id}` +
    `&access_token=${META_ACCESS_TOKEN}`

  return graphFetch<GraphPage>(url)
}

async function getAllMedia(igUserId: string, maxPages: number) {
  let nextUrl =
    `${GRAPH_BASE}/${igUserId}/media` +
    `?fields=id,caption,media_product_type,media_type,media_url,permalink,shortcode,thumbnail_url,timestamp` +
    `&limit=50` +
    `&access_token=${META_ACCESS_TOKEN}`

  const allMedia: GraphMedia[] = []
  let pagesFetched = 0

  while (nextUrl && pagesFetched < maxPages) {
    const result = await graphFetch<{
      data: GraphMedia[]
      paging?: { next?: string }
    }>(nextUrl)

    if (!result.ok) {
      return {
        ok: false as const,
        error: result.json,
        pagesFetched,
        mediaFetched: allMedia.length,
      }
    }

    allMedia.push(...(result.json.data || []))
    nextUrl = result.json.paging?.next || ''
    pagesFetched += 1
  }

  return {
    ok: true as const,
    data: allMedia,
    pagesFetched,
  }
}

async function getMediaInsights(mediaId: string) {
  const url =
    `${GRAPH_BASE}/${mediaId}/insights` +
    `?metric=views,reach,saved,shares,total_interactions,likes,comments` +
    `&access_token=${META_ACCESS_TOKEN}`

  const result = await graphFetch<{ data: InsightValue[] }>(url)

  if (!result.ok) {
    return {
      ok: false as const,
      error: result.json,
    }
  }

  const map = new Map<string, number>()

  for (const row of result.json.data || []) {
    const value = row.values?.[0]?.value
    if (typeof value === 'number') {
      map.set(row.name, value)
    }
  }

  return {
    ok: true as const,
    data: {
      views: map.get('views') ?? 0,
      reach: map.get('reach') ?? 0,
      saved: map.get('saved') ?? 0,
      shares: map.get('shares') ?? 0,
      total_interactions: map.get('total_interactions') ?? 0,
      like_count: map.get('likes') ?? 0,
      comments_count: map.get('comments') ?? 0,
    },
  }
}

export async function GET(req: NextRequest) {
  if (!META_ACCESS_TOKEN) {
    return jsonError('Missing META_ACCESS_TOKEN', {}, 500)
  }

  const searchParams = req.nextUrl.searchParams
  const maxPages = Number(searchParams.get('pages') || '10')
  const includeInsights = searchParams.get('insights') !== 'false'

  const pagesResult = await getPages()

  if (!pagesResult.ok) {
    return jsonError(
      'Could not fetch Facebook pages',
      { pagesData: pagesResult.json },
      500
    )
  }

  const pages = pagesResult.json.data || []
  if (pages.length === 0) {
    return jsonError('No Facebook pages found for this token', {}, 404)
  }

  let pageId: string | null = null
  let igUserId: string | null = null
  let igLookupRaw: unknown = null

  for (const page of pages) {
    const pageLookup = await getInstagramBusinessAccount(page.id)
    igLookupRaw = pageLookup.json

    if (!pageLookup.ok) {
      return jsonError(
        'Could not fetch Instagram business account from page',
        {
          page_id: page.id,
          igData: pageLookup.json,
        },
        500
      )
    }

    const accountId = pageLookup.json.instagram_business_account?.id
    if (accountId) {
      pageId = page.id
      igUserId = accountId
      break
    }
  }

  if (!pageId || !igUserId) {
    return jsonError(
      'No Instagram account connected',
      {
        page_id: pages[0]?.id ?? null,
        igData: igLookupRaw,
      },
      404
    )
  }

  const mediaResult = await getAllMedia(igUserId, maxPages)

  if (!mediaResult.ok) {
    return jsonError(
      'Could not fetch Instagram media',
      {
        page_id: pageId,
        ig_user_id: igUserId,
        details: mediaResult.error,
        pages_fetched: mediaResult.pagesFetched,
        media_fetched: mediaResult.mediaFetched,
      },
      500
    )
  }

  const nowIso = new Date().toISOString()
  const rows = []

  for (const media of mediaResult.data) {
    if (media.media_product_type !== 'REELS') continue

    let insightPayload = {
      views: 0,
      reach: 0,
      saved: 0,
      shares: 0,
      total_interactions: 0,
      like_count: 0,
      comments_count: 0,
    }

    let insightError: unknown = null

    if (includeInsights) {
      const insightResult = await getMediaInsights(media.id)

      if (insightResult.ok) {
        insightPayload = insightResult.data
      } else {
        insightError = insightResult.error
      }
    }

    rows.push({
      id: media.id,
      instagram_account_id: igUserId,
      shortcode: media.shortcode ?? null,
      caption: media.caption ?? null,
      permalink: media.permalink ?? null,
      thumbnail_url: media.thumbnail_url ?? null,
      media_url: media.media_url ?? null,
      media_type: media.media_type ?? null,
      media_product_type: media.media_product_type ?? null,
      timestamp: media.timestamp ?? null,
      views: insightPayload.views,
      reach: insightPayload.reach,
      saved: insightPayload.saved,
      shares: insightPayload.shares,
      total_interactions: insightPayload.total_interactions,
      like_count: insightPayload.like_count,
      comments_count: insightPayload.comments_count,
      last_synced_at: nowIso,
      updated_at: nowIso,
      raw_json: {
        media,
        insights: includeInsights ? insightPayload : null,
        insight_error: insightError,
      },
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'Sync completed, but no reels were returned',
      page_id: pageId,
      ig_user_id: igUserId,
      pages_fetched: mediaResult.pagesFetched,
      inserted_or_updated: 0,
    })
  }

  const { data: upserted, error: upsertError } = await supabase
    .from('instagram_reels')
    .upsert(rows, { onConflict: 'id' })
    .select('id, shortcode')

  if (upsertError) {
    return jsonError(
      'Could not upsert instagram_reels',
      {
        details: upsertError.message,
      },
      500
    )
  }

  const successfulRows = rows.filter((row: any) => row.shortcode)

  for (const row of successfulRows) {
    const { error: linkError } = await supabase
      .from('reels')
      .update({
        instagram_media_id: row.id,
        instagram_shortcode: row.shortcode,
        ig_user_id: row.instagram_account_id,
        sync_status: 'synced',
        last_synced_at: row.last_synced_at,
        last_sync_error: null,
      })
      .eq('instagram_shortcode', row.shortcode)

    if (linkError) {
      console.error(
        `Fejl ved linking af reel med shortcode ${row.shortcode}:`,
        linkError
      )
    }
  }

  return NextResponse.json({
    success: true,
    page_id: pageId,
    ig_user_id: igUserId,
    pages_fetched: mediaResult.pagesFetched,
    reels_seen: rows.length,
    inserted_or_updated: upserted?.length ?? rows.length,
    linked_existing_reels: successfulRows.length,
  })
}