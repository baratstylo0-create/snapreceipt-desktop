const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const script = path.join(repoRoot, 'scripts', 'prepare-store-build-config.js');
const generatedConfig = path.join(repoRoot, 'store-build-config.json');

test('Electron package includes every runtime module imported by main', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.ok(packageJson.build.files.includes('main.js'));
  assert.ok(packageJson.build.files.includes('desktop-auth.js'));
  assert.ok(packageJson.build.files.includes('navigation-policy.js'));
});

test('Store package preparation refuses missing Partner Center identity metadata', () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    env: { ...process.env },
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Partner Center metadata/);
});

test('Store package preparation writes only the supplied identity metadata', () => {
  const previousConfig = fs.existsSync(generatedConfig)
    ? fs.readFileSync(generatedConfig)
    : null;
  try {
    execFileSync(process.execPath, [script], {
      cwd: repoRoot,
      env: {
        ...process.env,
        WINDOWS_STORE_IDENTITY_NAME: 'SnapReceiptAI.QA',
        WINDOWS_STORE_PUBLISHER: 'CN=SnapReceiptAI-QA',
        WINDOWS_STORE_PUBLISHER_DISPLAY_NAME: 'SnapReceipt AI QA',
        WINDOWS_STORE_APPLICATION_ID: 'SnapReceiptAI',
      },
      stdio: 'pipe',
    });

    const config = JSON.parse(fs.readFileSync(generatedConfig, 'utf8'));
    assert.deepEqual(config, {
      win: { target: [{ target: 'appx', arch: ['x64'] }] },
      appx: {
        applicationId: 'SnapReceiptAI',
        identityName: 'SnapReceiptAI.QA',
        publisher: 'CN=SnapReceiptAI-QA',
        publisherDisplayName: 'SnapReceipt AI QA',
        displayName: 'SnapReceipt AI',
        artifactName: 'SnapReceipt-AI-Store.appx',
        languages: ['en-US'],
        capabilities: ['runFullTrust'],
      },
    });
  } finally {
    if (previousConfig === null) {
      if (fs.existsSync(generatedConfig)) fs.unlinkSync(generatedConfig);
    } else {
      fs.writeFileSync(generatedConfig, previousConfig);
    }
  }
});
