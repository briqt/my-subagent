#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CONFIG_DIR } = require('./_config');

function parseArgs(argv) {
  const args = argv.slice(2);

  if (args.length < 3) {
    process.stderr.write(
      `Usage: node feedback.js <task-id> <score> <comment>\n` +
      `  score: 0-10 (6 = passing, 8 = excellent)\n` +
      `  comment: brief evaluation (10-50 chars)\n`
    );
    process.exit(1);
  }

  const taskId = args[0];
  const score = parseFloat(args[1]);
  const comment = args.slice(2).join(' ');

  if (isNaN(score)) {
    process.stderr.write(`ERROR: score must be a number, got "${args[1]}"\n`);
    process.exit(1);
  }

  return { taskId, score, comment };
}

function main() {
  const { taskId, score, comment } = parseArgs(process.argv);
  const taskDir = path.join(CONFIG_DIR, 'tasks', taskId);
  const metaPath = path.join(taskDir, 'meta.json');

  if (!fs.existsSync(metaPath)) {
    process.stderr.write(
      `ERROR: Task not found: ${taskId}\n` +
      `Searched: ${metaPath}\n`
    );
    process.exit(1);
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  meta.score = score;
  meta.comment = comment;
  meta.feedback_at = new Date().toISOString();
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');

  process.stderr.write(`[feedback: ${taskId}] score=${score}\n`);
  process.stdout.write(JSON.stringify({
    task_id: meta.task_id,
    score: meta.score,
    comment: meta.comment,
  }) + '\n');
}

main();
