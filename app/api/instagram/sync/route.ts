import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Din Facebook Page ID
const PAGE_ID = '461596577031870'

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper: udtræk shortcode fra permalink
function getShortcodeFromPermalink(permalink: string | null) {
  if (!permalink) return null

  const match = permalink.match(/instagram\.com\/(?:reel|p)\/([^/?]+)/)
  return match ? match[1] : null
}

// Helper: hent værdi ud fra insights array
function getInsightValue(
  insights: Array<{ name: string; values?: Array<{ value: number }> }> | undefined,
  metricName: string
) {
  const metric = insights?.find((item) => item.name === metricName)
  return metric?.values?.[0]?.value ?? null
}

export async function GET() {
  try {
    const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN

    if (!ACCESS_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'Missing META_ACCESS_TOKEN' },
        { status: 500 }
      )
    }

    // 1. Hent Instagram Business Account ID fra Facebook Page
    const igRes = await fetch(
      `https://graph.facebook.com/v19.0/${PAGE_ID}?fields=instagram_business_account&access_token=${ACCESS_TOKEN}`
    )

    const igData = await igRes.json()
    const igId = igData?.instagram_business_account?.id

    if (!igId) {
      return NextResponse.json(
        {
          success: false,
          error: 'No Instagram account connected',
          page_id: PAGE_ID,
          igData,
        },
        { status: 400 }
      )
    }

    // 2. Hent Instagram account username
    const accountRes = await fetch(
      `https://graph.facebook.com/v19.0/${igId}?fields=username&access_token=${ACCESS_TOKEN}`
    )

    const accountData = await accountRes.json()
    const username = accountData?.username

    if (!username) {
      return NextResponse.json(
        {
          success: false,
          error: 'Could not fetch Instagram username',
          igId,
          accountData,
        },
        { status: 400 }
      )
    }

    // 3. Hent media + insights
    // Vigtigt: limit=100 så vi ikke kun får et lille udsnit tilbage
    const mediaRes = await fetch(
      `https://graph.facebook.com/v19.0/${igId}/media?fields=id,caption,media_type,media_url,permalink,timestamp,thumbnail_url,like_count,comments_count,media_product_type,insights.metric(views,reach,likes,comments,saved,shares,total_interactions)&limit=100&access_token=${ACCESS_TOKEN}`
    )

    const mediaData = await mediaRes.json()
    const items = mediaData?.data || []

    if (!Array.isArray(items)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Could not fetch Instagram media',
          mediaData,
        },
        { status: 400 }
      )
    }

    // 4. Map data til rows til Supabase
    const now = new Date().toISOString()

    const rows = items.map((item: any) => ({
      id: item.id,
      instagram_account_id: igId,
      username,
      caption: item.caption ?? null,
      media_type: item.media_type ?? null,
      media_url: item.media_url ?? null,
      permalink: item.permalink ?? null,
      shortcode: getShortcodeFromPermalink(item.permalink ?? null),
      thumbnail_url: item.thumbnail_url ?? null,
      timestamp: item.timestamp ?? null,
      like_count: item.like_count ?? null,
      comments_count: item.comments_count ?? null,
      media_product_type: item.media_product_type ?? null,
      views: getInsightValue(item.insights?.data, 'views'),
      reach: getInsightValue(item.insights?.data, 'reach'),
      saved: getInsightValue(item.insights?.data, 'saved'),
      shares: getInsightValue(item.insights?.data, 'shares'),
      total_interactions: getInsightValue(item.insights?.data, 'total_interactions'),
      raw_json: item,
      updated_at: now,
      last_synced_at: now,
    }))

    // 5. Upsert til Supabase
    const { data, error } = await supabase
      .from('instagram_reels')
      .upsert(rows, { onConflict: 'id' })
      .select(
        'id, instagram_account_id, permalink, shortcode, views, reach, saved, shares, total_interactions, last_synced_at'
      )

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // 6. Link eksisterende reels via shortcode -> instagram_media_id
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

    // 7. Returnér resultat
    return NextResponse.json({
      success: true,
      instagram_id: igId,
      username,
      synced_count: rows.length,
      linked_count: successfulRows.length,
      data,
    })
  } catch (error) {
    console.error('Instagram sync error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Something went wrong',
      },
      { status: 500 }
    )
  }
}