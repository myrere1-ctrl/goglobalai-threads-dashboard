import { exchangeForLongLived } from './lib/threads.mjs';

const APP_ID = '1382518007054116';
const REDIRECT_URI = 'https://localhost/';

const code = process.env.CODE;
const appSecret = process.env.THREADS_APP_SECRET;

if (!code) throw new Error('CODE env missing (paste dari step b di README)');
if (!appSecret) throw new Error('THREADS_APP_SECRET env missing');

const params = new URLSearchParams({
  client_id: APP_ID,
  client_secret: appSecret,
  grant_type: 'authorization_code',
  redirect_uri: REDIRECT_URI,
  code: code.replace(/#_$/, ''),
});

const shortRes = await fetch('https://graph.threads.net/oauth/access_token', {
  method: 'POST',
  body: params,
});
const shortRaw = await shortRes.text();
if (!shortRes.ok) {
  throw new Error('Short token failed: ' + shortRaw);
}
const userIdMatch = shortRaw.match(/"user_id"\s*:\s*(\d+)/);
const tokenMatch = shortRaw.match(/"access_token"\s*:\s*"([^"]+)"/);
if (!userIdMatch || !tokenMatch) {
  throw new Error('Could not parse short token response: ' + shortRaw);
}
const userId = userIdMatch[1];
const shortToken = tokenMatch[1];

console.log('short_token user_id:', userId);

const long = await exchangeForLongLived({
  token: shortToken,
  appSecret,
});

console.log('---');
console.log('LONG TOKEN:', long.access_token);
console.log('Expires in days:', Math.floor(long.expires_in / 86400));
console.log('---');
console.log('Set these GitHub Secrets:');
console.log('  THREADS_ACCESS_TOKEN =', long.access_token);
console.log('  THREADS_USER_ID =', userId);
