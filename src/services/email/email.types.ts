export interface EmailPayload {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface EmailSuccessResult {
  success: true;
  id: string;
}

export interface EmailErrorResult {
  success: false;
  error: string;
}

export type EmailResult = EmailSuccessResult | EmailErrorResult;
