// supabase/functions/_shared/username_login.ts
// Pure core of the login-with-username Edge Function (no Deno / network APIs — dependencies
// are injected, so it is unit-tested from src/utils/__tests__/username-login.test.ts).
//
// Contract: the client sends { username, password }; the server resolves the email with the
// service-role-only RPC _login_email_for_username and signs in with it. The response carries
// ONLY the session tokens — never the email or any profile field — and every failure (unknown
// username, ambiguous username, wrong password, disabled auth user) returns the SAME generic
// error, so the endpoint cannot be used to learn emails or to probe which usernames exist
// beyond what the public username check already reveals.

export interface UsernameLoginDeps {
  // service-role RPC: username -> email | null
  resolveEmail: (username: string) => Promise<string | null>;
  // password sign-in with the resolved email (anon client, server side)
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ session: LoginSession | null; error: unknown | null }>;
}

export interface LoginSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
}

export type UsernameLoginResult =
  | { status: 200; body: { session: Pick<LoginSession, "access_token" | "refresh_token" | "expires_in" | "expires_at" | "token_type"> } }
  | { status: 400 | 401 | 500; body: { error: string } };

export const GENERIC_LOGIN_ERROR = "Invalid username or password.";

export const handleUsernameLogin = async (
  input: unknown,
  deps: UsernameLoginDeps,
): Promise<UsernameLoginResult> => {
  const body = (input ?? {}) as { username?: unknown; password?: unknown };
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password || username.length > 40 || password.length > 200 || username.includes("@")) {
    // Emails go through the normal client email login; this endpoint is usernames only.
    return { status: 400, body: { error: GENERIC_LOGIN_ERROR } };
  }
  let email: string | null = null;
  try {
    email = await deps.resolveEmail(username);
  } catch {
    return { status: 500, body: { error: "Login is temporarily unavailable." } };
  }
  if (!email) return { status: 401, body: { error: GENERIC_LOGIN_ERROR } };
  const { session, error } = await deps.signIn(email, password);
  if (error || !session?.access_token || !session?.refresh_token) {
    return { status: 401, body: { error: GENERIC_LOGIN_ERROR } };
  }
  // Only the tokens the client needs for supabase.auth.setSession — nothing else.
  return {
    status: 200,
    body: {
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        token_type: session.token_type,
      },
    },
  };
};
