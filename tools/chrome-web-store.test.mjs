import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';

import {
  compareVersions,
  createClient,
  defaultCredentialsPath,
  describeStatus,
  loadConfig,
  readPackage,
  run,
  StoreError,
  uploadBlocker,
  USAGE,
} from './chrome-web-store.mjs';

const SECRET = 'client-secret-value';
const REFRESH = 'refresh-token-value';

function configFor(overrides = {}) {
  return {
    file: 'credentials.json',
    stored: {},
    clientId: 'client-id',
    clientSecret: SECRET,
    refreshToken: REFRESH,
    publisherId: 'publisher-id',
    itemId: 'item-id',
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function packageFile(version, { checksum } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'tlpr-webstore-'));
  const zipPath = path.join(directory, `tlpr-v${version}.zip`);
  const bytes = zipSync({
    'manifest.json': new TextEncoder().encode(JSON.stringify({ manifest_version: 3, version })),
    'source/README.md': new TextEncoder().encode('# Source'),
  });
  await writeFile(zipPath, bytes);
  if (checksum) await writeFile(`${zipPath}.sha256`, `${checksum}  tlpr-v${version}.zip\n`);
  return zipPath;
}

const published = (version, state = 'PUBLISHED') => ({
  publishedItemRevisionStatus: { state, distributionChannels: [{ crxVersion: version }] },
});

describe('chrome web store helpers', () => {
  it('compares dotted versions numerically', () => {
    expect(compareVersions('0.3.2', '0.3.1')).toBe(1);
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.2.3', '0.3')).toBe(-1);
  });

  it('keeps credentials in the user configuration directory', () => {
    expect(defaultCredentialsPath({ APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, 'win32')).toBe(
      path.join('C:\\Users\\me\\AppData\\Roaming', 'x-quark', 'chrome-web-store.json'),
    );
    expect(defaultCredentialsPath({ XDG_CONFIG_HOME: '/home/me/.cfg' }, 'linux')).toBe(
      path.join('/home/me/.cfg', 'x-quark', 'chrome-web-store.json'),
    );
    expect(defaultCredentialsPath({}, 'darwin')).toMatch(/\.config[\\/]x-quark[\\/]/);
  });

  it('describes published and submitted revisions', () => {
    const text = describeStatus({
      ...published('0.3.1'),
      submittedItemRevisionStatus: {
        state: 'PENDING_REVIEW',
        distributionChannels: [{ crxVersion: '0.3.2', deployPercentage: 100 }],
      },
      lastAsyncUploadState: 'SUCCEEDED',
      warned: true,
    });
    expect(text).toBe(
      [
        'Published: 0.3.1 · PUBLISHED',
        'Submitted: 0.3.2 · PENDING_REVIEW',
        'Last upload: SUCCEEDED',
        'Warning: the item has a policy warning in the Developer Dashboard',
      ].join('\n'),
    );
    expect(describeStatus({})).toBe('Published: none\nSubmitted: none');
  });

  it('refuses uploads the store would reject', () => {
    expect(uploadBlocker('0.3.2', published('0.3.1'))).toBeNull();
    expect(uploadBlocker('0.3.1', published('0.3.1'))).toMatch(/must be higher than 0\.3\.1/);
    expect(
      uploadBlocker('0.3.2', {
        ...published('0.3.0'),
        submittedItemRevisionStatus: { state: 'PENDING_REVIEW', distributionChannels: [] },
      }),
    ).toMatch(/waiting for review/);
    expect(
      uploadBlocker('0.3.2', {
        submittedItemRevisionStatus: {
          state: 'REJECTED',
          distributionChannels: [{ crxVersion: '0.3.2' }],
        },
      }),
    ).toMatch(/must be higher than 0\.3\.2/);
    expect(uploadBlocker('0.3.2', { takenDown: true })).toMatch(/taken down/);
  });

  it('reads the manifest version and verifies the checksum sidecar', async () => {
    const plain = await readPackage(await packageFile('1.2.3'));
    expect(plain).toMatchObject({ version: '1.2.3', checksumVerified: false });
    expect(plain.digest).toMatch(/^[0-9a-f]{64}$/);

    const verified = await readPackage(await packageFile('1.2.3', { checksum: plain.digest }));
    expect(verified.checksumVerified).toBe(true);

    await expect(
      readPackage(await packageFile('1.2.3', { checksum: '0'.repeat(64) })),
    ).rejects.toThrow(/does not match its \.sha256/);
    await expect(readPackage(path.join(tmpdir(), 'missing-tlpr.zip'))).rejects.toThrow(StoreError);
  });

  it('never echoes a malformed credentials file', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tlpr-webstore-'));
    const file = path.join(directory, 'credentials.json');
    await writeFile(file, `{"clientSecret": "${SECRET}",`);
    const error = await loadConfig({ CWS_CREDENTIALS_FILE: file }).catch((caught) => caught);
    expect(error).toBeInstanceOf(StoreError);
    expect(error.message).not.toContain(SECRET);
  });

  it('lets environment variables override stored credentials', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tlpr-webstore-'));
    const file = path.join(directory, 'credentials.json');
    await writeFile(file, JSON.stringify({ clientId: 'stored', publisherId: 'stored-publisher' }));
    const config = await loadConfig({ CWS_CREDENTIALS_FILE: file, CWS_CLIENT_ID: 'from-env' });
    expect(config).toMatchObject({
      clientId: 'from-env',
      publisherId: 'stored-publisher',
      itemId: 'ejclfjeilcfnjdocgnmloilcaocelgnp',
    });
  });
});

describe('chrome web store client', () => {
  it('refreshes once, uploads, waits for processing and submits', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 3599 });
      }
      if (String(url).endsWith(':upload')) {
        return jsonResponse({ uploadState: 'IN_PROGRESS', crxVersion: '0.3.2' });
      }
      if (String(url).endsWith(':fetchStatus')) {
        return jsonResponse({ lastAsyncUploadState: 'SUCCEEDED' });
      }
      return jsonResponse({ state: 'PENDING_REVIEW' });
    });
    const client = createClient(configFor(), { fetchImpl, delay: async () => undefined });

    await client.upload({ bytes: new Uint8Array([1, 2, 3]) });
    const result = await client.submit({ staged: true });

    expect(result.state).toBe('PENDING_REVIEW');
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/token',
      '/upload/v2/publishers/publisher-id/items/item-id:upload',
      '/v2/publishers/publisher-id/items/item-id:fetchStatus',
      '/v2/publishers/publisher-id/items/item-id:publish',
    ]);
    const tokenBody = new URLSearchParams(calls[0].init.body);
    expect(tokenBody.get('grant_type')).toBe('refresh_token');
    expect(tokenBody.get('refresh_token')).toBe(REFRESH);
    expect(calls[1].init.headers).toMatchObject({
      Authorization: 'Bearer access-token',
      'Content-Type': 'application/zip',
    });
    expect(JSON.parse(calls[3].init.body)).toEqual({ publishType: 'STAGED_PUBLISH' });
  });

  it('explains expired authorizations and API failures without secrets', async () => {
    const expired = createClient(configFor(), {
      fetchImpl: async () => jsonResponse({ error: 'invalid_grant' }, 400),
    });
    await expect(expired.fetchStatus()).rejects.toThrow(/pnpm webstore login/);

    const failing = createClient(configFor(), {
      fetchImpl: async (url) =>
        String(url).includes('oauth2')
          ? jsonResponse({ access_token: 'access-token' })
          : jsonResponse({ error: { message: 'Item not found' } }, 404),
    });
    const error = await failing.fetchStatus().catch((caught) => caught);
    expect(error.message).toMatch(/HTTP 404: Item not found/);
    expect(error.message).not.toContain(SECRET);
    expect(error.message).not.toContain(REFRESH);
  });

  it('requires a publisher ID and a finished upload', async () => {
    const fetchImpl = vi.fn();
    await expect(
      createClient(configFor({ publisherId: undefined }), { fetchImpl }).fetchStatus(),
    ).rejects.toThrow(/publisherId/);
    expect(fetchImpl).not.toHaveBeenCalled();

    const failedUpload = createClient(configFor(), {
      fetchImpl: async (url) =>
        String(url).includes('oauth2')
          ? jsonResponse({ access_token: 'access-token' })
          : jsonResponse({ uploadState: 'FAILED' }),
    });
    await expect(failedUpload.upload({ bytes: new Uint8Array() })).rejects.toThrow(
      /Upload ended in state FAILED/,
    );
  });
});

describe('chrome web store command', () => {
  const env = { CWS_CREDENTIALS_FILE: path.join(tmpdir(), 'tlpr-missing-credentials.json') };

  function fakeStore(status) {
    return {
      fetchStatus: vi.fn(async () => status),
      upload: vi.fn(async () => ({ crxVersion: '0.3.2', uploadState: 'SUCCEEDED' })),
      submit: vi.fn(async () => ({
        state: 'PENDING_REVIEW',
        warningInfo: { warnings: [{ message: 'Check permissions' }] },
      })),
      cancel: vi.fn(async () => ({})),
    };
  }

  it('prints usage without touching credentials', async () => {
    const log = vi.fn();
    await run([], { env, log });
    expect(log).toHaveBeenCalledWith(USAGE);
  });

  it('checks everything but changes nothing on a dry run', async () => {
    const log = vi.fn();
    const store = fakeStore(published('0.3.1'));
    const zip = await packageFile('0.3.2');
    await run(['publish', '--dry-run', '--zip', zip], { env, log, client: store });
    expect(store.upload).not.toHaveBeenCalled();
    expect(store.submit).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join('\n')).toMatch(
      /Dry run: would upload and submit version 0\.3\.2/,
    );
  });

  it('uploads then submits a newer version and reports store warnings', async () => {
    const log = vi.fn();
    const store = fakeStore(published('0.3.1'));
    await run(['publish', '--zip', await packageFile('0.3.2')], { env, log, client: store });
    expect(store.upload).toHaveBeenCalledTimes(1);
    expect(store.submit).toHaveBeenCalledWith({ staged: false });
    const output = log.mock.calls.flat().join('\n');
    expect(output).toMatch(/Submitted for review: PENDING_REVIEW/);
    expect(output).toMatch(/Store warning: .*Check permissions/);
  });

  it('stops before uploading a version the store already has', async () => {
    const store = fakeStore(published('0.3.2'));
    await expect(
      run(['publish', '--zip', await packageFile('0.3.2')], { env, log: vi.fn(), client: store }),
    ).rejects.toThrow(/must be higher/);
    expect(store.upload).not.toHaveBeenCalled();
  });

  it('runs status, submit and cancel, and rejects unknown commands', async () => {
    const log = vi.fn();
    const store = fakeStore(published('0.3.1'));
    await run(['status'], { env, log, client: store });
    await run(['submit', '--staged'], { env, log, client: store });
    await run(['cancel', '--dry-run'], { env, log, client: store });
    await run(['cancel'], { env, log, client: store });
    expect(store.submit).toHaveBeenCalledWith({ staged: true });
    expect(store.cancel).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Published: 0.3.1 · PUBLISHED\nSubmitted: none');
    await expect(run(['deploy'], { env, log, client: store })).rejects.toThrow(/Unknown command/);
  });
});
