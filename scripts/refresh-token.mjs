import fs from 'node:fs/promises';
import path from 'node:path';
import sodium from 'libsodium-wrappers';
import { refreshLongLivedToken } from './lib/threads.mjs';

const META_PATH = path.resolve('data/token-meta.json');
const REFRESH_IF_DAYS_LEFT_BELOW = 14;

async function loadMeta() {
  try {
    return JSON.parse(await fs.readFile(META_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function saveMeta(meta) {
  await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2) + '\n');
}

function daysBetween(a, b) {
  return (b.getTime() - a.getTime()) / 86400000;
}

async function ghGet(url, pat) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GH GET ${url} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function ghPut(url, pat, body) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status !== 201 && res.status !== 204) {
    throw new Error(`GH PUT ${url} ${res.status}: ${await res.text()}`);
  }
}

async function encryptForRepo({ value, publicKey }) {
  await sodium.ready;
  const keyBytes = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  const valueBytes = sodium.from_string(value);
  const cipher = sodium.crypto_box_seal(valueBytes, keyBytes);
  return sodium.to_base64(cipher, sodium.base64_variants.ORIGINAL);
}

async function updateSecret({ repo, pat, name, value }) {
  const keyInfo = await ghGet(
    `https://api.github.com/repos/${repo}/actions/secrets/public-key`,
    pat
  );
  const encrypted_value = await encryptForRepo({
    value,
    publicKey: keyInfo.key,
  });
  await ghPut(
    `https://api.github.com/repos/${repo}/actions/secrets/${name}`,
    pat,
    { encrypted_value, key_id: keyInfo.key_id }
  );
}

async function main() {
  const force = process.argv.includes('--force');
  const token = process.env.THREADS_ACCESS_TOKEN;
  const pat = process.env.GH_PAT_REPO_SECRETS;
  const repo = process.env.GITHUB_REPOSITORY;

  if (!token) throw new Error('THREADS_ACCESS_TOKEN missing');
  if (!pat) throw new Error('GH_PAT_REPO_SECRETS missing');
  if (!repo) throw new Error('GITHUB_REPOSITORY missing (set automatically in Actions)');

  const meta = await loadMeta();
  if (meta?.expires_at && !force) {
    const left = daysBetween(new Date(), new Date(meta.expires_at));
    console.log(`Token has ${left.toFixed(1)} days left`);
    if (left > REFRESH_IF_DAYS_LEFT_BELOW) {
      console.log('Above threshold, skipping refresh');
      return;
    }
  }

  console.log('Refreshing long-lived token...');
  const refreshed = await refreshLongLivedToken({ token });
  if (!refreshed.access_token) {
    throw new Error('No access_token returned: ' + JSON.stringify(refreshed));
  }

  const now = new Date();
  const expires = new Date(now.getTime() + refreshed.expires_in * 1000);

  console.log('Updating THREADS_ACCESS_TOKEN secret...');
  await updateSecret({
    repo,
    pat,
    name: 'THREADS_ACCESS_TOKEN',
    value: refreshed.access_token,
  });

  await saveMeta({
    issued_at: now.toISOString(),
    expires_at: expires.toISOString(),
    expires_in_days: Math.floor(refreshed.expires_in / 86400),
  });

  console.log(`Done. New expiry: ${expires.toISOString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
