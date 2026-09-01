'use strict';

const required = ['GOOGLE_DESKTOP_CLIENT_ID', 'CSC_LINK', 'CSC_KEY_PASSWORD'];
const missing = required.filter((name) => !String(process.env[name] || '').trim());

if (missing.length > 0) {
  throw new Error('Refusing to create a release installer without required signing/build configuration: ' + missing.join(', '));
}

if (!String(process.env.GOOGLE_DESKTOP_CLIENT_ID).endsWith('.apps.googleusercontent.com')) {
  throw new Error('GOOGLE_DESKTOP_CLIENT_ID must be a Google Desktop OAuth client ID.');
}

console.log('Release configuration present: Google client ID and Windows signing inputs are set.');
