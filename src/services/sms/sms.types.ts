// src/services/sms/sms.types.ts
export interface SmsPayload {
  to: string;
  body: string;
}

export interface SmsResult {
  success: boolean;
  id?: string;
  error?: string;
}
