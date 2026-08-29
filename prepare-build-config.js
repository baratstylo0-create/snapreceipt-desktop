'use strict';

// Generates the public installed-app OAuth client identifier immediately before an
// installer build. This is deliberately not a committed secret/config file: Google desktop
// client IDs are public, but an empty ID would silently ship a non-working sign-in button.
const fs = require('node:fs');
const path = require('node:path');

const clientId = String(process.env.GOOGLE_DESKTOP_CLIENT_ID || '').trim();
if (!clientId.endsWith('.apps.googleusercontent.com')) {
  throw new Error('Set GOOGLE_DESKTOP_CLIENT_ID to the Google Cloud Desktop app client ID before packaging.');
}
const target = path.join(__dirname, 'build-config.js');
fs.writeFileSync(target, "'use strict';\nmodule.exports = { GOOGLE_DESKTOP_CLIENT_ID: " + JSON.stringify(clientId) + " };\n", { mode: 0o600 });
