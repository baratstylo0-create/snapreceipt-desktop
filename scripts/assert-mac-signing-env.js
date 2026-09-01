'use strict';

const required = ['GOOGLE_DESKTOP_CLIENT_ID', 'CSC_LINK', 'CSC_KEY_PASSWORD'];
const missing = required.filter((name) => !String(process.env[name] || '').trim());

if (missing.length > 0) {
  throw new Error('Refusing to create a macOS release without required signing/build configuration: ' + missing.join(', '));
}

if (!String(process.env.GOOGLE_DESKTOP_CLIENT_ID).endsWith('.apps.googleusercontent.com')) {
  throw new Error('GOOGLE_DESKTOP_CLIENT_ID must be a Google Desktop OAuth client ID.');
}

const apiKeyRoute = ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'];
const appleIdRoute = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'];
const hasApiKeyRoute = apiKeyRoute.every((name) => String(process.env[name] || '').trim());
const hasAppleIdRoute = appleIdRoute.every((name) => String(process.env[name] || '').trim());

if (!hasApiKeyRoute && !hasAppleIdRoute) {
  throw new Error(
    'Refusing to create a macOS release without notarization configuration: set APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER, or set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID.',
  );
}

console.log('Release configuration present: Google client ID, macOS signing inputs, and notarization inputs are set.');
