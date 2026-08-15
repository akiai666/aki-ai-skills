---
name: vibe-coding-research-first
description: "Research-first workflow for Vibe Coding. Use this skill whenever a user wants to build an app, product, tool, website, automation, or coding project with Codex, Claude Code, Cursor, Windsurf, or another AI coding agent; whenever they ask for a coding prompt; or whenever they say '先调研再开发', '不要重复造轮子', 'Build or Buy', '先别写代码'. Before implementation, force a verified workflow: requirements → GitHub/product research → comparison → Build or Buy decision → product definition → technical plan → development plan. Do not create a project or write implementation code until the user explicitly confirms."
version: 0.1.0
author: Aki Huang
license: MIT
---

# Vibe Coding：先调研，再开发

把 AI Coding Agent 当成产品和技术决策助手，而不是立即写代码的打字机。先证明这件事值得自己做，再决定怎么做，最后才进入开发。

## Default behavior

默认只输出一份“调研与开发决策报告”，不创建项目、不修改代码、不安装依赖。

只有用户明确说“开始开发”“按这个方案实现”“直接做 MVP”等确认语句后，才进入实现阶段。实现阶段继续以本报告为约束，不能悄悄扩大需求。

如果用户只给了一句话需求，先从这句话开始，不要因为信息不完整就马上创建脚手架。最多提出 3 个会实质影响结论的问题；其余信息先标记为假设。

## Research rules

- 有联网、GitHub 或搜索能力时，使用当前可验证的信息；优先 GitHub、官方文档、产品官网和公开 Issue/Discussion。
- 至少调研 3 个、最多 5 个真正相关的项目或产品。相关性不足时减少数量并解释原因，不要为了凑数。
- 记录项目地址、调研日期、维护状态和关键证据。Star、版本、最后提交时间等会变化的信息必须以当前页面为准。
- 禁止凭记忆伪造项目、链接、Star 数、功能、技术栈、维护状态或用户反馈。无法确认就写“未确认”。
- 研究结果要区分“已验证事实”“项目自述”“你的判断”。不要把推测写成事实。
- 如果没有联网能力，明确说明“本次无法完成实时调研”，不要假装已经搜索；可以先给初步框架，并停在决策门前。

## Workflow

### 1. Understand the request

先整理初步需求，不讨论具体代码：

- 核心问题与目标用户
- 核心使用场景
- 必须有的功能与可选功能
- 可能遗漏的需求与边界情况
- 隐私、安全、权限、性能、扩展性
- 部署、维护和成本约束

对模糊之处写出假设；只有关键阻塞点才提问。

### 2. Research existing solutions

搜索 GitHub、官方文档和成熟产品，逐项记录：

- 项目/产品名称与地址
- 定位和核心功能
- 技术栈与架构特点（只有查到才写）
- 最近维护情况与证据
- 优点、缺点和已知限制
- 与当前需求的匹配度
- 可以借鉴、复用或组合的部分

重点阅读 README、官方文档、最近提交、Release、Issue 和 Discussion。不要只看 Star。

### 3. Compare horizontally

用表格比较至少这些维度：功能完整度、需求匹配度、活跃度、部署复杂度、二次开发难度、扩展性、用户体验、技术债风险、可复用程度。

随后总结三件事：

1. 可以直接借鉴的已验证设计；
2. 别人已经踩过的坑；
3. 现有方案仍未解决的市场空缺。

### 4. Make the Build or Buy decision

必须明确推荐以下一种：

- **A：直接使用现有产品**：已有方案能满足约 80%—100% 的需求；
- **B：基于开源项目二次开发**：成熟项目已解决大部分底层问题；
- **C：组合现有组件**：用开源项目、SaaS、SDK、API 或数据库拼出最短路径；
- **D：自己开发**：现有方案无法满足核心需求，且差异化足以抵消开发与维护成本。

如果建议 A/B/C，直接说明“不建议从零开发”，并给出具体替代路径。不要为了让用户继续写代码而默认选 D。

### 5. Redefine the product

结合调研重新整理：

- 产品目标
- 目标用户
- 核心场景
- MVP 功能
- 后续功能
- 明确不做的功能
- 核心差异化

主动删除伪需求，把真正值得开发的部分说清楚。

### 6. Draft the technical plan

只有完成 Build or Buy 判断后，才给技术方案：

- 推荐技术栈与选择理由
- 系统架构和核心模块
- 数据模型与 API 边界
- 可复用的开源组件、SDK 或服务
- 部署、权限、安全、测试与维护策略
- 主要风险、验证方式和回滚方案

优先选择简单、成熟、稳定、维护成本低的方案。每个重要技术选择都回答“为什么选它，而不是更复杂或更流行的替代方案”。

### 7. Draft the development plan

按以下阶段拆分，每个阶段说明目标、理由、依赖、验收方式和暂不做的事情：

- **Phase 0：技术验证**：先验证最大风险；
- **Phase 1：最小可运行版本**：打通完整链路；
- **Phase 2：MVP**：完成真正可使用的核心功能；
- **Phase 3：体验完善**：再做非核心功能、性能和体验优化。

## Required report format

输出报告时使用以下结构，先给结论，再给证据：

```markdown
# Vibe Coding 调研与开发决策

## 结论先说
- Build or Buy：A / B / C / D
- 一句话理由：
- 当前建议：直接使用 / 二次开发 / 组合组件 / 自研

## 1. 初步需求
## 2. 现有方案调研
### 方案 A
### 方案 B
### 方案 C
## 3. 横向比较
## 4. 可借鉴设计、已知坑与市场空缺
## 5. 重新定义产品
## 6. 技术方案
## 7. 开发计划
## 8. 未确认信息与待决问题

## 下一步
如果你确认这个方向，再回复：**开始开发**。
```

调研报告可以使用 Markdown 表格，但不要用表格掩盖关键判断。项目地址要放在对应项目旁边，不要集中堆到文末。

## Implementation handoff

用户确认开始开发后：

1. 先复述已确认的 Build or Buy 结论、MVP 范围和不做清单；
2. 只实现 Phase 0/Phase 1 中已确认的内容；
3. 如果实现过程中发现报告结论不成立，先停下来说明证据和影响，等待用户确认；
4. 不得把“开始开发”理解成“把所有后续功能一次做完”。
