# SnapReceipt AI desktop

Electron wrapper for the SnapReceipt AI production site. Remote page content remains
sandboxed with Node integration disabled; external links are opened in the system browser.

## Google sign-in

Google sign-in uses the system browser, a one-shot `127.0.0.1` loopback callback, PKCE, and
state validation. It does not embed Google's account page inside Electron. The backend
client ID is public OAuth configuration; no Google client secret belongs in this app.

## Windows release paths

`npm run build:win` is the direct-download release command and fails closed unless signing
configuration is present. It verifies Authenticode signatures on the installer and every
Windows executable payload, rejects expired certificates, and writes a SHA-256 manifest.
`npm run build:win:qa` is for local unsigned QA only and must never be published.

For distribution without purchasing a certificate, use the Microsoft Store path:

```powershell
$env:WINDOWS_STORE_IDENTITY_NAME = 'value-from-partner-center'
$env:WINDOWS_STORE_PUBLISHER = 'CN=value-from-partner-center'
$env:WINDOWS_STORE_PUBLISHER_DISPLAY_NAME = 'SnapReceipt AI'
$env:WINDOWS_STORE_APPLICATION_ID = 'SnapReceiptAI'
npm run build:win:store:qa
```

The Store build validates Partner Center identity metadata, creates an AppX submission
package, checks its manifest and checksum, and clearly marks it as requiring Microsoft
Store signing. Do not publish the locally generated unsigned AppX directly.

Direct-download signing and Microsoft Store submission remain separate release gates. The
public download page must stay disabled until the chosen distribution path has produced a
trusted release and its checksum/release record is complete.
