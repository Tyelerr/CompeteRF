import { supabase } from "@/src/lib/supabase";
import { EmailPayload, EmailResult } from "./email.types";

const EDGE_FUNCTION_NAME = "send-email";

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  try {
    const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION_NAME, {
      body: payload,
    });

    if (error) {
      console.warn("[emailService] Edge Function invocation error:", error.message);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      const msg = data?.error ?? "Unknown error from email service.";
      console.warn("[emailService] Email send failed:", msg);
      return { success: false, error: msg };
    }

    return { success: true, id: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error in emailService.";
    console.error("[emailService] Unexpected error:", message);
    return { success: false, error: message };
  }
}