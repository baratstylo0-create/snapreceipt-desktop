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

Unsigned EXEs trigger Microsoft SmartScreen and may be blocked by Windows Smart App Control.
The `build:win` command is the signed-release alias; `build:win:qa` is the only command that
may intentionally produce an unsigned local QA artifact. The release command is deliberately
fail-closed:

```powershell
$env:GOOGLE_DESKTOP_CLIENT_ID = 'your-desktop-client-id.apps.googleusercontent.com'
$env:CSC_LINK = 'base64-pfx-from-your-secret-store'
$env:CSC_KEY_PASSWORD = 'pfx-password-from-your-secret-store'
npm run build:win:release
```

It requires the OAuth client ID and signing inputs, uses SHA-256 plus RFC 3161 timestamping,
and rejects the release unless Windows reports a valid Authenticode signature. Never commit a
certificate, password, or generated `build-config.js`.

The Windows workflow is `.github/workflows/build-win.yml`; it runs tests and the dependency
audit before packaging and uploads the installer with a SHA-256 manifest. Configure
`GOOGLE_DESKTOP_CLIENT_ID`, `WINDOWS_CERT_BASE64`, and `WINDOWS_CERT_PASSWORD` as repository
secrets before running it. Microsoft SmartScreen reputation can still take time to build for
new publishers, so signing reduces risk but cannot guarantee zero warnings.

See the canonical runbook in SnapReceipt AI:
`docs/ops/2026-08-29-windows-code-signing.md`.

## Microsoft Store / MSIX route

For a no-certificate direct-download alternative, submit an AppX package through the
Microsoft Store. Microsoft signs the package for Store distribution; a locally generated
`.appx` must not be published directly because it is not trusted by Windows users.

Partner Center must first provide the exact package identity values. The build refuses to
invent or default them:

```powershell
$env:GOOGLE_DESKTOP_CLIENT_ID = 'your-desktop-client-id.apps.googleusercontent.com'
$env:WINDOWS_STORE_IDENTITY_NAME = 'partner-center-identity'
$env:WINDOWS_STORE_PUBLISHER = 'CN=partner-center-publisher'
$env:WINDOWS_STORE_PUBLISHER_DISPLAY_NAME = 'SnapReceipt AI'
$env:WINDOWS_STORE_APPLICATION_ID = 'SnapReceiptAI'
npm run build:win:store:qa
```

`build:win:store:qa` creates and validates a local Store-shaped package. After the
Partner Center listing is accepted, use `npm run build:win:store` for the submission
artifact and upload it to Partner Center. The public download page must stay disabled
until the Store listing is live and its official link replaces the placeholder.

## macOS signing and notarization

The macOS release command also fails closed. It requires a Developer ID application
certificate, Apple notarization credentials, the desktop OAuth client ID, and a successful
`codesign`, Gatekeeper, and notarization-ticket verification. The macOS workflow materializes
the API key only in the ephemeral runner workspace and uploads the DMG plus its checksum
manifest. Configure `MAC_CERT_BASE64`, `MAC_CERT_PASSWORD`, `APPLE_API_KEY_BASE64`,
`APPLE_API_KEY_ID`, and `APPLE_API_ISSUER` as repository secrets; never commit any of them.
