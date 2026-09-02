'use strict';
// Desktop Google Sign-In — system-browser loopback (RFC 8252), main process only.
//
// Why this exists: this app's own BrowserWindow has an isolated cookie store that has never
// signed into Google, so navigating Google's OAuth screen INSIDE this window shows a raw
// manual "Email or phone" form (no account chooser) — and Google can outright refuse the
// whole flow as an untrusted embedded browser ("disallowed_useragent"). The fix (RFC 8252):
// run the Google step in the user's REAL default browser (shell.openExternal), where they are
// already signed in, and receive the result over a one-shot HTTP listener on 127.0.0.1. See
// docs/specs/2026-08-29-desktop-google-oauth-loopback.md (snapreceipt-ai repo) for the full
// design and the POST /api/auth/google/native contract this calls into.
//
// PKCE (RFC 7636), no client secret: a Google "Desktop app" OAuth client has no confidential
// secret to protect (anyone can extract one from a distributed binary), so Google issues this
// client type specifically for the PKCE-only public-client flow — the code_verifier, generated
// fresh per sign-in and never leaving this process until the token exchange, is what makes the
// authorization code non-replayable instead of a secret.
const crypto = require('crypto');
const http = require('http');
const { shell } = require('electron');
const { GOOGLE_DESKTOP_CLIENT_ID } = require('./config');

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const NATIVE_SESSION_ENDPOINT = 'https://snapreceiptai.friction.com.my/api/auth/google/native';
const SCOPE = 'openid email profile';
const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes — tears down the loopback listener if the user never finishes in the browser

function isConfigured() {
  return !!GOOGLE_DESKTOP_CLIENT_ID;
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makePkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

const PAGE_STYLE = 'font-family:system-ui,sans-serif;background:#fbfaf7;color:#101826;' +
  'display:flex;align-items:center;justify-content:center;height:100vh;margin:0';
const SUCCESS_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>SnapReceipt AI</title></head>' +
  '<body style="' + PAGE_STYLE + '"><p>Signed in — you can close this tab and return to SnapReceipt AI.</p></body></html>';
const ERROR_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>SnapReceipt AI</title></head>' +
  '<body style="' + PAGE_STYLE + '"><p>Sign-in was not completed. You can close this tab and try again from the app.</p></body></html>';

// startLoopbackServer(state) -> { redirectUri, waitForCode() }. A one-shot HTTP server on
// 127.0.0.1 ONLY (never 0.0.0.0 — this must never be reachable from the network) that accepts
// exactly one request, checks `state` itself so a stray/forged local request can't complete
// someone else's sign-in, replies with a static page either way, and self-closes.
function startLoopbackServer(state) {
  return new Promise((resolveServer, rejectServer) => {
    const server = http.createServer();
    let settled = false;
    let resolveCode; let rejectCode;
    const codePromise = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
    // Google's redirect can in principle land before the caller reaches `waitForCode()`'s
    // Promise.race (e.g. the browser round-trip completing faster than shell.openExternal's
    // own promise resolves) — an unconsumed rejection in that gap is "unhandled" from Node's
    // point of view and crashes the process. This no-op catch only prevents that; the SAME
    // codePromise object is still raced against the timeout below and carries the real
    // rejection to whoever awaits it.
    codePromise.catch(() => {});

    server.on('request', (req, res) => {
      let url;
      try { url = new URL(req.url, 'http://127.0.0.1'); } catch (e) { res.writeHead(400); res.end(); return; }
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const gotState = url.searchParams.get('state');
      const ok = !error && code && gotState === state;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ok ? SUCCESS_HTML : ERROR_HTML);
      if (settled) return;
      settled = true;
      server.close();
      if (error) return rejectCode(Object.assign(new Error('google auth denied'), { code: 'denied' }));
      if (!code || gotState !== state) return rejectCode(Object.assign(new Error('state mismatch'), { code: 'state_mismatch' }));
      resolveCode(code);
    });

    server.on('error', (e) => { if (!settled) { settled = true; rejectServer(e); } });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveServer({
        redirectUri: 'http://127.0.0.1:' + port,
        // clearTimeout on the winning path matters here, not just style: an un-cleared
        // 3-minute timer keeps the Node/Electron main-process event loop alive that whole
        // time even after a successful sign-in — confirmed by a manual test that hung on
        // exit until this was added.
        waitForCode: () => {
          let timer;
          const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
              if (settled) return;
              settled = true;
              server.close();
              reject(Object.assign(new Error('sign-in timed out'), { code: 'timeout' }));
            }, TIMEOUT_MS);
          });
          return Promise.race([codePromise, timeout]).finally(() => clearTimeout(timer));
        },
      });
    });
  });
}

// exchangeCode({code, verifier, redirectUri}) -> idToken. PKCE-only — no client_secret sent
// (this client type has none; Google's token endpoint accepts a registered "Desktop app"
// client authenticating with just code_verifier).
async function exchangeCode({ code, verifier, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_DESKTOP_CLIENT_ID,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });
  const r = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data || !data.id_token) {
    const msg = (data && (data.error_description || data.error)) || ('HTTP ' + r.status);
    throw Object.assign(new Error('Google token exchange failed: ' + msg), { code: 'exchange_failed' });
  }
  return data.id_token;
}

// mintNativeSession(idToken) -> { token, role, name, is_new, bind_token? }. The only call this
// module makes to our OWN server — snapreceipt-ai's POST /api/auth/google/native (see that
// repo's docs/specs/2026-08-29-desktop-google-oauth-loopback.md §2.2 for the exact shape).
async function mintNativeSession(idToken) {
  const r = await fetch(NATIVE_SESSION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data || !data.token) {
    const code = (data && data.error) || ('http_' + r.status);
    throw Object.assign(new Error('native session mint failed: ' + code), { code });
  }
  return data;
}

// signInWithGoogle() -> { token, role, name, isNew, bindToken } | throws Error with .code —
// 'not_configured' (GOOGLE_DESKTOP_CLIENT_ID unset), 'denied' (user cancelled at Google),
// 'state_mismatch', 'timeout', 'exchange_failed', or whatever POST /api/auth/google/native
// itself returns ('account_type' | 'disabled' | 'wrong_audience' | 'not_configured' | 'failed').
// The ONE exported entry point — main.js awaits this, then either loads the app with a
// #gauth_token=... fragment (success) or #gauth_error=<code> (failure): the EXACT same
// handoff contract the web/Android Google flows already use, so the loaded page's own
// public/js/app.js boot() needs zero changes to pick this up.
async function signInWithGoogle() {
  if (!isConfigured()) throw Object.assign(new Error('desktop Google client not configured'), { code: 'not_configured' });

  const { verifier, challenge } = makePkce();
  const state = base64url(crypto.randomBytes(16));
  const { redirectUri, waitForCode } = await startLoopbackServer(state);

  const authUrl = AUTH_ENDPOINT + '?' + new URLSearchParams({
    client_id: GOOGLE_DESKTOP_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();

  await shell.openExternal(authUrl);
  const code = await waitForCode();
  const idToken = await exchangeCode({ code, verifier, redirectUri });
  const session = await mintNativeSession(idToken);
  return { token: session.token, role: session.role, name: session.name || '', isNew: !!session.is_new, bindToken: session.bind_token || null };
}

module.exports = { isConfigured, signInWithGoogle };
