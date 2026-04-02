import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN

    if (!ACCESS_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'Missing META_ACCESS_TOKEN' },
        { status: 500 }
      )
    }

    // Brug et reel/media ID fra din database her:
    const MEDIA_ID = '18010519169838422'

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${MEDIA_ID}?fields=id,media_product_type,media_type,permalink,like_count,comments_count,insights.metric(views,reach,likes,comments,saved,shares,total_interactions)&access_token=${ACCESS_TOKEN}`
    )

    const data = await res.json()

    return NextResponse.json({
      success: true,
      data,
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Something went wrong' },
      { status: 500 }
    )
  }
}