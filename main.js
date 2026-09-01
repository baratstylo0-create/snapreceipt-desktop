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
const { app, BrowserWindow, shell, Menu, safeStorage, dialog } = require('electron');
const fs = require('node:fs');
const path = require('path');
const { beginDesktopGoogleSignIn } = require('./desktop-auth');

const { isAllowedAppUrl, isGoogleStartUrl, isSafeExternalUrl } = require('./navigation-policy');
const APP_URL = 'https://snapreceiptai.friction.com.my/';
// Public installed-app identifier (not a secret). It must be set to the Google Cloud
// Console's separate "Desktop app" client before a release build. Release packaging
// generates build-config.js from the CI/build environment; a runtime override exists only
// for controlled QA. A missing file is safe for development: Google sign-in stays disabled.
let packagedGoogleDesktopClientId = '';
try { packagedGoogleDesktopClientId = require('./build-config').GOOGLE_DESKTOP_CLIENT_ID || ''; } catch (e) { /* no release config in source */ }
const GOOGLE_DESKTOP_CLIENT_ID = process.env.GOOGLE_DESKTOP_CLIENT_ID || packagedGoogleDesktopClientId;
let mainWindow = null;
let googleSignInInProgress = false;
let restoredEncryptedSession = false;

function sessionFile() {
  return path.join(app.getPath('userData'), 'snapreceipt-session.bin');
}

function saveEncryptedSession(session) {
  // Desktop sign-in never writes the bearer to Chromium's persistent localStorage.
  // On Windows/macOS, Electron safeStorage encrypts it with the OS credential service.
  if (!safeStorage.isEncryptionAvailable()) return false;
  const raw = JSON.stringify({ token: session.token, role: session.role, name: session.name || '' });
  fs.writeFileSync(sessionFile(), safeStorage.encryptString(raw), { mode: 0o600 });
  return true;
}

function loadEncryptedSession() {
  try {
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(sessionFile())) return null;
    const parsed = JSON.parse(safeStorage.decryptString(fs.readFileSync(sessionFile())));
    return parsed && typeof parsed.token === 'string' && parsed.token ? parsed : null;
  } catch (e) {
    // An unreadable old keychain item must not brick the app. Remove only this local,
    // encrypted cache and make the user sign in again; never report its contents.
    try { fs.unlinkSync(sessionFile()); } catch (ignore) { /* ignore */ }
    return null;
  }
}

async function injectSessionIntoCurrentPage(session) {
  if (!mainWindow || !isAllowedAppUrl(mainWindow.webContents.getURL())) return false;
  // Values are JSON-encoded into a constant script; no user-controlled text becomes code.
  // sessionStorage is intentionally short-lived. A later app launch restores it only from
  // the OS-encrypted safeStorage cache above.
  const token = JSON.stringify(session.token);
  const sessionInfo = JSON.stringify(JSON.stringify({ role: session.role || 'owner', branch_id: null, display_name: session.name || '' }));
  await mainWindow.webContents.executeJavaScript(
    'sessionStorage.setItem("dashboard_token", ' + token + ');'
      + 'sessionStorage.setItem("session_info", ' + sessionInfo + ');'
      + 'window.location.replace(' + JSON.stringify(APP_URL) + ');',
    true,
  );
  return true;
}

async function restoreEncryptedSession() {
  if (restoredEncryptedSession) return;
  restoredEncryptedSession = true;
  const session = loadEncryptedSession();
  if (!session) return;
  try { await injectSessionIntoCurrentPage(session); } catch (e) { /* login gate remains available */ }
}

async function startGoogleSignIn() {
  if (googleSignInInProgress || !mainWindow) return;
  googleSignInInProgress = true;
  try {
    const session = await beginDesktopGoogleSignIn({
      clientId: GOOGLE_DESKTOP_CLIENT_ID,
      appUrl: APP_URL,
      openExternal: shell.openExternal,
    });
    saveEncryptedSession(session);
    await injectSessionIntoCurrentPage(session);
    if (session.is_new && session.bind_token) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Account created',
        message: 'Your SnapReceipt account is ready.',
        detail: 'Connect Telegram from Settings when the dashboard opens.',
      });
    }
  } catch (e) {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Google sign-in could not finish',
      message: 'Return to SnapReceipt and try again.',
      detail: String(e && e.message ? e.message : 'Unexpected sign-in error'),
    });
  } finally {
    googleSignInInProgress = false;
  }
}

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
      spellcheck: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
    }
  });

  mainWindow.loadURL(APP_URL);

  const handleNavigation = (event, url) => {
    if (isGoogleStartUrl(url)) {
      event.preventDefault();
      void startGoogleSignIn();
      return;
    }
    if (!isAllowedAppUrl(url)) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) void shell.openExternal(url);
    }
  };

  // Google is an installed-app OAuth flow, never an embedded Electron flow. Catch the
  // existing web button before its first request; the main process opens the system browser
  // with PKCE + loopback instead. Other external links remain in the system browser.
  mainWindow.webContents.on('will-navigate', handleNavigation);
  // Redirects have their own Electron event. Enforcing the same policy here prevents
  // a compromised page or redirect endpoint from escaping the app-origin boundary.
  mainWindow.webContents.on('will-redirect', handleNavigation);

  // The wrapper has no need to embed arbitrary webviews. Denying them prevents remote
  // content from creating a second renderer with a different security configuration.
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

  // window.open()/target=_blank: same-origin opens in this window, anything else goes
  // to the system browser. Never spawns an unrestricted Electron child window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isGoogleStartUrl(url)) {
      void startGoogleSignIn();
      return { action: 'deny' };
    }
    if (isAllowedAppUrl(url)) {
      mainWindow.loadURL(url);
    } else if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-finish-load', () => { void restoreEncryptedSession(); });

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
