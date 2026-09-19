import path from 'node:path';
import crypto from 'node:crypto';

export const WORKSPACE_ARTIFACT_INTENT_SCHEMA = 'xiio.workspace-artifact-intent/v1';

const ARCHIVE_EXTENSIONS = ['.zip', '.tar', '.tgz', '.tar.gz', '.7z', '.rar', '.gz', '.bz2', '.xz'];
const TEXT_EXTENSIONS = new Set([
  '.txt','.md','.mdx','.json','.jsonl','.yaml','.yml','.toml','.ini','.cfg','.conf','.csv','.tsv',
  '.js','.mjs','.cjs','.ts','.tsx','.jsx','.css','.scss','.html','.htm','.xml','.sh','.py','.rs','.go',
  '.java','.kt','.c','.h','.cpp','.hpp','.sql','.graphql','.gql','.log',
]);
const BINARY_EXTENSIONS = new Set([
  '.pdf','.png','.jpg','.jpeg','.gif','.webp','.ico','.bmp','.tif','.tiff','.mp3','.wav','.ogg','.mp4',
  '.mov','.avi','.mkv','.wasm','.bin','.exe','.dll','.so','.dylib','.deb','.rpm',
]);
const SAFE_SEGMENT = /^[A-Za-z0-9._ -]+$/;

function stableRef(raw) {
  return `workspace-artifact:${crypto.createHash('sha256').update(String(raw)).digest('hex').slice(0,24)}`;
}

function normalizeRelative(value) {
  const raw = String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!raw || raw.includes('\0') || raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) return null;
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '..' || part === '.' || !SAFE_SEGMENT.test(part))) return null;
  return parts.join('/');
}

function extensionFor(candidate) {
  const lower = candidate.toLowerCase();
  const compound = ARCHIVE_EXTENSIONS.find((ext) => lower.endsWith(ext));
  return compound || path.posix.extname(lower);
}

function classifyArtifact(candidate) {
  const ext = extensionFor(candidate);
  if (ARCHIVE_EXTENSIONS.includes(ext)) return { artifact_class: 'ARCHIVE', operation: 'INSPECT_ARCHIVE' };
  if (TEXT_EXTENSIONS.has(ext) || !ext) return { artifact_class: 'TEXT', operation: 'READ_TEXT' };
  if (BINARY_EXTENSIONS.has(ext)) return { artifact_class: 'BINARY', operation: 'INSPECT_BINARY_METADATA' };
  return { artifact_class: 'UNKNOWN', operation: 'INSPECT_ARTIFACT' };
}

function quotedTokens(raw) {
  const out = [];
  const re = /(["'`])([^\n"'`]+?)\1/g;
  let match;
  while ((match = re.exec(raw))) out.push(match[2].trim());
  return out;
}

function unquotedPathTokens(raw) {
  const out = [];
  const re = /\b(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\.[A-Za-z0-9.]{1,10}\b/g;
  let match;
  while ((match = re.exec(raw))) out.push(match[0].trim());
  return out;
}

function fileLike(token) {
  const normalized = normalizeRelative(token);
  if (!normalized) return null;
  const base = path.posix.basename(normalized);
  return /\.[A-Za-z0-9.]{1,12}$/.test(base) ? normalized : null;
}

function unsafeBasenameCandidates(raw) {
  const out = [];
  const re = /(?:^|[\s"'\`])((?:\.\.\/|\/|[A-Za-z]:\\)[^\s"'\`]+?)(?=$|[\s"'\`])/g;
  let match;
  while ((match = re.exec(raw))) {
    const normalizedSeparators = match[1].replace(/\\/g, '/');
    const base = path.posix.basename(normalizedSeparators);
    if (/^[A-Za-z0-9._ -]+\.[A-Za-z0-9.]{1,12}$/.test(base)) out.push(base);
  }
  return [...new Set(out)];
}

function explicitlyWorkspaceRoot(raw) {
  return /\b(?:current\s+(?:working\s+)?directory|workspace\s+root|root\s+of\s+the\s+workspace|root\s+of\s+workspace|workspace-relative|in\s+the\s+workspace)\b/i.test(raw);
}

function folderLike(token) {
  const normalized = normalizeRelative(token);
  if (!normalized || normalized.includes('.')) return null;
  return normalized;
}

function nearestFolderPhrase(raw, fileToken) {
  const escaped = fileToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`(["'])${escaped}\\1\\s+(?:inside|in|under|within)\\s+(?:the\\s+)?(["'])([^"']+)\\2\\s*(?:folder|directory)?`, 'i'),
    new RegExp(`(?:inside|in|under|within)\\s+(?:the\\s+)?(["'])([^"']+)\\1\\s*(?:folder|directory)?[^\\n]{0,100}(["'])${escaped}\\3`, 'i'),
  ];
  for (const [index, pattern] of patterns.entries()) {
    const match = raw.match(pattern);
    const folder = index === 0 ? match?.[3] : match?.[2];
    if (folder) return folderLike(folder);
  }
  return null;
}

export function resolveWorkspaceArtifactIntent(rawInput) {
  const raw = String(rawInput ?? '');
  if (!raw.trim()) throw new Error('RAW_INPUT_REQUIRED');

  const quoted = quotedTokens(raw);
  const directPaths = [...new Set([...unquotedPathTokens(raw), ...quoted.filter((token) => token.includes('/'))])]
    .map(normalizeRelative)
    .filter(Boolean);

  const quotedFiles = [...new Set(quoted.map(fileLike).filter(Boolean))];
  const inferred = [];
  for (const file of quotedFiles) {
    if (file.includes('/')) {
      inferred.push(file);
      continue;
    }
    const folder = nearestFolderPhrase(raw, file);
    inferred.push(folder ? `${folder}/${file}` : file);
  }

  const candidates = [...new Set([...directPaths, ...inferred])].map(normalizeRelative).filter(Boolean);
  const unsafeMention = /(?:^|\s)(?:\.\.\/|\/[^\s]+|[A-Za-z]:\\)/.test(raw);
  const recoverableUnsafeBasenames = explicitlyWorkspaceRoot(raw) ? unsafeBasenameCandidates(raw) : [];
  for (const base of recoverableUnsafeBasenames) if (!candidates.includes(base)) candidates.push(base);
  let state = 'UNKNOWN';
  let resolved_path = null;
  let owner_reprompt_needed = true;
  let reason = 'NO_SAFE_ARTIFACT_PATH_RESOLVED';

  if (unsafeMention && candidates.length === 0) {
    state = 'BLOCKED';
    reason = 'UNSAFE_PATH_MENTION';
  } else if (candidates.length === 1) {
    state = 'RESOLVED';
    resolved_path = candidates[0];
    owner_reprompt_needed = false;
    reason = unsafeMention && recoverableUnsafeBasenames.includes(resolved_path)
      ? 'UNSAFE_PATH_RECOVERED_TO_WORKSPACE_ROOT'
      : 'UNIQUE_SAFE_WORKSPACE_RELATIVE_PATH';
  } else if (candidates.length > 1) {
    state = 'NEEDS_DISAMBIGUATION';
    reason = 'MULTIPLE_SAFE_ARTIFACT_CANDIDATES';
  }

  const classification = resolved_path
    ? classifyArtifact(resolved_path)
    : { artifact_class: 'UNKNOWN', operation: 'UNKNOWN' };

  return Object.freeze({
    schema: WORKSPACE_ARTIFACT_INTENT_SCHEMA,
    raw_ref: stableRef(raw),
    raw_preserved: true,
    state,
    resolved_path,
    candidates: Object.freeze(candidates),
    artifact_class: classification.artifact_class,
    requested_operation: classification.operation,
    owner_reprompt_needed,
    reason,
    authority_granted: false,
    effect_ceiling: 'NO_EFFECT_RESOLUTION_ONLY',
    hard: Object.freeze([
      'NATURAL_LANGUAGE_PATH_HINT!=OWNER_REPROMPT',
      'TEXT_READ_TOOL!=ARCHIVE_INSPECTOR',
      'PATH_RESOLUTION!=EXECUTION_AUTHORITY',
      'ARCHIVE_IDENTIFIED!=ARCHIVE_CONTENTS_READ',
      'AMBIGUOUS_PATH!=GUESSED_PATH',
      'PARENT_TRAVERSAL!=WORKSPACE_PATH',
      'WORKSPACE_ROOT_CONTEXT_MAY_SALVAGE_BASENAME',
      'SALVAGED_BASENAME!=PATH_TRAVERSAL_AUTHORITY',
    ]),
  });
}
