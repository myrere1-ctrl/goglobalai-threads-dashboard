const BASE = 'https://graph.threads.net/v1.0';
const OAUTH = 'https://graph.threads.net';

async function postForm(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    body: new URLSearchParams(params),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Threads ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Threads ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

export async function createContainer({ userId, token, text, replyToId }) {
  const params = {
    media_type: 'TEXT',
    text,
    access_token: token,
  };
  if (replyToId) params.reply_to_id = replyToId;
  return postForm(`${BASE}/${userId}/threads`, params);
}

export async function publishContainer({ userId, token, creationId }) {
  return postForm(`${BASE}/${userId}/threads_publish`, {
    creation_id: creationId,
    access_token: token,
  });
}

export async function postThread({ userId, token, text, waitMs = 30000 }) {
  const container = await createContainer({ userId, token, text });
  if (!container.id) throw new Error('No container id: ' + JSON.stringify(container));

  await new Promise((r) => setTimeout(r, waitMs));

  const published = await publishContainer({
    userId,
    token,
    creationId: container.id,
  });
  if (!published.id) throw new Error('No published id: ' + JSON.stringify(published));
  return published.id;
}

// Balas ke thread yang sudah dipublish (buat naruh CTA + link di reply,
// biar post utama tetap bersih dari link = reach lebih tinggi).
export async function postReply({ userId, token, text, replyToId, waitMs = 30000 }) {
  const container = await createContainer({ userId, token, text, replyToId });
  if (!container.id) throw new Error('No reply container id: ' + JSON.stringify(container));

  await new Promise((r) => setTimeout(r, waitMs));

  const published = await publishContainer({
    userId,
    token,
    creationId: container.id,
  });
  if (!published.id) throw new Error('No reply published id: ' + JSON.stringify(published));
  return published.id;
}

export async function verifyToken({ token }) {
  return getJson(`${BASE}/me?fields=id,username&access_token=${token}`);
}

export async function refreshLongLivedToken({ token }) {
  return getJson(
    `${OAUTH}/refresh_access_token?grant_type=th_refresh_token&access_token=${token}`
  );
}

export async function exchangeForLongLived({ token, appSecret }) {
  return getJson(
    `${OAUTH}/access_token?grant_type=th_exchange_token&client_secret=${appSecret}&access_token=${token}`
  );
}

export async function getProfile({ userId, token }) {
  const fields = 'id,username,name,threads_profile_picture_url,threads_biography';
  return getJson(`${BASE}/${userId}?fields=${fields}&access_token=${token}`);
}

export async function getUserInsights({ userId, token, metric }) {
  return getJson(`${BASE}/${userId}/threads_insights?metric=${metric}&access_token=${token}`);
}

export async function getMediaInsights({ mediaId, token }) {
  const metric = 'views,likes,replies,reposts,quotes,shares';
  return getJson(`${BASE}/${mediaId}/insights?metric=${metric}&access_token=${token}`);
}

export async function getUserThreads({ userId, token, limit = 25 }) {
  const fields = 'id,media_type,text,permalink,timestamp';
  return getJson(`${BASE}/${userId}/threads?fields=${fields}&limit=${limit}&access_token=${token}`);
}
