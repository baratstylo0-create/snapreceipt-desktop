'use strict';
// Shared constants for main.js + google-auth.js. Split out so both files reference the
// same APP_URL literal instead of two copies that could drift.

const APP_URL = 'https://snapreceiptai.friction.com.my/';

// Desktop Google Sign-In (Part B of docs/specs/2026-08-29-desktop-google-oauth-loopback.md
// in the snapreceipt-ai repo). This is a Google OAuth "Desktop app" client ID — NOT a secret
// (installed-app client IDs are public by design; PKCE is what protects the token exchange,
// see google-auth.js). Part C done 2026-09-02: created in the SNAPRECEIPT AI Google Cloud
// project (console.cloud.google.com/auth/clients, authuser=1), matching GOOGLE_DESKTOP_CLIENT_ID
// set on the VPS .env and the OAuth consent screen published to production (was stuck in
// Testing, restricted to a single account — fixed same day).
const GOOGLE_DESKTOP_CLIENT_ID = '1034889931854-eltia0qu3n6pk1f272u6sb047b73hnl2.apps.googleusercontent.com';

module.exports = { APP_URL, GOOGLE_DESKTOP_CLIENT_ID };
