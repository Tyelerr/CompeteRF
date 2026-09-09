// image-scanner.ts — client wrapper around the `scan-image` Edge Function.
// FAIL CLOSED: any error returns status:"error" (never a fake "approved"), so callers
// keep the previous image and warn the user instead of publishing an unscanned one.
import { supabase } from './src/lib/supabase';

export type ImageScanStatus = 'approved' | 'rejected' | 'error';

export interface SafeSearchLikelihoods {
  adult: string;
  violence: string;
  racy: string;
  medical: string;
  spoof: string;
}

export interface ImageScanResult {
  status: ImageScanStatus;
  isAppropriate: boolean;
  reason?: string;
  safeSearch?: SafeSearchLikelihoods;
}

export class ImageContentScanner {
  // `imageUrl` MUST be a URL Google can fetch (a short-lived signed/public URL), NOT
  // a device-local file:// URI. Upload first, then pass the signed URL here.
  static async scanImage(imageUrl: string, userId?: string): Promise<ImageScanResult> {
    try {
      const { data, error } = await supabase.functions.invoke('scan-image', {
        body: { imageUri: imageUrl, userId },
      });

      if (error) {
        // supabase-js hides the real cause behind "non-2xx status code"; the true
        // status + body live on error.context (the Response). Surface them.
        let bodyText = '';
        let bodyStatus: number | undefined;
        try {
          const ctx: any = (error as any).context;
          if (ctx) {
            bodyStatus = ctx.status;
            if (typeof ctx.clone === 'function') bodyText = await ctx.clone().text();
            else if (typeof ctx.text === 'function') bodyText = await ctx.text();
          }
        } catch {
          /* ignore body read errors */
        }
        console.error('❌ scan-image invoke error:', { message: error.message, status: bodyStatus, body: bodyText });
        return { status: 'error', isAppropriate: false, reason: bodyText || error.message };
      }

      const result = data as Partial<ImageScanResult> | null;
      // Log the REAL SafeSearch response so the end-to-end result is visible.
      console.log('🔍 scan-image result:', JSON.stringify(result));

      if (!result || (result.status !== 'approved' && result.status !== 'rejected' && result.status !== 'error')) {
        return { status: 'error', isAppropriate: false, reason: 'Malformed scanner response' };
      }
      return {
        status: result.status,
        isAppropriate: !!result.isAppropriate,
        reason: result.reason,
        safeSearch: result.safeSearch,
      };
    } catch (err: any) {
      console.error('💥 Image scanning error:', err);
      return { status: 'error', isAppropriate: false, reason: err?.message ?? 'Scan failed' };
    }
  }
}
