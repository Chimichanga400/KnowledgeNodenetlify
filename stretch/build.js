// Bundle index.html + style.css + app.js (+ icon + manifest) into stretch-the-rand.html
const fs = require('fs');
const path = require('path');
const D = __dirname;
let html = fs.readFileSync(path.join(D, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(D, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(D, 'app.js'), 'utf8');
const icon = fs.readFileSync(path.join(D, 'icon.svg'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(D, 'manifest.json'), 'utf8'));
const iconUri = 'data:image/svg+xml,' + encodeURIComponent(icon.trim());
manifest.icons[0].src = iconUri;
delete manifest.start_url; delete manifest.scope;
const manifestUri = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(manifest));
html = html
  .replace('<link rel="manifest" href="manifest.json" />', '<link rel="manifest" href="' + manifestUri + '" />')
  .replace('<link rel="icon" href="icon.svg" type="image/svg+xml" />', '<link rel="icon" href="' + iconUri + '" type="image/svg+xml" />')
  .replace('<link rel="apple-touch-icon" href="icon.svg" />', '')
  .replace('<link rel="stylesheet" href="style.css" />', '<style>\n' + css + '\n  </style>')
  .replace('<script src="app.js"></script>', '<script>\n' + js + '\n  </script>');
html = '<!-- Stretch the Rand — single-file build. Generated from stretch/index.html + style.css + app.js. -->\n' + html;
fs.writeFileSync(path.join(D, 'stretch-the-rand.html'), html);
console.log('built stretch-the-rand.html (' + fs.statSync(path.join(D, 'stretch-the-rand.html')).size + ' bytes)');
