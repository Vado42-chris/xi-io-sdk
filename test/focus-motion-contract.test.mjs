import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Regression check: the universal focus and reduced-motion contract must keep its rules.
// Falsifier: removing the reduced-motion block or the focus-visible rule fails this test.
const css = fs.readFileSync(new URL('../src/accessibility/focus-motion.css', import.meta.url), 'utf8');

test('reduced-motion block disables animation and transition durations', () => {
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(block, 'prefers-reduced-motion block missing');
  assert.match(block[1], /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(block[1], /transition-duration:\s*0\.01ms\s*!important/);
});

test('focus-visible draws a visible ring with tokenized width, offset and colour', () => {
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*var\(--xiio-focus-ring-width\)\s+solid\s+var\(--xiio-focus-ring-color\)/);
  assert.match(css, /outline-offset:\s*var\(--xiio-focus-ring-offset\)/);
  assert.match(css, /--xiio-focus-ring-width:\s*2px/);
});
