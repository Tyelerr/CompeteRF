"""Verify the login-with-username Edge Function end-to-end (Stage 0, M3 profiles privacy).

Run from the repo root:  python scripts/verify-username-login.py [username]
Prompts for the password with hidden input. Prints ONLY pass/fail lines — never the
password, tokens, email or profile data. Both test sessions are revoked at the end.
"""
import base64
import getpass
import json
import os
import sys
import urllib.error
import urllib.request

USERNAME = sys.argv[1] if len(sys.argv) > 1 else "GoogleReviewTD"


def load_env(path=".env"):
    env = {}
    with open(path, encoding="utf-8-sig") as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def call(url, key, body=None, token=None, method=None):
    headers = {"apikey": key, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method or ("POST" if data else "GET"))
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode()
            return r.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def jwt_claims(tok):
    try:
        part = tok.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
    except Exception:
        return {}


env = load_env()
URL, KEY = env["EXPO_PUBLIC_SUPABASE_URL"], env["EXPO_PUBLIC_SUPABASE_ANON_KEY"]
password = getpass.getpass(f"Password for {USERNAME} (hidden): ")
results = []


def check(name, ok):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name)


# 1. Username login through the new Edge Function
status, raw = call(URL + "/functions/v1/login-with-username", KEY, {"username": USERNAME, "password": password})
check("login-with-username returns 200", status == 200)
body = json.loads(raw) if raw.startswith("{") else {}
session = body.get("session") or {}
check("response top-level keys are exactly ['session']", sorted(body.keys()) == ["session"])
check("session keys are only token fields", set(session.keys()) <= {"access_token", "refresh_token", "expires_in", "expires_at", "token_type"} and "access_token" in session)
check("response body contains no email address", "@" not in raw)
check("response body contains no user/profile object", '"user"' not in raw and '"email"' not in raw and '"user_name"' not in raw)
access = session.get("access_token", "")

# 2. The returned session is valid (Supabase accepts it)
ustatus, uraw = call(URL + "/auth/v1/user", KEY, token=access) if access else (0, "")
uid = json.loads(uraw).get("id") if ustatus == 200 else None
check("session is valid (auth/v1/user accepts the access token)", ustatus == 200 and bool(uid))
claims = jwt_claims(access)
check("session belongs to the expected account (sub matches the user id)", bool(uid) and claims.get("sub") == uid)

# 3. The normal email/password login path is unaffected
email = json.loads(uraw).get("email") if ustatus == 200 else None  # kept in memory only, never printed
estatus, eraw = call(URL + "/auth/v1/token?grant_type=password", KEY, {"email": email, "password": password}) if email else (0, "")
etok = json.loads(eraw).get("access_token") if estatus == 200 else None
check("existing email + password login still works", estatus == 200 and bool(etok))

# 4. Wrong password through the new function still fails generically
wstatus, wraw = call(URL + "/functions/v1/login-with-username", KEY, {"username": USERNAME, "password": password + "-wrong"})
check("wrong password -> 401 with the generic error only", wstatus == 401 and wraw == '{"error":"Invalid username or password."}')

# 5. Revoke both test sessions (local scope: only these sessions)
for tok in (access, etok):
    if tok:
        call(URL + "/auth/v1/logout?scope=local", KEY, body={}, token=tok)
print("(test sessions revoked)")
print(f"RESULT: {sum(results)}/{len(results)} passed")
password = None
