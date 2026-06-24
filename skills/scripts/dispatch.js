#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  loadConfig,
  selectModel,
  incrementModelCount,
  generateTaskId,
  getTaskDir,
} = require('./_config');

function parseArgs(argv) {
  const args = argv.slice(2);
  let promptFile = null;
  let taskName = null;
  let profile = null;
  let timeout = 3600000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) {
      taskName = args[++i];
    } else if (args[i] === '--profile' && args[i + 1]) {
      profile = args[++i];
    } else if (args[i] === '--timeout' && args[i + 1]) {
      timeout = parseInt(args[++i], 10) * 1000;
    } else if (!args[i].startsWith('-') && !promptFile) {
      promptFile = args[i];
    }
  }

  if (!promptFile) {
    process.stderr.write(
      `Usage: node dispatch.js <prompt-file> [--name <task-name>] [--profile <name>] [--timeout <seconds>]\n`
    );
    process.exit(1);
  }

  const resolved = path.resolve(promptFile);
  if (!fs.existsSync(resolved)) {
    process.stderr.write(`ERROR: Prompt file not found: ${resolved}\n`);
    process.exit(1);
  }

  if (!taskName) {
    taskName = path.basename(resolved, path.extname(resolved));
  }

  return { promptFile: resolved, taskName, profile, timeout };
}

function resolveModel(cfg, modelName) {
  const pool = cfg.pool || [];
  for (const entry of pool) {
    if (typeof entry === 'object' && entry.name === modelName) {
      return {
        name: modelName,
        api_base: entry.api_base || cfg.api_base,
        api_key: entry.api_key || cfg.api_key,
      };
    }
  }
  return { name: modelName, api_base: cfg.api_base, api_key: cfg.api_key };
}

function buildEnv(resolved) {
  const env = { ...process.env };
  const set = (key, val) => { if (val) env[key] = val; };
  set('ANTHROPIC_BASE_URL', resolved.api_base);
  set('ANTHROPIC_AUTH_TOKEN', resolved.api_key);
  set('ANTHROPIC_MODEL', resolved.name);
  set('ANTHROPIC_DEFAULT_OPUS_MODEL', resolved.name);
  set('ANTHROPIC_DEFAULT_SONNET_MODEL', resolved.name);
  set('ANTHROPIC_DEFAULT_HAIKU_MODEL', resolved.name);
  set('CLAUDE_CODE_SUBAGENT_MODEL', resolved.name);
  return env;
}

function main() {
  const { promptFile, taskName, profile, timeout } = parseArgs(process.argv);
  const cfg = loadConfig(profile);
  const model = selectModel(cfg);
  const resolved = resolveModel(cfg, model);
  const taskId = generateTaskId();
  const taskDir = getTaskDir(taskId);

  process.stderr.write(`[task: ${taskId}]\n`);

  fs.copyFileSync(promptFile, path.join(taskDir, 'prompt.md'));

  const prompt = fs.readFileSync(promptFile, 'utf8');
  const effort = cfg.effort || 'max';
  const startTime = Date.now();

  let jsonOutput;
  let exitCode = 0;

  try {
    const stdout = execSync(
      `claude -p --output-format json --effort ${effort}`,
      {
        input: prompt,
        env: buildEnv(resolved),
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        timeout,
      }
    );
    jsonOutput = JSON.parse(stdout);
  } catch (err) {
    exitCode = err.status || 1;
    if (err.stdout) {
      try {
        jsonOutput = JSON.parse(err.stdout);
      } catch (_) {
        // stdout not valid JSON — write raw error
        const errMsg = err.stderr || err.message || 'Unknown error';
        fs.writeFileSync(path.join(taskDir, 'output.md'), '');
        fs.writeFileSync(path.join(taskDir, 'error.log'), errMsg);
        fs.writeFileSync(path.join(taskDir, 'meta.json'), JSON.stringify({
          task_id: taskId,
          task_name: taskName,
          model,
          dispatched_at: new Date(startTime).toISOString(),
          duration_ms: Date.now() - startTime,
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: 0,
          exit_code: exitCode,
          score: null,
          comment: null,
        }, null, 2) + '\n');
        incrementModelCount(model);
        process.stderr.write(`ERROR: claude -p failed (exit ${exitCode})\n`);
        process.exit(exitCode);
      }
    } else {
      const errMsg = err.stderr || err.message || 'Unknown error';
      fs.writeFileSync(path.join(taskDir, 'output.md'), '');
      fs.writeFileSync(path.join(taskDir, 'error.log'), errMsg);
      fs.writeFileSync(path.join(taskDir, 'meta.json'), JSON.stringify({
        task_id: taskId,
        task_name: taskName,
        model,
        dispatched_at: new Date(startTime).toISOString(),
        duration_ms: Date.now() - startTime,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        exit_code: exitCode,
        score: null,
        comment: null,
      }, null, 2) + '\n');
      incrementModelCount(model);
      process.stderr.write(`ERROR: claude -p failed (exit ${exitCode})\n`);
      process.exit(exitCode);
    }
  }

  const result = jsonOutput.result || '';
  const duration = jsonOutput.duration_ms || (Date.now() - startTime);
  const usage = jsonOutput.usage || {};

  const meta = {
    task_id: taskId,
    task_name: taskName,
    model,
    dispatched_at: new Date(startTime).toISOString(),
    duration_ms: duration,
    input_tokens: usage.input_tokens || 0,
    output_tokens: usage.output_tokens || 0,
    cost_usd: jsonOutput.total_cost_usd || 0,
    exit_code: exitCode,
    score: null,
    comment: null,
  };

  fs.writeFileSync(path.join(taskDir, 'output.md'), result);
  fs.writeFileSync(path.join(taskDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  incrementModelCount(model);

  process.stdout.write(result);

  const scriptDir = __dirname;
  process.stderr.write(
    `[feedback] node ${scriptDir}/feedback.js ${taskId} <score> "<comment>"\n`
  );
}

main();
