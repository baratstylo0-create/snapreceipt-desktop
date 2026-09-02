'use strict';

const required = ['CSC_LINK', 'CSC_KEY_PASSWORD'];
const missing = required.filter((name) => !String(process.env[name] || '').trim());

if (missing.length > 0) {
  throw new Error(
    'Refusing to create a direct-download Windows release without required signing configuration: ' +
      missing.join(', '),
  );
}

console.log('Windows release signing configuration is present.');
