import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getProfile,
  getUserInsights,
  getMediaInsights,
  getUserThreads,
} from './lib/threads.mjs';

const OUT_PATH = path.resolve('data/insights.json');

async function safe(fn) {
  try {
    return await fn();
  } catch (e) {
    console.error('Insight call failed:', e.message);
    return null;
  }
}

function reduceUserInsights(raw) {
  if (!raw?.data) return {};
  const out = {};
  for (const m of raw.data) {
    let v = null;
    if (m.total_value?.value != null) v = m.total_value.value;
    else if (Array.isArray(m.values) && m.values.length) v = m.values[m.values.length - 1].value;
    out[m.name] = v;
  }
  return out;
}

function reduceMediaInsights(raw) {
  if (!raw?.data) return {};
  const out = {};
  for (const m of raw.data) {
    out[m.name] = m.values?.[0]?.value ?? null;
  }
  return out;
}

async function main() {
  const token = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  if (!token) throw new Error('THREADS_ACCESS_TOKEN missing');
  if (!userId) throw new Error('THREADS_USER_ID missing');

  console.log('Fetching profile...');
  const profile = await safe(() => getProfile({ userId, token }));

  console.log('Fetching user insights (lifetime)...');
  const lifetimeRaw = await safe(() =>
    getUserInsights({ userId, token, metric: 'followers_count' })
  );

  console.log('Fetching user insights (windowed)...');
  const windowedRaw = await safe(() =>
    getUserInsights({
      userId,
      token,
      metric: 'views,likes,replies,reposts,quotes',
    })
  );

  console.log('Fetching recent threads...');
  const threadsRaw = await safe(() => getUserThreads({ userId, token, limit: 25 }));
  const recentMedia = threadsRaw?.data || [];

  console.log(`Fetching insights for ${recentMedia.length} posts...`);
  const posts = [];
  for (const m of recentMedia) {
    const ins = await safe(() => getMediaInsights({ mediaId: m.id, token }));
    const metrics = reduceMediaInsights(ins);
    const engagement =
      (metrics.likes || 0) +
      (metrics.replies || 0) +
      (metrics.reposts || 0) +
      (metrics.quotes || 0);
    posts.push({
      id: m.id,
      text: (m.text || '').slice(0, 120),
      permalink: m.permalink,
      timestamp: m.timestamp,
      metrics,
      engagement,
    });
    await new Promise((r) => setTimeout(r, 200));
  }

  posts.sort((a, b) => b.engagement - a.engagement);

  const lifetime = reduceUserInsights(lifetimeRaw);
  const windowed = reduceUserInsights(windowedRaw);

  const totalViews = posts.reduce((s, p) => s + (p.metrics.views || 0), 0);
  const totalLikes = posts.reduce((s, p) => s + (p.metrics.likes || 0), 0);
  const totalReplies = posts.reduce((s, p) => s + (p.metrics.replies || 0), 0);
  const totalReposts = posts.reduce((s, p) => s + (p.metrics.reposts || 0), 0);
  const totalQuotes = posts.reduce((s, p) => s + (p.metrics.quotes || 0), 0);
  const totalEngagement = totalLikes + totalReplies + totalReposts + totalQuotes;
  const engagementRate = totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0;

  const data = {
    updated_at: new Date().toISOString(),
    profile: profile
      ? {
          username: profile.username,
          name: profile.name,
          biography: profile.threads_biography,
          picture: profile.threads_profile_picture_url,
        }
      : null,
    summary: {
      followers_count: lifetime.followers_count ?? null,
      views: windowed.views ?? totalViews,
      likes: windowed.likes ?? totalLikes,
      replies: windowed.replies ?? totalReplies,
      reposts: windowed.reposts ?? totalReposts,
      quotes: windowed.quotes ?? totalQuotes,
      engagement_total: totalEngagement,
      engagement_rate: Number(engagementRate.toFixed(2)),
      post_count: posts.length,
    },
    top_posts: posts.slice(0, 5),
    recent_posts: posts.slice().sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    ).slice(0, 10),
  };

  await fs.writeFile(OUT_PATH, JSON.stringify(data, null, 2) + '\n');
  console.log('Saved insights to', OUT_PATH);
  console.log('Summary:', data.summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
