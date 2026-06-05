'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const CleanCSS = require('clean-css');
const { minify } = require('terser');

const SRC = path.join(__dirname, '..', 'src', 'renderer.html');
const OUT = path.join(__dirname, '..', 'src', 'renderer.min.html');

async function build() {
  let src;
  try {
    src = fs.readFileSync(SRC, 'utf8');
  } catch (e) {
    console.error('❌ Cannot read renderer.html:', e.message);
    process.exit(1);
  }

  // ── Locate first CSS block ────────────────────────────────────────────────
  const styleOpen  = src.indexOf('<style>');
  const styleClose = src.indexOf('</style>');
  if (styleOpen === -1 || styleClose === -1) {
    console.error('❌ <style> block not found in renderer.html');
    process.exit(1);
  }
  const cssContent = src.slice(styleOpen + 7, styleClose); // 7 = '<style>'.length

  // ── Locate main JS block (mirrors check-syntax.js logic) ─────────────────
  // Finds the largest <script> block that contains 'use strict' and is >5000 chars.
  // Template literals inside the block use <\/script> (escaped) so the regex
  // correctly stops at the real closing tag.
  const scriptRe = /<script(?:\s[^>]*)?>(\s[\s\S]*?)<\/script>/g;
  let scriptMatch = null;
  let sm;
  while ((sm = scriptRe.exec(src)) !== null) {
    if (sm[1].includes("'use strict'") && sm[1].length > 5000) {
      scriptMatch = sm;
      break;
    }
  }
  if (!scriptMatch) {
    console.error('❌ Main <script> block not found in renderer.html');
    process.exit(1);
  }
  const jsContent       = scriptMatch[1];
  const scriptFullStart = scriptMatch.index;
  const scriptFullEnd   = scriptMatch.index + scriptMatch[0].length;

  // ── Minify CSS ────────────────────────────────────────────────────────────
  const cssResult = new CleanCSS({ level: 1 }).minify(cssContent);
  if (cssResult.errors && cssResult.errors.length > 0) {
    console.error('❌ CSS minification errors:', cssResult.errors);
    process.exit(1);
  }
  if (cssResult.warnings && cssResult.warnings.length > 0) {
    cssResult.warnings.forEach(w => console.warn('  ⚠ CSS:', w));
  }
  const minCss = cssResult.styles;

  // ── Minify JS ─────────────────────────────────────────────────────────────
  let jsResult;
  try {
    jsResult = await minify(jsContent, {
      compress: { dead_code: false, passes: 1 },
      mangle:   false,
      format:   { comments: false },
    });
  } catch (e) {
    console.error('❌ JS minification failed:', e.message);
    process.exit(1);
  }
  if (!jsResult || !jsResult.code) {
    console.error('❌ terser returned empty output');
    process.exit(1);
  }
  const minJs = jsResult.code;

  // ── Validate minified JS ──────────────────────────────────────────────────
  try {
    new vm.Script(minJs, { filename: 'renderer.min.html' });
  } catch (err) {
    console.error('❌ Minified JS failed vm.Script() validation:', err.message);
    process.exit(1);
  }

  // ── Reconstruct HTML ──────────────────────────────────────────────────────
  // Layout preserved:
  //   [doctype + head open] <style>MINIFIED_CSS</style>
  //   [safe-boot script] [</head>] [<body>] [HTML body] [chart.js]
  //   <script>MINIFIED_JS</script>
  //   [</body></html>]
  const minHtml =
    src.slice(0, styleOpen) +
    '<style>' + minCss + '</style>' +
    src.slice(styleClose + 8, scriptFullStart) +   // 8 = '</style>'.length
    '<script>' + minJs + '</script>' +
    src.slice(scriptFullEnd);

  fs.writeFileSync(OUT, minHtml, 'utf8');

  // ── Report ────────────────────────────────────────────────────────────────
  const srcBytes = Buffer.byteLength(src,     'utf8');
  const outBytes = Buffer.byteLength(minHtml, 'utf8');
  const pct      = (((srcBytes - outBytes) / srcBytes) * 100).toFixed(1);

  console.log('✅ renderer.min.html generated');
  console.log(`   Source:    ${(srcBytes / 1024).toFixed(1)} KB  (${srcBytes.toLocaleString()} bytes)`);
  console.log(`   Minified:  ${(outBytes / 1024).toFixed(1)} KB  (${outBytes.toLocaleString()} bytes)`);
  console.log(`   Reduction: ${pct}%`);
}

build().catch(err => {
  console.error('❌ build-renderer failed:', err.message || err);
  process.exit(1);
});
