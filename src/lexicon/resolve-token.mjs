import catalog from './commands.json' with { type: 'json' };

const RESERVED_PREFIX = /^[#/@]+/;
const BRACKET_TOKEN = /^\[\s*\/?\s*([^\]]+?)\s*\]$/;

function text(value) {
  return String(value ?? '').trim();
}

function normalizedForms(value) {
  const raw = text(value).toLowerCase();
  if (!raw) return [];

  const candidates = [raw];
  const bracket = raw.match(BRACKET_TOKEN);
  if (bracket?.[1]) candidates.push(bracket[1]);

  const forms = new Set();
  for (const candidate of candidates) {
    const stripped = candidate.replace(RESERVED_PREFIX, '').trim();
    const dashed = stripped.replace(/[\s_]+/g, '-');
    for (const form of [candidate, stripped, dashed]) {
      if (form) forms.add(form);
    }
  }
  return [...forms];
}

function commandForms(entry) {
  const forms = new Set();
  for (const value of [entry.id, entry.cli, ...(entry.aliases || []), ...(entry.hashtags || [])]) {
    for (const form of normalizedForms(value)) forms.add(form);
  }
  return forms;
}

export function resolveLexiconCommand(input) {
  const requested = text(input);
  if (!requested) {
    return {
      schema: 'xiio.sdk.lexicon-resolution/v1',
      requested: null,
      state: 'UNKNOWN_COMMAND',
      matches: [],
      authority_granted: false,
      provider_effect: false,
    };
  }

  const requestedForms = new Set(normalizedForms(requested));
  const matches = [];
  for (const entry of catalog.commands) {
    const forms = commandForms(entry);
    if (![...requestedForms].some((form) => forms.has(form))) continue;
    const matchedBy = [...requestedForms].find((form) => forms.has(form)) ?? requested.toLowerCase();
    matches.push({
      id: entry.id,
      cli: entry.cli,
      effect: entry.effect,
      matched_by: matchedBy,
      aliases: [...(entry.aliases || [])],
      hashtags: [...(entry.hashtags || [])],
    });
  }

  matches.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  if (matches.length === 1) {
    return {
      schema: 'xiio.sdk.lexicon-resolution/v1',
      requested,
      state: 'RESOLVED',
      command: matches[0],
      matches,
      authority_granted: false,
      provider_effect: false,
      hard: [
        'ALIAS != SEMANTIC_OWNER',
        'LEXICON_RESOLUTION != AUTHORITY',
        'HASHTAG != EFFECT',
        'AT_REFERENCE != PRINCIPAL',
        'SLASH_COMMAND != ATTEMPT',
        'BBCODE_TOKEN != AUTHORITY',
      ],
    };
  }

  return {
    schema: 'xiio.sdk.lexicon-resolution/v1',
    requested,
    state: matches.length > 1 ? 'AMBIGUOUS_COMMAND' : 'UNKNOWN_COMMAND',
    matches,
    authority_granted: false,
    provider_effect: false,
  };
}
