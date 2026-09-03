'use strict';
// SnapReceipt AI desktop wrapper — thin Electron shell.
//
// Deliberately dumb: this app owns NO business logic. It opens one window pointing at
// the live production web app and gets out of the way. Every feature (auth, receipts,
// AI, exports) is the same web app everyone already uses in a browser — this just gives
// it its own icon, its own window, and its own taskbar entry, the way Slack/Discord/
// Claude desktop wrap their web apps.
//
// Security: the loaded page is untrusted remote content (a real website), so it gets
// NO node access (contextIsolation on, nodeIntegration off, sandbox on) — same posture
// a normal browser tab has. Nothing here changes if the web app's own code changes.
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const { APP_URL } = require('./config');
const { signInWithGoogle } = require('./google-auth');

// Only the app's own origin is allowed to navigate IN the app window. Google Sign-In used to
// be on this list too (accounts.google.com), so the OAuth redirect would navigate in-window —
// exactly the broken flow docs/specs/2026-08-29-desktop-google-oauth-loopback.md (snapreceipt-
// ai repo) diagnoses: this window's cookie store has never signed into Google, so that screen
// showed a raw manual "Email or phone" form instead of the account chooser, and Google can
// outright refuse the whole flow as an untrusted embedded browser. Google Sign-In is now
// intercepted below (isGoogleAuthStartUrl) BEFORE it ever leaves for accounts.google.com, and
// runs in the user's real system browser instead (google-auth.js) — so accounts.google.com no
// longer needs (or gets) an in-window navigation allowance. Anything else not on this list
// opens in the user's real browser instead of turning this wrapper into a general browser.
const ALLOWED_NAV_HOSTS = ['snapreceiptai.friction.com.my'];

function isAllowedHost(urlString) {
  try {
    const host = new URL(urlString).hostname;
    return ALLOWED_NAV_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch (e) {
    return false;
  }
}

// isGoogleAuthStartUrl(url) -> true only for THIS app's own /api/auth/google start endpoint
// (what public/js/app.js's onGoogleLogin navigates to via `location.href`) — never for
// accounts.google.com itself, which this app should never navigate to in-window at all.
function isGoogleAuthStartUrl(urlString) {
  try {
    const u = new URL(urlString);
    return u.hostname === new URL(APP_URL).hostname && u.pathname === '/api/auth/google';
  } catch (e) {
    return false;
  }
}

// Runs the system-browser loopback flow, then hands the result to the loaded page as a URL
// fragment — the SAME #gauth_token=...|#gauth_error=<code> contract the web/Android Google
// flows already use (see snapreceipt-ai's public/js/app.js boot()), so the page's own session
// handling picks this up with zero changes on that side.
async function handleGoogleSignIn() {
  try {
    const result = await signInWithGoogle();
    const params = new URLSearchParams({ gauth_token: result.token, gauth_role: result.role, gauth_name: result.name });
    if (result.isNew) { params.set('gauth_new', '1'); params.set('gauth_bind', result.bindToken || ''); }
    mainWindow.loadURL(APP_URL + '?desktop=1&_t=' + Date.now() + '#' + params.toString());
  } catch (e) {
    const params = new URLSearchParams({ gauth_error: (e && e.code) || 'failed' });
    mainWindow.loadURL(APP_URL + '?desktop=1&_t=' + Date.now() + '#' + params.toString());
  }
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#fbfaf7', // matches manifest.webmanifest background_color — no white flash on load
    icon: path.join(__dirname, 'build', 'icon.ico'),
    title: 'SnapReceipt AI',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  mainWindow.loadURL(APP_URL + '?desktop=1');

  // Google Sign-In is intercepted here — BEFORE the server's redirect ever sends this window
  // toward accounts.google.com — and run in the system browser instead (see google-auth.js's
  // header comment for why). The app itself keeps navigating in-window; everything else
  // (support links, "Privacy Policy" footer, etc.) goes to the user's default browser.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isGoogleAuthStartUrl(url)) {
      event.preventDefault();
      handleGoogleSignIn();
      return;
    }
    if (!isAllowedHost(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // window.open()/target=_blank: same-origin opens in this window, Google Sign-In takes the
  // same system-browser detour as the will-navigate handler above, anything else goes to the
  // system browser. Never spawns an unrestricted Electron child window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isGoogleAuthStartUrl(url)) {
      handleGoogleSignIn();
    } else if (isAllowedHost(url)) {
      mainWindow.loadURL(url);
    } else {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Single instance — a second launch focuses the existing window instead of opening a
// duplicate app (matches how every other desktop app on Windows behaves).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null); // no File/Edit/View bar — this is an app, not a browser
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
