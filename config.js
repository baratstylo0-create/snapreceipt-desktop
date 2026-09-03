'use strict';
// Shared constants for main.js + google-auth.js. Split out so both files reference the
// same APP_URL literal instead of two copies that could drift.

const path = require('path');
const fs = require('fs');

const APP_URL = 'https://snapreceiptai.friction.com.my/';

// Desktop Google Sign-In (Part B/C of docs/specs/2026-08-29-desktop-google-oauth-loopback.md
// in the snapreceipt-ai repo). Google "Desktop app" OAuth client — the client ID is public
// by design; the secret is loaded from .env (not checked into source).
const GOOGLE_DESKTOP_CLIENT_ID = '1034889931854-eltia0qu3n6pk1f272u6sb047b73hnl2.apps.googleusercontent.com';

// Read GOOGLE_DESKTOP_CLIENT_SECRET from .env next to this file (gitignored).
let GOOGLE_DESKTOP_CLIENT_SECRET = '';
try {
  const envPath = path.join(__dirname, '.env');
  const envText = fs.readFileSync(envPath, 'utf8');
  const m = envText.match(/^GOOGLE_DESKTOP_CLIENT_SECRET=(.+)$/m);
  if (m) GOOGLE_DESKTOP_CLIENT_SECRET = m[1].trim();
} catch (e) { /* .env missing — sign-in will fail gracefully */ }

module.exports = { APP_URL, GOOGLE_DESKTOP_CLIENT_ID, GOOGLE_DESKTOP_CLIENT_SECRET };
