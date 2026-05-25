'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '..', 'src', 'renderer.html');
let src;
try {
  src = fs.readFileSync(htmlPath, 'utf8');
} catch (e) {
  console.error('❌ Cannot read renderer.html:', e.message);
  process.exit(1);
}

// Find the main <script> block — largest one containing 'use strict'
const re = /<script(?:\s[^>]*)?>(\s[\s\S]*?)<\/script>/g;
let m, script = null, lineOffset = 0;
while ((m = re.exec(src)) !== null) {
  const body = m[1];
  if (body.includes("'use strict'") && body.length > 5000) {
    script = body;
    lineOffset = src.slice(0, m.index).split('\n').length;
    break;
  }
}

if (!script) {
  console.error('❌ renderer.html: main <script> block not found');
  process.exit(1);
}

try {
  new vm.Script(script, { filename: 'renderer.html', lineOffset: lineOffset });
  console.log('✅ Syntax OK — renderer.html JS is valid (' + script.split('\n').length + ' lines)');
  process.exit(0);
} catch (err) {
  console.error('❌ renderer.html syntax error:');
  console.error('  ', err.message);
  process.exit(1);
}
