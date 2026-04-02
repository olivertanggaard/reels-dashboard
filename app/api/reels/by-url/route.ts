import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getShortcodeFromUrl(url: string) {
  const match = url.match(/instagram\.com\/(?:reel|p)\/([^/?]+)/)
  return match ? match[1] : null
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const url = searchParams.get('url')

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'Missing url parameter' },
        { status: 400 }
      )
    }

    const shortcode = getShortcodeFromUrl(url)

    if (!shortcode) {
      return NextResponse.json(
        { success: false, error: 'Invalid Instagram URL' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('instagram_reels')
      .select('*')
      .eq('shortcode', shortcode)
      .single()

    if (error || !data) {
      return NextResponse.json(
        {
          success: false,
          error: 'Reel not found in database',
          shortcode,
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      shortcode,
      data,
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Something went wrong' },
      { status: 500 }
    )
  }
}