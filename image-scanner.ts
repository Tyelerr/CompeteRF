// image-scanner.ts - Calls Supabase Edge Function
import { supabase } from './src/lib/supabase';

export interface ImageScanResult {
  isAppropriate: boolean;
  violations: string[];
  confidence: {
    adult: string;
    violence: string;
    racy: string;
    medical: string;
    spoof: string;
  };
}

export class ImageContentScanner {
  static async scanImage(imageUri: string, userId?: string): Promise<ImageScanResult> {
    try {
      console.log('🔍 Starting image scan...');
      console.log('📷 Image URI length:', imageUri?.length);
      console.log('👤 User ID:', userId);

      // Check authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log('🔐 Current user:', user?.id || 'Not authenticated');
      if (authError) console.log('🔐 Auth error:', authError);

      console.log('🚀 Calling edge function dynamic-processor...');
      
      const { data, error } = await supabase.functions.invoke('dynamic-processor', {
        body: { imageUri, userId },
      });

      console.log('📡 Edge function response:');
      console.log('  - Data:', data);
      console.log('  - Error:', error);

      if (error) {
        console.error('❌ Edge function error details:', {
          message: error.message,
          status: error.status,
          statusText: error.statusText,
        });
        throw new Error(`Scanner service error: ${error.message}`);
      }

      console.log('✅ Image scan completed:', {
        appropriate: data.isAppropriate,
        violations: data.violations
      });

      return data;

    } catch (error: any) {
      console.error('💥 Image scanning error:', error);
      
      // Fallback: Allow image but flag for manual review
      return {
        isAppropriate: true,
        violations: ['Automatic scan failed - manual review recommended'],
        confidence: {
          adult: 'UNKNOWN',
          violence: 'UNKNOWN',
          racy: 'UNKNOWN',
          medical: 'UNKNOWN',
          spoof: 'UNKNOWN',
        },
      };
    }
  }
}
