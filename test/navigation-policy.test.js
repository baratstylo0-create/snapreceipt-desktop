'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isAllowedAppUrl,
  isGoogleStartUrl,
  isSafeExternalUrl,
} = require('../navigation-policy');

test('only the exact HTTPS SnapReceipt origin is allowed inside Electron', () => {
  assert.equal(isAllowedAppUrl('https://snapreceiptai.friction.com.my/'), true);
  assert.equal(isAllowedAppUrl('https://snapreceiptai.friction.com.my/login'), true);
  assert.equal(isAllowedAppUrl('http://snapreceiptai.friction.com.my/'), false);
  assert.equal(isAllowedAppUrl('https://evil.snapreceiptai.friction.com.my/'), false);
  assert.equal(isAllowedAppUrl('https://snapreceiptai.friction.com.my.evil.test/'), false);
  assert.equal(isAllowedAppUrl('file:///C:/Windows/System32/calc.exe'), false);
});

test('Google OAuth interception is restricted to the app endpoint', () => {
  assert.equal(isGoogleStartUrl('https://snapreceiptai.friction.com.my/api/auth/google'), true);
  assert.equal(isGoogleStartUrl('https://snapreceiptai.friction.com.my/api/auth/google?next=/'), true);
  assert.equal(isGoogleStartUrl('https://accounts.google.com/'), false);
  assert.equal(isGoogleStartUrl('https://snapreceiptai.friction.com.my/api/auth/google/other'), false);
});

test('only safe user-facing external protocols reach the operating system', () => {
  assert.equal(isSafeExternalUrl('https://example.com/support'), true);
  assert.equal(isSafeExternalUrl('mailto:management@friction.com.my'), true);
  assert.equal(isSafeExternalUrl('tel:+60123456789'), true);
  assert.equal(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe'), false);
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
  assert.equal(isSafeExternalUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeExternalUrl('ms-settings:privacy'), false);
});
