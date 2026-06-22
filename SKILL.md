---
name: my-subagent
description: "子代理委派模式 — 通过均衡调度的模型池派发任务。使用前必须阅读本文档理解委派协议。当需要将工作委派给子代理执行时使用：多文件读取分析、代码搜索与修改、方案实现、测试验证、信息整理等超过 2-3 步的工作。也适用于 delegate、派发任务、委派子代理、parallel workers 等场景。"
---

# my-subagent — 子代理委派模式

通过模型池均衡调度，将任务派发给子代理执行。主会话只做决策和融合，执行工作全部委派。

## 核心原则

主会话上下文极其珍贵。凡是不需要综合推理的工作，必须委派子代理执行。

**你的角色**：总指挥。只做任务拆解、决策、融合、质量把关、用户沟通。
**子代理**：执行者。信息收集、代码操作、方案草拟、验证测试、重复性工作。

子代理端点通过模型池均衡调度，多用、并行用、冗余用。

优先级：质量 > 正确性 > 完整性 > 多方案交叉验证 >> 速度与成本。

---

## 安装与配置

如果 `my-subagent` 脚本目录不存在，先安装：

```bash
npx skills add briqt/my-subagent -g
```

配置模型池（首次使用前必须完成）：

```bash
mkdir -p ~/.config/agent-skills/my-subagent
# 复制模板并填入实际值
cp <skill-dir>/config.json ~/.config/agent-skills/my-subagent/config.json
```

配置文件结构：
```json
{
  "active": "default",
  "profiles": {
    "default": {
      "api_base": "http://your-litellm-host:4000",
      "api_key": "sk-your-key",
      "pool": ["model-a", "model-b"],
      "effort": "max"
    }
  }
}
```

---

## 使用流程

### 完整工作流：准备 → 派发 → 验收 → 评分

```bash
# 1. 准备 prompt 文件（必须自包含）
#    用 Write 工具写入 prompt 文件

# 2. 派发任务
node <skill-dir>/scripts/dispatch.js /path/to/prompt.md --name "task-slug" \
  > /path/to/output.md 2> /path/to/dispatch.log

# 3. 验收（强制，见下方验收仪式）

# 4. 评分
TASK_ID=$(grep '\[task:' /path/to/dispatch.log | sed 's/.*\[task: \(.*\)\]/\1/')
node <skill-dir>/scripts/feedback.js "$TASK_ID" <score> "<comment>"
```

---

## dispatch 命令

```bash
node <skill-dir>/scripts/dispatch.js <prompt-file> [--name <task-name>] [--profile <name>]
```

**参数：**
- `<prompt-file>` — prompt 文件路径（绝对或相对），文件内容将作为子代理的完整输入
- `--name` — 任务简称（用于日志和追踪），省略时取文件名
- `--profile` — 指定配置 profile，省略时使用 active profile

**行为：**
- stdout：子代理的完整输出文本（可直接重定向到文件）
- stderr：`[profile: xxx]`、`[task: <task-id>]`
- 自动将 prompt 和 output 归档到 `~/.config/agent-skills/my-subagent/tasks/<task-id>/`
- 自动记录耗时、token 数、模型等元数据
- 模型从池中均衡选择（最少调用次数优先）

**并行派发：** 在同一消息中发多个 Bash 调用（run_in_background），每个调用一次 dispatch。

---

## feedback 命令

```bash
node <skill-dir>/scripts/feedback.js <task-id> <score> <comment>
```

**参数：**
- `<task-id>` — dispatch 输出的 task ID
- `<score>` — 0~10 分（6 分及格，8 分优秀）
- `<comment>` — 简短评价（一句话）

**评分标准：**
- 0-3：完全不可用，答非所问或严重错误
- 4-5：方向对但质量不够，需要大幅返工
- 6-7：及格，基本完成任务但有瑕疵
- 8-9：优秀，完整准确，可直接使用
- 10：完美，超出预期

---

## Prompt 编写要求

子代理无对话上下文，prompt 必须自包含。包含：

1. **任务目标** — 清晰描述要完成什么
2. **相关文件路径** — 使用绝对路径
3. **已知约束** — 不能做什么、必须遵守什么
4. **输出格式期望** — 期望什么样的结果

多 worker 共享的背景信息，写入独立的 context 文件，在每个 worker 的 prompt 开头注明 "先读 /path/to/context.md"。不要在每个 prompt 里重复相同信息。

prompt 文件写好后不要删除——失败重派、换模型重跑时可直接复用。

---

## 验收仪式（强制）

派发后、使用结果前，必须依次确认，**全部通过才能使用产出**：

1. dispatch 的 exit code == 0（检查 stderr 或 `$?`）
2. 输出文件非空
3. 抽查产出开头结尾，确认完整、未截断、且确实在回答所派任务

产出形式可能有两种，都是正常的：
- **直接输出**：完整结果在 stdout（即 output 文件）中
- **文件输出**：子代理将详细结果写入磁盘文件，stdout 中包含文件路径和简要摘要

对于文件输出的情况，读取 stdout 中提到的文件路径即可获取完整产出。

任何一条不过 → 读 dispatch.log 和 `tasks/<task-id>/error.log` 定位原因，修正 prompt 后重派。

---

## 委派规则

**必须委派**（超过 2-3 步的信息收集、任何代码修改草稿、验证测试）：
- 多文件读取和内容分析
- 代码搜索、依赖追踪、结构梳理
- git log/diff/status 等信息整理
- 方案实现和代码编写
- 测试运行、编译检查、lint

**主会话保留**：
- 任务拆解和委派策略
- 多结果综合判断和融合
- 架构决策和方案选择
- 用户沟通和确认
- 最终质量审核

单次简单 grep/read 不必委派，判断依据是"是否值得启动一个子代理"。

---

## 派发策略

### 任务拆解

拆解的核心判断：子任务之间是否有依赖。无依赖 → 并行；有依赖 → 分波次串行。

常见拆法：
- 按维度：文档 vs 源码、前端 vs 后端、正确性 vs 性能
- 按阶段：调研 → 方案 → 实现 → 验证
- 按范围：每个模块/文件/组件各一个 worker

### 冗余换质量

同一问题派多个 worker 独立求解，比较结论一致性。适用于：
- 重要决策（架构选型、方案取舍）
- 不确定性高的分析（多个 worker 可能得出不同结论）
- 需要交叉验证的场景

不同 worker 可以给不同约束或视角引导差异化思考。

### 并行派发

在同一消息中发送多个 Bash 调用（run_in_background=true），每个调用独立 dispatch：

```bash
# Worker 1
node <skill-dir>/scripts/dispatch.js /tmp/subagent/task/w1_prompt.md --name "w1-analyze" \
  > /tmp/subagent/task/w1_out.md 2> /tmp/subagent/task/w1.log

# Worker 2（同一消息，并行）
node <skill-dir>/scripts/dispatch.js /tmp/subagent/task/w2_prompt.md --name "w2-implement" \
  > /tmp/subagent/task/w2_out.md 2> /tmp/subagent/task/w2.log
```

### 并行写隔离

子代理继承主会话的工作目录。多个 worker 并行修改文件时需要隔离，否则后写覆盖先写。

**git 项目**：每个写代码的 worker 分配独立 worktree，prompt 中指定其工作目录。主会话负责合并各 worktree 产物。

```bash
# 主会话创建 worktree
git worktree add /tmp/subagent/task/wt1 -b worker-1
git worktree add /tmp/subagent/task/wt2 -b worker-2

# prompt 中告知 worker：
#   你的工作目录是 /tmp/subagent/task/wt1，只在此目录内修改文件。

# 完成后主会话合并或 cherry-pick
```

**非 git 项目**：并行 worker 只做读取和分析，代码修改串行执行（一个 writer 或分波次）。

**判断规则**：
- 多 worker 读同一目录 → 安全，无需隔离
- 多 worker 写不同文件 → 通常安全，但建议 prompt 中明确各自 scope
- 多 worker 可能写同一文件 → 必须隔离（worktree）或串行

### 多波次

第一波结果不够时，可基于结果追加任务。prompt 中引用前一波的输出文件路径即可：

```
请阅读以下分析结果：/tmp/subagent/task/w1_out.md
基于此结果，进一步完成 ...
```

每波次复用同一任务目录，按 w1/w2/w3 编号区分。

---

## 融合与输出

- 审查每个产出，比较优劣，发现冲突
- 方案互斥时做取舍并说明理由
- 融合多方案优点，给出最终推荐
- 提取关键信息，不要全部转述给用户
- 标注剩余不确定性和已知局限

---

## 韧性

- 子代理失败时重试或换角度重派（prompt 文件还在，重派成本极低）
- 部分失败时利用已有结果继续推进
- token 投入无法带来增量价值时停止扩展，收束结论
