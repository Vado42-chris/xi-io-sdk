#!/usr/bin/env node
// Reproducible SDK coverage audit for the north-star playground decision.
// Reads only this repository. Reports the UI component denominator from src/catalog/primitives.json,
// the demo entries in playground/playground.mjs, and renderer presence in src/.
// Exit 0 always (it reports); the numbers are the evidence. Run from the repo root:
//   node scripts/audit-playground-coverage.mjs
import fs from 'node:fs';
const cat = JSON.parse(fs.readFileSync('src/catalog/primitives.json', 'utf8'));
const comps = cat.primitives.filter((p) => p.kind === 'component').map((p) => p.name || p.id);
const pg = fs.readFileSync('playground/playground.mjs', 'utf8');
const demos = [...pg.matchAll(/^\s*'?([a-z][a-z0-9-]*)'?\s*:\s*\(\)\s*=>/gm)].map((m) => m[1]);
const srcText = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = `${d}/${f.name}`; if (f.isDirectory()) walk(p); else if (f.name.endsWith('.mjs')) srcText.push(fs.readFileSync(p, 'utf8')); } };
walk('src');
const src = srcText.join('\n');
const pascal = (s) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
// Explicit aliases: catalog names whose renderer uses a different export name.
const RENDERER_ALIASES = { toast: "renderToastStack" };
const hasRenderer = (c) => new RegExp(`\\b${RENDERER_ALIASES[c] || `render${pascal(c)}`}\\b`).test(src);
console.log(`UI_COMPONENTS ${comps.length}`);
console.log(`DEMO_ENTRIES ${demos.length}`);
console.log(`WITHOUT_DEMO ${comps.filter((c) => !demos.includes(c)).join(',') || 'none'}`);
console.log(`WITHOUT_RENDERER_NAME ${comps.filter((c) => !hasRenderer(c)).join(',') || 'none'}`);
console.log(`KNOWN_GAPS ${cat.known_gaps.join(',')}`);
