// @ts-nocheck
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

globalThis.Deno?.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const imageUri = body.imageUri
    
    if (!imageUri) {
      return new Response(JSON.stringify({
        error: 'Image URI required',
        isAppropriate: true,
        violations: [],
        confidence: { adult: 'UNKNOWN', violence: 'UNKNOWN', racy: 'UNKNOWN', medical: 'UNKNOWN', spoof: 'UNKNOWN' }
      }), { headers: corsHeaders })
    }

    const visionApiKey = globalThis.Deno?.env.get('GOOGLE_VISION_API_KEY')
    if (!visionApiKey) {
      return new Response(JSON.stringify({
        error: 'API key missing',
        isAppropriate: true,
        violations: [],
        confidence: { adult: 'UNKNOWN', violence: 'UNKNOWN', racy: 'UNKNOWN', medical: 'UNKNOWN', spoof: 'UNKNOWN' }
      }), { headers: corsHeaders })
    }

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { source: { imageUri } }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }]
      })
    })

    const data = await response.json()
    const safe = data.responses[0].safeSearchAnnotation
    
    const bad = []
    let ok = true

    if (safe.adult === 'LIKELY' || safe.adult === 'VERY_LIKELY') {
      bad.push('Adult content')
      ok = false
    }
    if (safe.violence === 'LIKELY' || safe.violence === 'VERY_LIKELY') {
      bad.push('Violence')
      ok = false  
    }
    if (safe.racy === 'LIKELY' || safe.racy === 'VERY_LIKELY') {
      bad.push('Inappropriate')
      ok = false
    }

    return new Response(JSON.stringify({
      isAppropriate: ok,
      violations: bad,
      confidence: {
        adult: safe.adult || 'UNKNOWN',
        violence: safe.violence || 'UNKNOWN', 
        racy: safe.racy || 'UNKNOWN',
        medical: safe.medical || 'UNKNOWN',
        spoof: safe.spoof || 'UNKNOWN'
      }
    }), { headers: corsHeaders })

  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Scan failed',
      isAppropriate: true,
      violations: ['Error occurred'],
      confidence: { adult: 'UNKNOWN', violence: 'UNKNOWN', racy: 'UNKNOWN', medical: 'UNKNOWN', spoof: 'UNKNOWN' }
    }), { headers: corsHeaders })
  }
})
