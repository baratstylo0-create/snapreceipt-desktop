'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const {
  buildAuthorizeUrl,
  callbackPage,
  createPkce,
  waitForLoopbackCallback,
  exchangeCode,
  exchangeForSnapReceiptSession,
} = require('../desktop-auth');

test('PKCE uses an RFC 7636 S256 challenge and Google URL carries state', () => {
  const { verifier, challenge } = createPkce();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  const url = new URL(buildAuthorizeUrl({
    clientId: 'desktop.apps.googleusercontent.com',
    redirectUri: 'http://127.0.0.1:12345',
    state: 'state-123',
    challenge,
  }));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('prompt'), 'select_account');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 'state-123');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:12345');
});

test('loopback listener accepts only the matching state and closes after a valid callback', async () => {
  const loopback = waitForLoopbackCallback({ expectedState: 'expected-state', timeoutMs: 5000 });
  const { redirectUri } = await loopback.ready;
  const url = new URL(redirectUri);
  const response = await new Promise((resolve, reject) => {
    http.get(url.origin + '/?code=auth-code&state=expected-state', (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (part) => { body += part; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
  assert.equal(response.status, 200);
  assert.match(response.body, /You can close this tab/);
  assert.deepEqual(await loopback.result, { code: 'auth-code' });
});

test('token exchanges never use a client secret and pass the ID token only in a JSON body', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('oauth2.googleapis.com')) {
      return { ok: true, json: async () => ({ id_token: 'google-id-token' }) };
    }
    return { ok: true, json: async () => ({ token: 'snap-session', role: 'owner' }) };
  };
  const idToken = await exchangeCode({
    fetchImpl, clientId: 'desktop.apps.googleusercontent.com', code: 'auth-code', verifier: 'verifier', redirectUri: 'http://127.0.0.1:12345',
  });
  const session = await exchangeForSnapReceiptSession({ fetchImpl, appUrl: 'https://snapreceiptai.friction.com.my/', idToken });
  assert.equal(session.token, 'snap-session');
  assert.match(calls[0].options.body, /code_verifier=verifier/);
  assert.doesNotMatch(calls[0].options.body, /secret/i);
  assert.equal(calls[1].url, 'https://snapreceiptai.friction.com.my/api/auth/google/native');
  assert.equal(calls[1].options.body, '{"id_token":"google-id-token"}');
});

test('loopback callback HTML escapes message text', () => {
  const body = callbackPage('<script>&</script>', true);
  assert.doesNotMatch(body, /<script>/i);
  assert.match(body, /&lt;script&gt;&amp;&lt;\/script&gt;/);
});
