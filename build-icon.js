'use strict';
// Converts the app's existing 512x512 PNG icon into the .ico electron-builder needs for
// the Windows installer/exe/taskbar icon. Run once (or whenever the source PNG changes)
// via `npm run icon` — not part of the normal build, since the .ico is committed.
const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

const SRC = path.join(__dirname, 'build', 'icon-source.png');
const OUT = path.join(__dirname, 'build', 'icon.ico');

pngToIco(SRC).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log('Wrote ' + OUT);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
