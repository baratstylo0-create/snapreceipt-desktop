# SnapReceipt AI desktop

Electron wrapper for the SnapReceipt AI production site. Remote page content stays sandboxed:
Node integration is disabled and external links open in the system browser.

## Desktop Google sign-in

The desktop Google flow follows RFC 8252: it opens the user's default browser, uses a
`127.0.0.1` loopback callback with PKCE and state validation, then exchanges the resulting
Google ID token with SnapReceipt's `/api/auth/google/native` endpoint. It never embeds
Google's account page in Electron.

Before building a release, create a separate **Desktop app** OAuth client in the existing
Google Cloud project and supply its public client ID to the build environment:

```powershell
$env:GOOGLE_DESKTOP_CLIENT_ID = 'your-desktop-client-id.apps.googleusercontent.com'
npm run build:win
```

The corresponding backend deployment needs the same value as
`GOOGLE_DESKTOP_CLIENT_ID`. Do not add a Google client secret to this application: desktop
clients are public, and PKCE protects the authorization-code exchange.

## Windows signing

Unsigned EXEs trigger Microsoft SmartScreen. The interim download note is on the website;
the production fix requires an Authenticode certificate and CI signing configuration. See
the canonical runbook in SnapReceipt AI:
`docs/ops/2026-08-29-windows-code-signing.md`.
