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

type ReelRow = {
  id: string
  topic: string | null
  hook_type: string | null
  hook_text: string | null
}

function toLine(label: string, value: unknown) {
  return `${label}: ${typeof value === 'string' ? value.trim() : ''}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const reelId = body?.reelId

    if (!reelId || typeof reelId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid reelId' },
        { status: 400 }
      )
    }

    const { data: reel, error: reelError } = await supabase
      .from('reels')
      .select('id, topic, hook_type, hook_text')
      .eq('id', reelId)
      .single()

    if (reelError || !reel) {
      return NextResponse.json(
        { success: false, error: 'Reel not found' },
        { status: 404 }
      )
    }

    const typedReel = reel as ReelRow

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: `
You generate structured body summaries for Instagram reels.

Your job:
- Write a concise, high-signal structured summary for later performance analysis
- Do NOT write fluffy marketing copy
- Do NOT write long paragraphs
- Be concrete and specific
- Assume this is for a smaller creator account in sales/business content

Return only valid JSON matching the schema.
          `.trim(),
        },
        {
          role: 'user',
          content: `
Create a structured body summary for this reel.

Topic: ${typedReel.topic ?? ''}
Hook type: ${typedReel.hook_type ?? ''}
Hook text: ${typedReel.hook_text ?? ''}

Fill these fields:
- claim
- angle
- structure
- mechanism
- desired_reaction
- cta

Rules:
- Max 1 short sentence per field
- No filler words
- No explanations
- No long phrasing
- Be precise and analytical
- Write in Danish
- Make it useful for later AI analysis of why a reel performed well or badly
          `.trim(),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'body_summary_schema',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              claim: { type: 'string' },
              angle: { type: 'string' },
              structure: { type: 'string' },
              mechanism: { type: 'string' },
              desired_reaction: { type: 'string' },
              cta: { type: 'string' },
            },
            required: [
              'claim',
              'angle',
              'structure',
              'mechanism',
              'desired_reaction',
              'cta',
            ],
          },
          strict: true,
        },
      },
    })

    const output = response.output_text

    if (!output) {
      return NextResponse.json(
        { success: false, error: 'No output from OpenAI' },
        { status: 500 }
      )
    }

    let parsed: {
      claim: string
      angle: string
      structure: string
      mechanism: string
      desired_reaction: string
      cta: string
    }

    try {
      parsed = JSON.parse(output)
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON returned from OpenAI', raw: output },
        { status: 500 }
      )
    }

    const bodySummary = [
      toLine('Claim', parsed.claim),
      toLine('Angle', parsed.angle),
      toLine('Structure', parsed.structure),
      toLine('Mechanism', parsed.mechanism),
      toLine('Desired reaction', parsed.desired_reaction),
      toLine('CTA', parsed.cta),
    ].join('\n')

    const { error: updateError } = await supabase
      .from('reels')
      .update({ body_summary: bodySummary })
      .eq('id', reelId)

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      reelId,
      body_summary: bodySummary,
      structured: parsed,
    })
  } catch (error) {
    console.error('generate-body-summary error:', error)
    return NextResponse.json(
      { success: false, error: 'Something went wrong' },
      { status: 500 }
    )
  }
}