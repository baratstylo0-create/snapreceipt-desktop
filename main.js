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

const APP_URL = 'https://snapreceiptai.friction.com.my/';
// OAuth (Google Sign-In) redirects through accounts.google.com before bouncing back to
// APP_URL — these origins are allowed to navigate IN the app window. Anything else opens
// in the user's real browser instead of turning this wrapper into a general browser.
const ALLOWED_NAV_HOSTS = ['snapreceiptai.friction.com.my', 'accounts.google.com'];

function isAllowedHost(urlString) {
  try {
    const host = new URL(urlString).hostname;
    return ALLOWED_NAV_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch (e) {
    return false;
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

  mainWindow.loadURL(APP_URL);

  // Keep OAuth + the app itself navigating in-window; send everything else (support
  // links, "Privacy Policy" footer, etc.) to the user's default browser.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedHost(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // window.open()/target=_blank: same-origin opens in this window, anything else goes
  // to the system browser. Never spawns an unrestricted Electron child window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedHost(url)) {
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
