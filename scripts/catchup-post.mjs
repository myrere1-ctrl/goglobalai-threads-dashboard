import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SLOTS_WIB = [
  '06.00', '07.30', '09.00', '10.30', '12.00',
  '13.30', '15.00', '17.00', '19.00', '21.00',
];

const LOG_PATH = path.resolve('data/posted-log.json');

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function toWib(date = new Date()) {
  return new Date(date.getTime() + WIB_OFFSET_MS);
}

function nowWibYmd() {
  return toWib().toISOString().slice(0, 10);
}

function nowWibMinutes() {
  const w = toWib();
  return w.getUTCHours() * 60 + w.getUTCMinutes();
}

function timestampToWibYmd(ts) {
  return toWib(new Date(ts)).toISOString().slice(0, 10);
}

function slotToMinutes(s) {
  const [h, m] = s.split('.').map(Number);
  return h * 60 + m;
}

async function loadTodayLog() {
  const raw = await fs.readFile(LOG_PATH, 'utf8').catch(() => '[]');
  const log = JSON.parse(raw);
  const today = nowWibYmd();
  return log.filter(p => timestampToWibYmd(p.timestamp) === today);
}

async function main() {
  const todayLog = await loadTodayLog();
  const postedSlots = new Set(todayLog.map(p => p.slot));
  const nowMin = nowWibMinutes();

  console.log(`Today: ${nowWibYmd()}, now: ${Math.floor(nowMin/60)}:${String(nowMin%60).padStart(2,'0')} WIB`);
  console.log(`Posted today: [${[...postedSlots].sort().join(', ')}] (${postedSlots.size}/10)`);

  let targetSlot = null;
  for (let i = 0; i < SLOTS_WIB.length; i++) {
    if (slotToMinutes(SLOTS_WIB[i]) <= nowMin && !postedSlots.has(i)) {
      targetSlot = i;
      break;
    }
  }

  if (targetSlot === null) {
    console.log('Nothing to catchup. All eligible slots posted.');
    process.exit(0);
  }

  console.log(`Catchup target: slot ${targetSlot} (${SLOTS_WIB[targetSlot]} WIB)`);

  const result = spawnSync(
    'node',
    ['scripts/generate-and-post.mjs', `--slot=${targetSlot}`],
    { stdio: 'inherit', env: process.env }
  );

  process.exit(result.status || 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
