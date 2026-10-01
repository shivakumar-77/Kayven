import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { image, mimeType, mode } = await req.json()
    if (!image || typeof image !== 'string') return NextResponse.json({ error: 'Invalid image' }, { status: 400 })
    if (image.length > 8 * 1024 * 1024) return NextResponse.json({ error: 'Image too large. Max 5MB.' }, { status: 400 })
    const allowedTypes = ['image/jpeg','image/jpg','image/png','image/webp','image/heic']
    if (mimeType && !allowedTypes.includes(mimeType)) return NextResponse.json({ error: 'Invalid image type' }, { status: 400 })
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })

    const prompt = mode === 'recipe'
      ? `This image may contain a food label, nutrition facts panel, recipe card, or menu item. Extract the nutrition information.
If it's a nutrition label: read the serving size, calories, protein, carbohydrates, fat, fiber exactly as shown.
If it's a recipe or dish photo: estimate macros for the dish shown.
Respond ONLY with this JSON, no markdown:
{"name":"product or dish name","qty":100,"unit":"g","cal":0,"protein":0,"carb":0,"fat":0,"fiber":0,"description":"brief description of what was found"}`
      : `Identify the food in this image and estimate macros for the visible portion.
Respond ONLY with this JSON, no markdown:
{"name":"food name","qty":100,"unit":"g","cal":0,"protein":0,"carb":0,"fat":0,"fiber":0,"description":"brief description"}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2024-06-01' },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type:'image', source:{ type:'base64', media_type:mimeType||'image/jpeg', data:image } },
            { type:'text', text:prompt }
          ]
        }]
      }),
      signal: AbortSignal.timeout(60000)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Anthropic API error:', response.status, errorData)
      return NextResponse.json({ error: 'AI service error', details: errorData }, { status: 502 })
    }
    const data = await response.json()
    const text = data.content?.[0]?.text ?? ''
    let result = null
    try {
      result = JSON.parse(text.replace(/```json|```/g,'').trim())
      if (!result.name || typeof result.cal !== 'number') result = null
    } catch { result = null }
    if (!result) return NextResponse.json({ error: 'Could not read nutrition info. Try a clearer photo.' }, { status: 422 })
    return NextResponse.json({ result })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
