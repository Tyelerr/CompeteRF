// @ts-nocheck
// scan-image — Google Cloud Vision SafeSearch moderation.
//
// The function FETCHES the (signed) image URL itself, verifies it is a real, supported
// image, then sends the raw bytes to Vision as base64 image.content (NOT
// image.source.imageUri). This removes any "can Google fetch this URL" doubt and lets
// us reject mislabeled/unsupported formats (e.g. iOS HEIC, which Vision can't decode
// and which otherwise returns the opaque "Bad image data").
//
// Returns a STRUCTURED result; the client publishes ONLY when status === "approved".
// Never fails open: missing key / fetch failure / bad bytes / Vision outage → "error".
//
// Thresholds: adult VERY_LIKELY → reject, violence VERY_LIKELY → reject;
//             racy / medical / spoof → reported, never auto-rejected.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// Detect image format from magic bytes — catches HEIC even when the object's
// content-type header claims image/jpeg (the exact iOS bug here).
const sniffFormat = (b: Uint8Array): string => {
  if (b.length < 12) return 'too-short'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif'
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp'
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return 'webp'
  // ISO-BMFF ("ftyp" at bytes 4-7) — HEIC/HEIF live here.
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11])
    if (['heic', 'heix', 'hevc', 'hevx', 'heif', 'mif1', 'msf1'].includes(brand)) return 'heic'
    return `isobmff(${brand})`
  }
  return 'unknown'
}

// Vision decodes these; HEIC is NOT supported.
const VISION_OK = new Set(['jpeg', 'png', 'gif', 'bmp', 'webp'])

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

globalThis.Deno?.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const imageUri = body?.imageUri
    if (!imageUri) return json({ status: 'error', isAppropriate: false, reason: 'Image URL required' })

    const visionApiKey = globalThis.Deno?.env.get('GOOGLE_VISION_API_KEY')
    if (!visionApiKey) return json({ status: 'error', isAppropriate: false, reason: 'Moderation not configured' })

    // 1) Fetch the object ourselves and verify it is a real, supported image.
    let imgResp: Response
    try {
      imgResp = await fetch(imageUri)
    } catch (e) {
      return json({ status: 'error', isAppropriate: false, reason: `Could not fetch image URL: ${e?.message ?? e}` })
    }
    const ct = imgResp.headers.get('content-type') ?? ''
    const cl = imgResp.headers.get('content-length') ?? '?'
    const bytes = new Uint8Array(await imgResp.arrayBuffer())
    console.log(`[scan-image] signed URL fetch: status=${imgResp.status} content-type=${ct} content-length=${cl} actualBytes=${bytes.length}`)

    if (!imgResp.ok) {
      return json({ status: 'error', isAppropriate: false, reason: `Image URL returned HTTP ${imgResp.status}` })
    }
    if (bytes.length === 0) {
      return json({ status: 'error', isAppropriate: false, reason: 'Image URL returned 0 bytes' })
    }
    if (!ct.startsWith('image/')) {
      // Non-image body (HTML/JSON/XML error page etc.) — show a snippet for debugging.
      const snippet = new TextDecoder().decode(bytes.subarray(0, 120))
      return json({ status: 'error', isAppropriate: false, reason: `URL did not return an image (content-type: ${ct || 'none'}). Body starts: ${snippet}` })
    }

    const format = sniffFormat(bytes)
    console.log(`[scan-image] sniffed format=${format}`)
    if (!VISION_OK.has(format)) {
      const hint = format === 'heic'
        ? 'HEIC/HEIF is not supported for moderation. Please upload a JPEG or PNG.'
        : `Unsupported image format (${format}). Please upload a JPEG or PNG.`
      return json({ status: 'error', isAppropriate: false, reason: hint })
    }

    // 2) Send the bytes to Vision as base64 content (no URL fetch by Google).
    let visionResp: Response
    try {
      visionResp = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ image: { content: toBase64(bytes) }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }],
        }),
      })
    } catch (e) {
      return json({ status: 'error', isAppropriate: false, reason: `Vision request failed: ${e?.message ?? e}` })
    }

    const data = await visionResp.json().catch(() => null)
    if (!visionResp.ok) {
      return json({ status: 'error', isAppropriate: false, reason: `Vision error ${visionResp.status}: ${data?.error?.message ?? 'unknown'}` })
    }
    const first = data?.responses?.[0]
    if (first?.error) {
      return json({ status: 'error', isAppropriate: false, reason: `Vision: ${first.error.message}` })
    }
    const safe = first?.safeSearchAnnotation
    if (!safe) {
      return json({ status: 'error', isAppropriate: false, reason: 'No SafeSearch annotation returned' })
    }

    const safeSearch = {
      adult: safe.adult ?? 'UNKNOWN',
      violence: safe.violence ?? 'UNKNOWN',
      racy: safe.racy ?? 'UNKNOWN',
      medical: safe.medical ?? 'UNKNOWN',
      spoof: safe.spoof ?? 'UNKNOWN',
    }
    console.log('[scan-image] SafeSearch:', JSON.stringify(safeSearch))

    const flagged: string[] = []
    if (safeSearch.adult === 'VERY_LIKELY') flagged.push('adult')
    if (safeSearch.violence === 'VERY_LIKELY') flagged.push('violence')

    const isAppropriate = flagged.length === 0
    return json({
      status: isAppropriate ? 'approved' : 'rejected',
      isAppropriate,
      reason: isAppropriate ? undefined : `Flagged for ${flagged.join(', ')} content`,
      safeSearch,
    })
  } catch (err) {
    return json({ status: 'error', isAppropriate: false, reason: `Scan failed: ${err?.message ?? err}` })
  }
})
