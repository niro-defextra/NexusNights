// tools/verify/css-integrity.mjs
// Gate 4: CSS files are well-formed (no orphan declarations, no stray !important,
// no competing focus overrides, no forbidden netflix-upgrade.css). No browser needed.
import fs from 'node:fs';
import path from 'node:path';

const CSS_DIR = path.join(process.cwd(), 'css');
const MARKER = 'CSS INTEGRITY OK';
const IMPORTANT_SCOPE = ['global.css', 'components.css', 'pages.css'];
const FORBIDDEN = 'netflix-upgrade.css';

const failures = [];
let files = [];
try {
  files = fs.readdirSync(CSS_DIR).filter((f) => f.toLowerCase().endsWith('.css'));
} catch (err) {
  console.log('css-integrity.mjs FAILED (1 problem(s)):');
  console.log('  * cannot read css/ directory: ' + err.message);
  process.exit(1);
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

// Collect selector/body pairs for every rule (handles nested at-rules).
function parseRules(file, text) {
  const clean = stripComments(text);
  const rules = [];
  const stack = [];
  let lastDelim = -1;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '{') { stack.push({ start: lastDelim + 1, end: i }); lastDelim = i; }
    else if (ch === '}') {
      const r = stack.pop();
      lastDelim = i;
      if (r) rules.push({ file, prelude: clean.slice(r.start, r.end), body: clean.slice(r.end + 1, i) });
    } else if (ch === ';') { lastDelim = i; }
  }
  return rules;
}

if (files.includes(FORBIDDEN)) failures.push(FORBIDDEN + ': forbidden file exists and must be removed');

const importantHits = [];
let importantScopedTotal = 0;
const focusRules = [];

for (const file of files) {
  const raw = fs.readFileSync(path.join(CSS_DIR, file), 'utf8');
  const rawLines = raw.split(/\r?\n/);
  const cleanLines = stripComments(raw).split(/\r?\n/);

  // (a) orphan declarations: a declaration-looking line at brace depth 0.
  let depth = 0;
  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i];
    if (depth === 0 && /^\s*[a-z-]+\s*:\s*[^;{}]+;\s*$/.test(line)) {
      failures.push(file + ':' + (i + 1) + ': orphan declaration outside any rule -> "' + line.trim() + '"');
    }
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);
    }
  }

  // (b) !important occurrences.
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].indexOf('!important') !== -1) {
      importantHits.push(file + ':' + (i + 1) + ': ' + rawLines[i].trim().slice(0, 120));
      if (IMPORTANT_SCOPE.includes(file)) importantScopedTotal++;
    }
  }

  // (c) focus rules that also set outline/box-shadow.
  for (const rule of parseRules(file, raw)) {
    const sel = rule.prelude.trim().replace(/\s+/g, ' ');
    if (!sel || sel.charAt(0) === '@') continue;
    const hasFocus = /:focus\b|\.focused\b/.test(sel);
    const hasVisual = /(outline|box-shadow)\s*:/.test(rule.body);
    if (hasFocus && hasVisual) focusRules.push(file + ' :: ' + sel.slice(0, 160));
  }
}

if (importantHits.length) {
  console.log('!important occurrences (' + importantHits.length + '):');
  for (const h of importantHits.slice(0, 40)) console.log('  - ' + h);
}
if (importantScopedTotal > 0) {
  failures.push('!important count across ' + IMPORTANT_SCOPE.join('/') + ' is ' + importantScopedTotal + ' (must be 0)');
}

if (focusRules.length) {
  console.log('focus rules setting outline/box-shadow (' + focusRules.length + '):');
  for (const s of focusRules) console.log('  - ' + s);
}
if (focusRules.length > 3) {
  failures.push('competing focus definitions = ' + focusRules.length + ' (must be <= 3)');
}

if (failures.length) {
  console.log('css-integrity.mjs FAILED (' + failures.length + ' problem(s)):');
  for (const f of failures) console.log('  * ' + f);
  process.exit(1);
}
console.log(MARKER);
process.exit(0);
