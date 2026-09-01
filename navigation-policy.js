'use strict';

const APP_HOST = 'snapreceiptai.friction.com.my';

function parseUrl(value) {
  try {
    return new URL(String(value));
  } catch (error) {
    return null;
  }
}

function isAllowedAppUrl(value) {
  const url = parseUrl(value);
  return Boolean(url)
    && url.protocol === 'https:'
    && url.hostname === APP_HOST;
}

function isGoogleStartUrl(value) {
  const url = parseUrl(value);
  return isAllowedAppUrl(value)
    && url.pathname === '/api/auth/google';
}

// The remote app may ask Electron to open a link. Only pass protocols that are
// intentionally user-facing to the OS; never hand file:, javascript:, data:, or
// arbitrary custom schemes to shell.openExternal().
function isSafeExternalUrl(value) {
  const url = parseUrl(value);
  if (!url) return false;
  if (url.protocol === 'https:') return Boolean(url.hostname);
  if (url.protocol === 'mailto:') return Boolean(url.pathname);
  if (url.protocol === 'tel:') return Boolean(url.pathname);
  return false;
}

module.exports = {
  APP_HOST,
  isAllowedAppUrl,
  isGoogleStartUrl,
  isSafeExternalUrl,
};
