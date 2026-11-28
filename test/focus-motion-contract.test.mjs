import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Regression checks for the focus and reduced-motion contract.
// Falsifiers: stripping the reduced-motion block fails test 1; removing the surface scope fails test 2;
// removing the playground link or root class fails test 3.
const css = fs.readFileSync(new URL('../src/accessibility/focus-motion.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../playground/index.html', import.meta.url), 'utf8');

test('reduced-motion block disables animation and transition durations inside the surface', () => {
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(block, 'prefers-reduced-motion block missing');
  assert.match(block[1], /\.xiio-surface \*/);
  assert.match(block[1], /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(block[1], /transition-duration:\s*0\.01ms\s*!important/);
});

test('every selector is scoped to .xiio-surface (no global restyling of host pages)', () => {
  const selectorsOnly = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '').replace(/\{[^}]*\}/g, '{').split('{').slice(0, -1).map((s) => s.trim()).filter(Boolean);
  const unscoped = selectorsOnly.flatMap((s) => s.split(',').map((x) => x.trim())).filter((s) => s && !s.startsWith('.xiio-surface'));
  assert.deepEqual(unscoped, [], `unscoped selectors: ${unscoped.join(' | ')}`);
});

test('the SDK playground is a real consumer: it links the contract and carries the surface root', () => {
  assert.match(html, /<link rel="stylesheet" href="\.\.\/src\/accessibility\/focus-motion\.css">/, 'playground does not link focus-motion.css');
  assert.match(html, /<body class="[^"]*\bxiio-surface\b/, 'playground body lacks the xiio-surface root class');
});
