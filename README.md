# my-subagent

Sub-agent dispatch with automatic model pool load balancing. Designed for AI agents that delegate tasks to other model instances.

Dispatches tasks through a configurable model pool (e.g. LiteLLM proxy), automatically balancing usage across models. Archives every prompt, output, and metadata for traceability. Supports post-task feedback scoring.

## Install as agent skill

```bash
npx skills add briqt/my-subagent -g
```

Requirements: Node.js 18+, `claude` CLI available on PATH.

## Quick Start

Configure the model pool (one-time):

```bash
mkdir -p ~/.config/agent-skills/my-subagent
cat > ~/.config/agent-skills/my-subagent/config.json << 'EOF'
{
  "active": "default",
  "profiles": {
    "default": {
      "api_base": "http://your-litellm-host:4000",
      "api_key": "sk-your-key",
      "pool": ["glm-5.2[1m]", "kimi-k2.7-code"],
      "effort": "max"
    }
  }
}
EOF
```

Dispatch a task:

```bash
# Write a prompt file
echo "List all exported functions in src/index.ts" > /tmp/prompt.md

# Dispatch (model selected automatically)
node <skill-dir>/scripts/dispatch.js /tmp/prompt.md --name "list-exports" \
  > /tmp/result.md 2> /tmp/dispatch.log

# Check the result
cat /tmp/result.md

# Submit feedback
TASK_ID=$(grep '\[task:' /tmp/dispatch.log | sed 's/.*\[task: \(.*\)\]/\1/')
node <skill-dir>/scripts/feedback.js "$TASK_ID" 8 "Accurate and complete"
```

## Configuration

Config location: `~/.config/agent-skills/my-subagent/config.json`

| Field | Description |
|-------|-------------|
| `api_base` | LiteLLM or compatible API base URL |
| `api_key` | API key for the endpoint |
| `pool` | Array of model names to balance across |
| `effort` | Reasoning effort: `low`, `medium`, `high`, `max` |

Supports multiple profiles. Switch with `--profile <name>` or set the `active` field.

## Data Directory

All task data is stored in `~/.config/agent-skills/my-subagent/`:

```
config.json          # Runtime configuration
stats.json           # Per-model invocation counts
tasks/
  <task-id>/
    prompt.md        # Archived prompt
    output.md        # Sub-agent output
    meta.json        # Metadata: model, tokens, duration, feedback
```

## How It Works

1. **Model selection**: Picks the model with the fewest invocations (even distribution)
2. **Execution**: Runs `claude -p --output-format json` with the selected model's env vars
3. **Archival**: Copies prompt, saves output and metadata to the data directory
4. **Output**: Streams the result text to stdout (pipe-compatible)
5. **Feedback hint**: Prints a ready-to-run feedback command to stderr, prompting the caller to score the task
6. **Feedback**: Optional post-task scoring updates the archived metadata

The dispatch script is transparent — callers don't know which model handled their task. Stats track distribution for observability.

## License

MIT
