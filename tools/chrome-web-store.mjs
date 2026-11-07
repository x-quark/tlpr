// Publishes the release ZIP to the existing Chrome Web Store item through the official API v2.
// https://developer.chrome.com/docs/webstore/using-api
//
// Credentials live outside the repository (see defaultCredentialsPath) and are never printed.
// This tool is not part of the extension package or of its bundled corresponding source.
import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { unzipSync } from 'fflate';

export const ITEM_ID = 'ejclfjeilcfnjdocgnmloilcaocelgnp';
export const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const API_ROOT = 'https://chromewebstore.googleapis.com';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const UPLOAD_POLL_MS = 5_000;
const UPLOAD_POLL_ATTEMPTS = 60;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const USAGE = `Usage: pnpm webstore <command> [options]

Commands:
  status      Show the published and submitted versions of the item
  publish     Upload the release ZIP and submit it for review
  upload      Upload the release ZIP as a draft without submitting it
  submit      Submit the current draft for review
  cancel      Cancel the submission waiting for review
  login       Authorize this computer once through a Google consent page

Options:
  --zip <path>  Package to upload (default: release/tlpr-v<package.json version>.zip)
  --dry-run     Check credentials, package and store state without changing anything
  --staged      Keep the approved version staged instead of publishing it automatically

Credentials: CWS_CREDENTIALS_FILE or ${defaultCredentialsPath()}
Overrides: CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_PUBLISHER_ID, CWS_ITEM_ID`;

export class StoreError extends Error {}

export function defaultCredentialsPath(env = process.env, platform = process.platform) {
  const base =
    platform === 'win32' && env.APPDATA
      ? env.APPDATA
      : env.XDG_CONFIG_HOME || path.join(homedir(), '.config');
  return path.join(base, 'x-quark', 'chrome-web-store.json');
}

export async function loadConfig(env = process.env) {
  const file = env.CWS_CREDENTIALS_FILE || defaultCredentialsPath(env);
  let stored = {};
  try {
    stored = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    // Never echo the parser message: it can quote credential text.
    if (error instanceof SyntaxError) throw new StoreError(`${file} is not valid JSON`);
    if (error.code !== 'ENOENT') throw new StoreError(`Cannot read ${file} (${error.code})`);
  }
  return {
    file,
    stored,
    clientId: env.CWS_CLIENT_ID || stored.clientId,
    clientSecret: env.CWS_CLIENT_SECRET || stored.clientSecret,
    refreshToken: env.CWS_REFRESH_TOKEN || stored.refreshToken,
    publisherId: env.CWS_PUBLISHER_ID || stored.publisherId,
    itemId: env.CWS_ITEM_ID || ITEM_ID,
  };
}

async function saveCredentials(config, updates) {
  const next = { ...config.stored, ...updates };
  await mkdir(path.dirname(config.file), { recursive: true });
  await writeFile(config.file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') await chmod(config.file, 0o600);
  config.stored = next;
}

function requireConfig(config, fields, hint) {
  const missing = fields.filter((field) => !config[field]);
  if (missing.length > 0) {
    throw new StoreError(`Missing ${missing.join(', ')} in ${config.file}. ${hint}`);
  }
}

export function compareVersions(left, right) {
  const a = String(left).split('.').map(Number);
  const b = String(right).split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function channelVersions(revision) {
  return (revision?.distributionChannels ?? [])
    .map((channel) => channel.crxVersion)
    .filter(Boolean);
}

export function describeStatus(status) {
  const describe = (revision) => {
    if (!revision) return 'none';
    const channels = (revision.distributionChannels ?? []).map((channel) =>
      channel.deployPercentage !== undefined && channel.deployPercentage !== 100
        ? `${channel.crxVersion} at ${channel.deployPercentage}%`
        : channel.crxVersion,
    );
    return [channels.join(', '), revision.state].filter(Boolean).join(' · ') || 'none';
  };
  const lines = [
    `Published: ${describe(status.publishedItemRevisionStatus)}`,
    `Submitted: ${describe(status.submittedItemRevisionStatus)}`,
  ];
  if (status.lastAsyncUploadState) lines.push(`Last upload: ${status.lastAsyncUploadState}`);
  if (status.warned)
    lines.push('Warning: the item has a policy warning in the Developer Dashboard');
  if (status.takenDown) lines.push('Warning: the item is taken down');
  return lines.join('\n');
}

// Returns why the package cannot be uploaded, or null when it can.
export function uploadBlocker(version, status) {
  if (status.takenDown)
    return 'The item is taken down; resolve it in the Developer Dashboard first.';
  if (status.submittedItemRevisionStatus?.state === 'PENDING_REVIEW') {
    return 'A submission is waiting for review. Wait for it, or run "pnpm webstore cancel" first.';
  }
  const known = [
    ...channelVersions(status.publishedItemRevisionStatus),
    ...channelVersions(status.submittedItemRevisionStatus),
  ];
  const highest = known.sort(compareVersions).at(-1);
  if (highest && compareVersions(version, highest) <= 0) {
    return `Version ${version} must be higher than ${highest}, already known to the store.`;
  }
  return null;
}

export async function readPackage(zipPath) {
  let bytes;
  try {
    bytes = await readFile(zipPath);
  } catch (error) {
    if (error.code === 'ENOENT')
      throw new StoreError(`${zipPath} not found. Run "pnpm check" first.`);
    throw error;
  }
  const entries = unzipSync(new Uint8Array(bytes), {
    filter: (file) => file.name === 'manifest.json',
  });
  if (!entries['manifest.json']) throw new StoreError(`${zipPath} has no root manifest.json`);
  const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json']));
  const digest = createHash('sha256').update(bytes).digest('hex');
  let expected = null;
  try {
    expected = (await readFile(`${zipPath}.sha256`, 'utf8')).trim().split(/\s+/)[0].toLowerCase();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (expected && expected !== digest)
    throw new StoreError(`${zipPath} does not match its .sha256 file`);
  return { zipPath, bytes, digest, checksumVerified: Boolean(expected), version: manifest.version };
}

export function createClient(config, { fetchImpl = fetch, delay = defaultDelay } = {}) {
  const itemName = () => `publishers/${config.publisherId}/items/${config.itemId}`;
  let token = null;

  async function accessToken() {
    if (token) return token;
    requireConfig(
      config,
      ['clientId', 'clientSecret', 'refreshToken'],
      'Run "pnpm webstore login" first.',
    );
    const response = await fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) {
      if (body.error === 'invalid_grant') {
        throw new StoreError(
          'The authorization expired or was revoked. Run "pnpm webstore login".',
        );
      }
      throw new StoreError(
        `Token request failed with HTTP ${response.status}: ${body.error ?? 'unknown error'}`,
      );
    }
    token = body.access_token;
    return token;
  }

  async function call(method, url, { body, contentType } = {}) {
    requireConfig(
      config,
      ['publisherId'],
      'Copy the publisher ID from Developer Dashboard > Publisher > Settings.',
    );
    const headers = { Authorization: `Bearer ${await accessToken()}` };
    if (contentType) headers['Content-Type'] = contentType;
    const response = await fetchImpl(url, { method, headers, body });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: { message: text.slice(0, 300) } };
    }
    if (!response.ok) {
      const details = data.error?.details ? ` ${JSON.stringify(data.error.details)}` : '';
      throw new StoreError(
        `${method} ${new URL(url).pathname} failed with HTTP ${response.status}: ${data.error?.message ?? response.statusText}${details}`,
      );
    }
    return data;
  }

  const fetchStatus = () => call('GET', `${API_ROOT}/v2/${itemName()}:fetchStatus`);

  return {
    fetchStatus,
    async upload(pkg) {
      const result = await call('POST', `${API_ROOT}/upload/v2/${itemName()}:upload`, {
        body: pkg.bytes,
        contentType: 'application/zip',
      });
      let state = result.uploadState;
      for (
        let attempt = 0;
        state === 'IN_PROGRESS' && attempt < UPLOAD_POLL_ATTEMPTS;
        attempt += 1
      ) {
        await delay(UPLOAD_POLL_MS);
        state = (await fetchStatus()).lastAsyncUploadState;
      }
      if (state !== 'SUCCEEDED')
        throw new StoreError(`Upload ended in state ${state ?? 'unknown'}`);
      return result;
    },
    submit({ staged = false } = {}) {
      return call('POST', `${API_ROOT}/v2/${itemName()}:publish`, {
        body: JSON.stringify({ publishType: staged ? 'STAGED_PUBLISH' : 'DEFAULT_PUBLISH' }),
        contentType: 'application/json',
      });
    },
    cancel() {
      return call('POST', `${API_ROOT}/v2/${itemName()}:cancelSubmission`, {
        body: '{}',
        contentType: 'application/json',
      });
    },
  };
}

function defaultDelay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

async function login(config, log) {
  requireConfig(
    config,
    ['clientId', 'clientSecret'],
    'Add the OAuth desktop client first (docs/publication-chrome-web-store.md).',
  );
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(16));
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const redirectUri = `http://127.0.0.1:${server.address().port}`;
  const authUrl = new URL(AUTH_ENDPOINT);
  authUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'select_account consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();
  log('Open this page, choose the publisher account and allow access:');
  log(authUrl.href);

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new StoreError('No authorization received within 10 minutes')),
      LOGIN_TIMEOUT_MS,
    );
    server.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', redirectUri);
      if (url.pathname !== '/' || url.searchParams.get('state') !== state) {
        response.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get('error');
      const received = url.searchParams.get('code');
      response.writeHead(error || !received ? 400 : 200, {
        'Content-Type': 'text/html; charset=utf-8',
      });
      response.end(
        `<!doctype html><meta charset="utf-8"><title>TL;PR publishing</title><p>${
          error || !received
            ? `Authorization failed: ${escapeHtml(error ?? 'missing code')}.`
            : 'Authorization received. You can close this tab.'
        }</p>`,
      );
      clearTimeout(timer);
      if (error || !received)
        reject(new StoreError(`Authorization failed: ${error ?? 'missing code'}`));
      else resolve(received);
    });
  }).finally(() => {
    server.closeAllConnections();
    server.close();
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.refresh_token) {
    throw new StoreError(
      `Token exchange failed with HTTP ${response.status}: ${body.error ?? 'no refresh token'}`,
    );
  }
  if (typeof body.scope === 'string' && !body.scope.split(' ').includes(SCOPE)) {
    throw new StoreError('The Chrome Web Store permission was not granted.');
  }
  await saveCredentials(config, { refreshToken: body.refresh_token });
  log(`Authorization saved to ${config.file}`);
}

export async function run(argv, { env = process.env, log = console.log, client } = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      zip: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      staged: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command] = positionals;
  if (!command || command === 'help' || values.help) {
    log(USAGE);
    return;
  }
  const config = await loadConfig(env);
  if (command === 'login') {
    await login(config, log);
    return;
  }
  const store = client ?? createClient(config);
  switch (command) {
    case 'status': {
      log(describeStatus(await store.fetchStatus()));
      return;
    }
    case 'upload':
    case 'publish': {
      const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
      const pkg = await readPackage(
        path.resolve(values.zip ?? path.join(root, 'release', `tlpr-v${version}.zip`)),
      );
      const status = await store.fetchStatus();
      log(describeStatus(status));
      const blocker = uploadBlocker(pkg.version, status);
      if (blocker) throw new StoreError(blocker);
      const action = command === 'publish' ? 'upload and submit' : 'upload';
      log(
        `Package: ${pkg.zipPath}\nVersion: ${pkg.version}\nSHA-256: ${pkg.digest}${pkg.checksumVerified ? ' (matches .sha256)' : ''}`,
      );
      if (values['dry-run']) {
        log(`Dry run: would ${action} version ${pkg.version}.`);
        return;
      }
      const uploaded = await store.upload(pkg);
      log(`Uploaded version ${uploaded.crxVersion ?? pkg.version}.`);
      if (command === 'publish') await submitAndReport(store, values.staged, log);
      return;
    }
    case 'submit': {
      if (values['dry-run']) {
        log('Dry run: would submit the current draft for review.');
        return;
      }
      await submitAndReport(store, values.staged, log);
      return;
    }
    case 'cancel': {
      if (values['dry-run']) {
        log('Dry run: would cancel the pending submission.');
        return;
      }
      await store.cancel();
      log('Submission cancelled.');
      return;
    }
    default:
      throw new StoreError(`Unknown command "${command}".\n\n${USAGE}`);
  }
}

async function submitAndReport(store, staged, log) {
  const result = await store.submit({ staged });
  log(`Submitted for review: ${result.state ?? 'state unknown'}.`);
  for (const warning of result.warningInfo?.warnings ?? []) {
    log(`Store warning: ${JSON.stringify(warning)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof StoreError ? error.message : error);
    process.exitCode = 1;
  });
}
