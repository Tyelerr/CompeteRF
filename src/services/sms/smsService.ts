import { supabase } from "@/src/lib/supabase";
import { SmsPayload, SmsResult } from "./sms.types";

const EDGE_FUNCTION_NAME = "send-sms";

// Raw send: hands a single text to the send-sms edge function (Twilio). The
// edge function holds the credentials; the app never sees them.
export async function sendSms(payload: SmsPayload): Promise<SmsResult> {
  try {
    const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION_NAME, {
      body: payload,
    });

    if (error) {
      console.warn("[smsService] Edge Function invocation error:", error.message);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      const msg = data?.error ?? "Unknown error from SMS service.";
      console.warn("[smsService] SMS send failed:", msg);
      return { success: false, error: msg };
    }

    return { success: true, id: data.id };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error in smsService.";
    console.error("[smsService] Unexpected error:", message);
    return { success: false, error: message };
  }
}
