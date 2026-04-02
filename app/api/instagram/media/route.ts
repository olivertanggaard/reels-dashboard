import { NextResponse } from 'next/server'

const PAGE_ID = '461596577031870'

export async function GET() {
  try {
    const token = process.env.META_ACCESS_TOKEN

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No token found' },
        { status: 500 }
      )
    }

    const igRes = await fetch(
      `https://graph.facebook.com/v25.0/${PAGE_ID}?fields=instagram_business_account&access_token=${token}`
    )
    const igData = await igRes.json()

    const igId = igData?.instagram_business_account?.id

    if (!igId) {
      return NextResponse.json({
        success: false,
        error: 'No Instagram business account found',
        igData,
      })
    }

    const mediaRes = await fetch(
      `https://graph.facebook.com/v25.0/${igId}/media?fields=id,caption,media_type,media_url,permalink,timestamp&access_token=${token}`
    )
    const mediaData = await mediaRes.json()

    return NextResponse.json({
      success: true,
      page_id: PAGE_ID,
      instagram_id: igId,
      media: mediaData,
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Something went wrong' },
      { status: 500 }
    )
  }
}