import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const reelId = body?.id

    if (!reelId || typeof reelId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid reel id' },
        { status: 400 }
      )
    }

    const deletedAt = new Date().toISOString()

    const { data, error } = await supabase
      .from('reels')
      .update({ deleted_at: deletedAt })
      .eq('id', reelId)
      .is('deleted_at', null)
      .select('id, deleted_at')
      .single()

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Reel not found or already deleted' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Delete reel error:', error)

    return NextResponse.json(
      { success: false, error: 'Something went wrong' },
      { status: 500 }
    )
  }
}