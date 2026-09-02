'use strict';
// Shared constants for main.js + google-auth.js. Split out so both files reference the
// same APP_URL literal instead of two copies that could drift.

const APP_URL = 'https://snapreceiptai.friction.com.my/';

// Desktop Google Sign-In (Part B of docs/specs/2026-08-29-desktop-google-oauth-loopback.md
// in the snapreceipt-ai repo). This is a Google OAuth "Desktop app" client ID — NOT a secret
// (installed-app client IDs are public by design; PKCE is what protects the token exchange,
// see google-auth.js). Filled in once Part C (Google Cloud Console, Barat/Jeevan) creates
// that client and the matching GOOGLE_DESKTOP_CLIENT_ID is set on the server. Until then this
// stays empty and google-auth.js's isConfigured() below keeps the feature inert rather than
// sending a request Google will reject.
const GOOGLE_DESKTOP_CLIENT_ID = '';

module.exports = { APP_URL, GOOGLE_DESKTOP_CLIENT_ID };
