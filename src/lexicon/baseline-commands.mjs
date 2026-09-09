import fs from 'node:fs';

const catalog = JSON.parse(fs.readFileSync(new URL('./commands.json', import.meta.url), 'utf8'));

export const BASELINE_COMMANDS = Object.freeze(
  Object.fromEntries(
    catalog.commands
      .filter((entry) => entry.id.startsWith('baseline.'))
      .map((entry) => {
        const verb = entry.id.slice('baseline.'.length);
        return [verb, Object.freeze({
          id: entry.id,
          cli: entry.cli,
          aliases: Object.freeze([...(entry.aliases || [])]),
          hashtags: Object.freeze([...(entry.hashtags || [])]),
          purpose: entry.purpose,
          effect: entry.effect,
        })];
      }),
  ),
);

export function normalizeBaselineCommand(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  for (const [verb, meta] of Object.entries(BASELINE_COMMANDS)) {
    if (raw === verb || meta.aliases.map((alias) => alias.toLowerCase()).includes(raw)) {
      return { verb, ...meta };
    }
  }
  return { verb: null, state: 'UNKNOWN_COMMAND', input: raw };
}

export function commandCatalog() {
  return structuredClone(catalog);
}
