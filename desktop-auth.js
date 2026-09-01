'use strict';

// RFC 8252 desktop Google sign-in. This module intentionally lives in Electron's
// main process: the renderer only hosts remote, untrusted web content and never sees
// the OAuth authorization code, PKCE verifier, or a Google token.
const crypto = require('node:crypto');
const http = require('node:http');

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;

function base64url(value) {
  return Buffer.from(value).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function randomBase64url(bytes = 32) {
  return base64url(crypto.randomBytes(bytes));
}

function createPkce() {
  const verifier = randomBase64url(48);
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function buildAuthorizeUrl({ clientId, redirectUri, state, challenge }) {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

function callbackPage(message, isError) {
  const safe = String(message).replace(/[<&>]/g, (char) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[char]));
  return '<!doctype html><meta charset="utf-8"><title>SnapReceipt AI</title>'
    + '<body style="font-family:system-ui;max-width:34rem;margin:4rem auto;padding:1rem">'
    + '<h1>' + (isError ? 'Sign-in could not finish' : 'Sign-in complete') + '</h1>'
    + '<p>' + safe + '</p></body>';
}

function waitForLoopbackCallback({ expectedState, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  let settled = false;
  let timeout = null;
  let server;
  let rejectWait;
  let resolveReady;
  let rejectReady;

  const finish = (fn, value) => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    if (server) server.close();
    fn(value);
  };

  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const result = new Promise((resolve, reject) => {
    rejectWait = reject;
    server = http.createServer((req, res) => {
      let url;
      try { url = new URL(req.url, 'http://' + LOOPBACK_HOST); } catch (e) { url = null; }
      if (!url || req.method !== 'GET' || url.pathname !== '/') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      const state = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(callbackPage('The sign-in response did not match this request. Return to SnapReceipt and try again.', true));
        return;
      }
      if (error || !code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(callbackPage('Google sign-in was cancelled or did not return a code. You can close this tab.', true));
        finish(reject, new Error(error || 'Google did not return an authorization code'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(callbackPage('You can close this tab and return to SnapReceipt AI.', false));
      finish(resolve, { code });
    });
    server.once('error', (error) => {
      rejectReady(error);
      finish(reject, error);
    });
    server.listen(0, LOOPBACK_HOST, () => {
      const address = server.address();
      resolveReady({ redirectUri: 'http://' + LOOPBACK_HOST + ':' + address.port });
    });
    timeout = setTimeout(() => finish(reject, new Error('Google sign-in timed out. Please try again.')), timeoutMs);
  });
  return { result, ready, cancel: () => finish(rejectWait, new Error('Google sign-in cancelled')) };
}

async function exchangeCode({ fetchImpl, clientId, code, verifier, redirectUri }) {
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body.id_token !== 'string' || !body.id_token) {
    throw new Error('Google did not return a usable identity token');
  }
  return body.id_token;
}

async function exchangeForSnapReceiptSession({ fetchImpl, appUrl, idToken }) {
  const response = await fetchImpl(new URL('/api/auth/google/native', appUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body.token !== 'string' || !body.token) {
    throw new Error('SnapReceipt could not complete Google sign-in');
  }
  return body;
}

async function beginDesktopGoogleSignIn({ clientId, appUrl, openExternal, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!clientId) throw new Error('Desktop Google sign-in is not configured yet');
  if (typeof openExternal !== 'function') throw new Error('No system-browser launcher is available');
  const state = randomBase64url();
  const { verifier, challenge } = createPkce();
  const loopback = waitForLoopbackCallback({ expectedState: state, timeoutMs });
  const { redirectUri } = await loopback.ready;
  const authorizeUrl = buildAuthorizeUrl({ clientId, redirectUri, state, challenge });
  let opened;
  try {
    opened = await openExternal(authorizeUrl);
  } catch (error) {
    loopback.cancel();
    throw new Error('Could not open your default browser for Google sign-in');
  }
  if (opened === false) {
    loopback.cancel();
    throw new Error('Could not open your default browser for Google sign-in');
  }
  const { code } = await loopback.result;
  const idToken = await exchangeCode({ fetchImpl, clientId, code, verifier, redirectUri });
  return exchangeForSnapReceiptSession({ fetchImpl, appUrl, idToken });
}

module.exports = {
  GOOGLE_AUTHORIZE_URL,
  GOOGLE_TOKEN_URL,
  callbackPage,
  base64url,
  createPkce,
  buildAuthorizeUrl,
  exchangeCode,
  exchangeForSnapReceiptSession,
  beginDesktopGoogleSignIn,
  waitForLoopbackCallback,
};
