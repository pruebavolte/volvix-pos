// Safe regex-based JS minifier — preserves strings, template literals, and regex literals.
// Strips comments, collapses whitespace, removes blank lines.
const fs = require('fs');

function minify(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  // Track previous non-space char to disambiguate '/' as regex vs division
  let prevNonSpace = '';
  const regexCanFollow = (c) => {
    if (!c) return true;
    return /[=,;:!&|?{}()\[\]+\-*%~<>^\n]/.test(c) || c === '\0';
  };

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    // Line comment
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // String literals
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      out += c; i++;
      while (i < n) {
        const ch = src[i];
        if (ch === '\\') { out += ch + (src[i+1] || ''); i += 2; continue; }
        if (ch === q) { out += ch; i++; break; }
        // template literal ${...}
        if (q === '`' && ch === '$' && src[i+1] === '{') {
          out += '${'; i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            const cc = src[i];
            if (cc === '{') depth++;
            else if (cc === '}') { depth--; if (depth === 0) { out += '}'; i++; break; } }
            // Recursively handle nested strings
            if (cc === '"' || cc === "'" || cc === '`') {
              const nq = cc; out += cc; i++;
              while (i < n) {
                const cn = src[i];
                if (cn === '\\') { out += cn + (src[i+1] || ''); i += 2; continue; }
                if (cn === nq) { out += cn; i++; break; }
                out += cn; i++;
              }
              continue;
            }
            out += cc; i++;
          }
          continue;
        }
        out += ch; i++;
      }
      prevNonSpace = q;
      continue;
    }
    // Regex literal
    if (c === '/' && regexCanFollow(prevNonSpace)) {
      // Heuristic: must look like a regex (not division). Check if a closing / exists on same line.
      let j = i + 1;
      let inClass = false;
      let valid = false;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '\n') break;
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) { valid = true; break; }
        j++;
      }
      if (valid) {
        // include flags
        let k = j + 1;
        while (k < n && /[a-z]/.test(src[k])) k++;
        out += src.slice(i, k);
        i = k;
        prevNonSpace = '/';
        continue;
      }
    }
    // Whitespace collapse
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      // Look at last out char and next non-ws char
      let j = i;
      while (j < n && /\s/.test(src[j])) j++;
      const prev = out[out.length - 1] || '';
      const next = src[j] || '';
      const isWord = (ch) => /[A-Za-z0-9_$]/.test(ch);
      const needSpace = (isWord(prev) && isWord(next)) ||
                        (prev === '+' && next === '+') ||
                        (prev === '-' && next === '-') ||
                        (prev === '+' && next === '=') === false && false; // keep simple
      // Need to keep space between word chars, and between certain operator combos
      let keep = false;
      if (isWord(prev) && isWord(next)) keep = true;
      // Avoid joining ++ + + into +++ ambiguity
      if ((prev === '+' && next === '+') || (prev === '-' && next === '-')) keep = true;
      if (keep) out += ' ';
      i = j;
      continue;
    }
    out += c;
    prevNonSpace = c;
    i++;
  }
  // Drop empty lines (no real newlines remain unless inside strings, which we kept)
  return out;
}

const files = [
  'volvix-i18n-wiring.js',
  'volvix-extras-wiring.js',
  'volvix-multipos-extra-wiring.js'
];

const results = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const min = minify(src);
  const outName = f.replace(/\.js$/, '.min.js');
  fs.writeFileSync(outName, min, 'utf8');
  const before = Buffer.byteLength(src, 'utf8');
  const after = Buffer.byteLength(min, 'utf8');
  results.push({ file: f, out: outName, before, after, saved: before - after, pct: ((1 - after/before)*100).toFixed(1) });
}
console.log(JSON.stringify(results, null, 2));
