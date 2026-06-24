const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SKILL_NAME = 'my-subagent';
const SKILL_DIR = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(os.homedir(), '.config', 'agent-skills', SKILL_NAME);
const CONFIG_TEMPLATE = path.join(SKILL_DIR, 'config.json');

function loadConfig(profileName) {
  const candidates = [
    path.join(SKILL_DIR, '.config.json'),
    path.join(CONFIG_DIR, 'config.json'),
  ];

  let raw = null;
  let source = null;

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      source = p;
      break;
    }
  }

  if (!raw || !raw.profiles) {
    process.stderr.write(
      `ERROR: No valid config found.\n` +
      `Searched:\n` +
      candidates.map(p => `  - ${p}`).join('\n') + '\n\n' +
      `To configure:\n` +
      `  mkdir -p ${CONFIG_DIR}\n` +
      `  cp ${CONFIG_TEMPLATE} ${CONFIG_DIR}/config.json\n` +
      `  # Edit ${CONFIG_DIR}/config.json and fill in credentials\n`
    );
    process.exit(1);
  }

  const profile = profileName || process.env.SKILL_PROFILE || raw.active || 'default';
  const cfg = raw.profiles[profile];

  if (!cfg) {
    const available = Object.keys(raw.profiles).join(', ');
    process.stderr.write(
      `ERROR: Profile "${profile}" not found.\n` +
      `Available profiles: ${available}\n`
    );
    process.exit(1);
  }

  if (!cfg.pool || !cfg.pool.length) {
    process.stderr.write(
      `ERROR: Incomplete config in profile "${profile}".\n` +
      `Required: pool (non-empty array)\n` +
      `Config file: ${source}\n`
    );
    process.exit(1);
  }

  for (const entry of cfg.pool) {
    const name = typeof entry === 'object' ? entry.name : entry;
    const base = (typeof entry === 'object' && entry.api_base) || cfg.api_base;
    const key = (typeof entry === 'object' && entry.api_key) || cfg.api_key;
    if (!base || !key) {
      process.stderr.write(
        `ERROR: Model "${name}" has no api_base or api_key ` +
        `(neither in model entry nor profile-level defaults).\n` +
        `Config file: ${source}\n`
      );
      process.exit(1);
    }
  }

  process.stderr.write(`[profile: ${profile}]\n`);
  return { ...cfg, _profile: profile, _source: source };
}

function getDataDir() {
  const dir = path.join(CONFIG_DIR, 'tasks');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getStatsPath() {
  return path.join(CONFIG_DIR, 'stats.json');
}

function loadStats() {
  const p = getStatsPath();
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return {};
}

function saveStats(stats) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(getStatsPath(), JSON.stringify(stats, null, 2) + '\n');
}

function getModelName(entry) {
  return typeof entry === 'object' ? entry.name : entry;
}

function selectModel(cfg) {
  const stats = loadStats();
  const names = cfg.pool.map(getModelName);
  let minCount = Infinity;
  let selected = names[0];

  for (const name of names) {
    const count = stats[name] || 0;
    if (count < minCount) {
      minCount = count;
      selected = name;
    }
  }

  return selected;
}

function incrementModelCount(model) {
  const stats = loadStats();
  stats[model] = (stats[model] || 0) + 1;
  saveStats(stats);
}

function generateTaskId() {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(2).toString('hex');
  return `${ts}-${rand}`;
}

function getTaskDir(taskId) {
  const dir = path.join(getDataDir(), taskId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  SKILL_DIR,
  CONFIG_DIR,
  loadConfig,
  getDataDir,
  getStatsPath,
  loadStats,
  saveStats,
  selectModel,
  incrementModelCount,
  generateTaskId,
  getTaskDir,
};
