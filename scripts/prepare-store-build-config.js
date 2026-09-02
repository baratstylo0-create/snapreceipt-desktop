'use strict';

// The Microsoft Store assigns these values in Partner Center. They are public
// package identity metadata, not signing secrets, but the build must fail closed
// when they are absent so we never produce a package with an invented identity.
const fs = require('node:fs');
const path = require('node:path');

const required = [
  'WINDOWS_STORE_IDENTITY_NAME',
  'WINDOWS_STORE_PUBLISHER',
  'WINDOWS_STORE_PUBLISHER_DISPLAY_NAME',
  'WINDOWS_STORE_APPLICATION_ID',
];

const values = Object.fromEntries(
  required.map((name) => [name, String(process.env[name] || '').trim()]),
);
const missing = required.filter((name) => !values[name]);
if (missing.length > 0) {
  throw new Error(
    'Refusing to create a Microsoft Store package without Partner Center metadata: ' +
      missing.join(', '),
  );
}

if (values.WINDOWS_STORE_IDENTITY_NAME.length < 3 || values.WINDOWS_STORE_IDENTITY_NAME.length > 50 ||
    !/^[A-Za-z0-9.-]+$/.test(values.WINDOWS_STORE_IDENTITY_NAME)) {
  throw new Error('WINDOWS_STORE_IDENTITY_NAME must be 3-50 characters using AppX identity characters.');
}

if (!/^CN=.+/.test(values.WINDOWS_STORE_PUBLISHER)) {
  throw new Error('WINDOWS_STORE_PUBLISHER must be the Partner Center publisher subject, starting with CN=.');
}

if (values.WINDOWS_STORE_APPLICATION_ID.length < 1 || values.WINDOWS_STORE_APPLICATION_ID.length > 64 ||
    !/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/.test(values.WINDOWS_STORE_APPLICATION_ID)) {
  throw new Error('WINDOWS_STORE_APPLICATION_ID must be 1-64 characters using AppX application-id segments.');
}

if (values.WINDOWS_STORE_PUBLISHER_DISPLAY_NAME.length > 256) {
  throw new Error('WINDOWS_STORE_PUBLISHER_DISPLAY_NAME is longer than the AppX display-name limit.');
}

const config = {
  win: {
    target: [{ target: 'appx', arch: ['x64'] }],
  },
  appx: {
    applicationId: values.WINDOWS_STORE_APPLICATION_ID,
    identityName: values.WINDOWS_STORE_IDENTITY_NAME,
    publisher: values.WINDOWS_STORE_PUBLISHER,
    publisherDisplayName: values.WINDOWS_STORE_PUBLISHER_DISPLAY_NAME,
    displayName: 'SnapReceipt AI',
    artifactName: 'SnapReceipt-AI-Store.appx',
    languages: ['en-US'],
    capabilities: ['runFullTrust'],
  },
};

const target = path.join(__dirname, '..', 'store-build-config.json');
fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log('Microsoft Store build metadata validated and prepared.');
