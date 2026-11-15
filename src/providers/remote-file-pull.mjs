/**
 * Remote file pull: copy files from a person's remote storage folder into a local folder without the
 * bytes ever passing through an AI conversation.
 *
 * White-label and provider-neutral. A provider is plain data (`PROVIDER_ADAPTERS`): how to list a
 * folder and how to download one file. Credentials are never read here. The consumer supplies
 * `getAccessToken()` (from its own secret store, an environment variable, or an OS keychain), so a
 * product decides where keys live and this module never sees how.
 *
 * Every file is checked before it is written: the downloaded byte count must equal the size the
 * provider declares, otherwise the file is refused as TRUNCATED and nothing is written for it.
 * Each written file gets a receipt line: provider, remote id, name, bytes, sha256, local path.
 * The result grants no authority: it is a copy, not an approval.
 */
import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants, mkdirSync, existsSync, lstatSync, fstatSync, readFileSync, openSync, writeSync, fsyncSync, closeSync, linkSync, unlinkSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';

export const REMOTE_FILE_PULL_SCHEMA = 'xiio.remote-file-pull/v1';

/** Provider descriptions are data. Add a provider by adding an entry, not by editing the pull logic. */
export const PROVIDER_ADAPTERS = Object.freeze({
  google_drive: Object.freeze({
    id: 'google_drive',
    read_scope: 'https://www.googleapis.com/auth/drive.readonly',
    listUrl: (folderId, pageToken) => {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
      const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,size,md5Checksum)');
      return `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    },
    readPage: (json) => ({ files: json.files ?? [], next: json.nextPageToken ?? null }),
    downloadUrl: (fileId) => `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    declaredBytes: (file) => (file.size == null ? null : Number(file.size)),
  }),
});

const safeName = (name) => basename(String(name)).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';

/**
 * A caller's storage root is not automatically an admitted target. Refuse
 * symlinked roots and ancestors before any credential or network operation.
 * Recheck around awaits and before publishing, since the parent can change.
 */
function stagingDirectorySafe(targetDir) {
  if (typeof targetDir !== 'string' || !targetDir.trim()) return false;
  try {
    let current = resolve(targetDir);
    const destination = current;
    while (true) {
      const stat = lstatSync(current, {throwIfNoEntry: false});
      if (stat?.isSymbolicLink()) return false;
      if (current === destination && stat && !stat.isDirectory()) return false;
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return true;
  } catch { return false; }
}


/**
 * @param {object} options
 * @param {string} options.provider           key of PROVIDER_ADAPTERS
 * @param {string} options.folderId           remote folder id
 * @param {string} options.targetDir          local folder to write into
 * @param {() => Promise<string>|string} options.getAccessToken  supplied by the consumer
 * @param {(file: object) => boolean} [options.accept]  filter, e.g. images only
 * @param {typeof fetch} [options.fetcher]
 * @param {boolean} [options.dryRun]
 */
export async function pullRemoteFolder({ provider, folderId, targetDir, getAccessToken, accept = () => true, fetcher = fetch, dryRun = false } = {}) {
  // Prototype-inherited names are not registered providers. Reject them before any
  // credential retrieval, filesystem access, or network request.
  if (!Object.hasOwn(PROVIDER_ADAPTERS, provider)) return { schema: REMOTE_FILE_PULL_SCHEMA, ok: false, reason: 'PROVIDER_UNKNOWN' };
  const adapter = PROVIDER_ADAPTERS[provider];
  if (!folderId || !targetDir || typeof getAccessToken !== 'function') return { schema: REMOTE_FILE_PULL_SCHEMA, ok: false, reason: 'ARGS_REQUIRED' };
  if (!stagingDirectorySafe(targetDir)) return { schema: REMOTE_FILE_PULL_SCHEMA, ok: false, reason: 'STAGING_DIRECTORY_UNSAFE', authority_granted: false };
  const token = await getAccessToken();
  if (!token) return { schema: REMOTE_FILE_PULL_SCHEMA, ok: false, reason: 'HOST_AUTH_REQUIRED' };
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const listed = [];
  let next = null;
  let complete = false;
  for (let guard = 0; guard < 50; guard += 1) {
    const response = await fetcher(adapter.listUrl(folderId, next), auth);
    if (response.status === 401 || response.status === 403) return { schema: REMOTE_FILE_PULL_SCHEMA, ok: false, reason: 'HOST_AUTH_REQUIRED', status: response.status };
    if (!response.ok) return { schema: REMOTE_FILE_PULL_SCHEMA, ok: false, reason: 'LIST_FAILED', status: response.status };
    const page = adapter.readPage(await response.json());
    listed.push(...page.files);
    if (!page.next) { complete = true; break; }
    next = page.next;
  }
  if (!complete) return { schema: REMOTE_FILE_PULL_SCHEMA, ok: false, reason: 'LIST_PAGINATION_LIMIT', listed: listed.length, authority_granted: false };

  const written = [];
  const refused = [];
  const skipped = [];
  const claimedLocalNames = new Map();
  if (!stagingDirectorySafe(targetDir)) return { schema: REMOTE_FILE_PULL_SCHEMA, ok: false, reason: 'STAGING_DIRECTORY_UNSAFE', authority_granted: false };
  if (!dryRun) mkdirSync(targetDir, { recursive: true });
  if (!stagingDirectorySafe(targetDir)) return { schema: REMOTE_FILE_PULL_SCHEMA, ok: false, reason: 'STAGING_DIRECTORY_UNSAFE', authority_granted: false };
  // Pin the exact directory inode for this batch. A different ordinary directory
  // swapped into the same path during a provider await is not an admitted target.
  const pinned = lstatSync(targetDir, {throwIfNoEntry:false});
  const sameStagingDirectory = () => {
    if (!stagingDirectorySafe(targetDir)) return false;
    const now = lstatSync(targetDir, {throwIfNoEntry:false});
    return !!pinned && !!now && now.isDirectory() &&
      now.dev === pinned.dev && now.ino === pinned.ino;
  };
  for (const file of listed) {
    if (!accept(file)) { skipped.push({ id: file.id, name: file.name, reason: 'NOT_ACCEPTED' }); continue; }
    if (typeof file.mimeType === 'string' && file.mimeType.startsWith('application/vnd.google-apps.')) {
      refused.push({ id: file.id, name: file.name, reason: 'NATIVE_WORKSPACE_EXPORT_REQUIRED', mime_type: file.mimeType }); continue;
    }
    const declared = adapter.declaredBytes(file);
    if (!Number.isSafeInteger(declared) || declared < 0) { refused.push({ id: file.id, name: file.name, reason: 'DECLARED_SIZE_REQUIRED' }); continue; }
    if (!sameStagingDirectory()) { refused.push({ id:file.id, name:file.name, reason:'STAGING_DIRECTORY_UNSAFE' }); continue; }
    const response = await fetcher(adapter.downloadUrl(file.id), auth);
    if (!sameStagingDirectory()) { refused.push({ id:file.id, name:file.name, reason:'STAGING_DIRECTORY_UNSAFE' }); continue; }
    if (!response.ok) { refused.push({ id: file.id, name: file.name, reason: 'DOWNLOAD_FAILED', status: response.status }); continue; }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (declared !== bytes.length) { refused.push({ id: file.id, name: file.name, reason: 'TRUNCATED', declared, received: bytes.length }); continue; }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const localName = safeName(file.name);
    if (localName === '.' || localName === '..') {
      refused.push({id:file.id,name:file.name,reason:'INVALID_LOCAL_NAME'}); continue;
    }
    const local = join(targetDir, localName);
    const priorRemote = claimedLocalNames.get(localName);
    // A matching digest is not sufficient identity: two provider objects must
    // never silently share one destination/receipt.
    if (priorRemote) {
      refused.push({ id: file.id, name: file.name, reason: 'LOCAL_NAME_COLLISION', local, conflicts_with_remote_id: priorRemote.remote_id });
      continue;
    }
    if (existsSync(local)) {
      // A same-name preexisting file is not necessarily an earlier copy of this
      // provider object. Never follow symlinks, hardlinks, or changed inodes to
      // decide that private bytes are "already present".
      let existingDigest;
      let descriptor = null;
      try {
        if (!stagingDirectorySafe(targetDir) ||
            typeof fsConstants.O_NOFOLLOW !== 'number' ||
            typeof fsConstants.O_NONBLOCK !== 'number') {
          throw new Error('EXISTING_SOURCE_READ_BOUNDARY_UNAVAILABLE');
        }
        const stat = lstatSync(local);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
          throw new Error('EXISTING_SOURCE_NOT_REGULAR');
        }
        descriptor = openSync(local, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
        const opened = fstatSync(descriptor);
        if (!opened.isFile() || opened.nlink !== 1 ||
            opened.dev !== stat.dev || opened.ino !== stat.ino ||
            opened.size !== stat.size) {
          throw new Error('EXISTING_SOURCE_CHANGED_ON_OPEN');
        }
        existingDigest = createHash('sha256').update(readFileSync(descriptor)).digest('hex');
      } catch {
        refused.push({ id: file.id, name: file.name, reason: 'LOCAL_NAME_UNTRUSTED', local });
        continue;
      } finally {
        if (descriptor !== null) closeSync(descriptor);
      }
      if (!stagingDirectorySafe(targetDir)) {
        refused.push({ id: file.id, name: file.name, reason: 'STAGING_DIRECTORY_UNSAFE' });
        continue;
      }
      if (existingDigest === sha256) {
        skipped.push({ id: file.id, name: file.name, reason: 'ALREADY_PRESENT', local }); continue;
      }
      refused.push({ id: file.id, name: file.name, reason: 'LOCAL_NAME_COLLISION', local });
      continue;
    }
    claimedLocalNames.set(localName, {remote_id: file.id, sha256});
    const receipt = { provider: adapter.id, remote_id: file.id, name: file.name, mime_type: file.mimeType ?? null, bytes: bytes.length, sha256, local };
    if (dryRun) { skipped.push({ id: file.id, name: file.name, reason: 'DRY_RUN_WOULD_COPY', local, bytes: bytes.length, sha256 }); continue; }
    if (!sameStagingDirectory()) { refused.push({ id:file.id, name:file.name, reason:'STAGING_DIRECTORY_UNSAFE' }); continue; }
    const temporary = join(targetDir, `.${localName}.${randomUUID()}.partial`);
    let descriptor = null;
    try {
      descriptor = openSync(temporary, 'wx', 0o600);
      writeSync(descriptor, bytes);
      fsyncSync(descriptor);
      closeSync(descriptor); descriptor = null;
      const staged = readFileSync(temporary);
      const stagedDigest = createHash('sha256').update(staged).digest('hex');
      if (staged.length !== declared || stagedDigest !== sha256) throw new Error('STAGED_BYTES_VERIFICATION_FAILED');
      // A same-directory hard link publishes the complete verified inode atomically and
      // fails with EEXIST instead of replacing a file created by a concurrent process.
      if (!sameStagingDirectory()) throw new Error('STAGING_DIRECTORY_UNSAFE');
      linkSync(temporary, local);
      unlinkSync(temporary);
      written.push(receipt);
    } catch (error) {
      try { if (descriptor !== null) closeSync(descriptor); } catch {}
      try { if (existsSync(temporary)) unlinkSync(temporary); } catch {}
      refused.push({ id: file.id, name: file.name, reason: error?.code === 'EEXIST' ? 'LOCAL_NAME_COLLISION' : 'ATOMIC_WRITE_FAILED', detail: error?.message || 'unknown' });
    }
  }
  return { schema: REMOTE_FILE_PULL_SCHEMA, ok: refused.length === 0, provider: adapter.id, folder_id: folderId, listed: listed.length, written, refused, skipped, dry_run: dryRun, authority_granted: false };
}
