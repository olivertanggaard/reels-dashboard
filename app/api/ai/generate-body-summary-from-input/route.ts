import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

function toLine(label: string, value: unknown) {
  return `${label}: ${typeof value === 'string' ? value.trim() : ''}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const topic = typeof body?.topic === 'string' ? body.topic.trim() : ''
    const hookType = typeof body?.hook_type === 'string' ? body.hook_type.trim() : ''
    const hookText = typeof body?.hook_text === 'string' ? body.hook_text.trim() : ''

    if (!topic || !hookType || !hookText) {
      return NextResponse.json(
        { success: false, error: 'Missing topic, hook_type or hook_text' },
        { status: 400 }
      )
    }

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

Topic: ${topic}
Hook type: ${hookType}
Hook text: ${hookText}

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

    return NextResponse.json({
      success: true,
      body_summary: bodySummary,
      structured: parsed,
    })
  } catch (error) {
    console.error('generate-body-summary-from-input error:', error)
    return NextResponse.json(
      { success: false, error: 'Something went wrong' },
      { status: 500 }
    )
  }
}