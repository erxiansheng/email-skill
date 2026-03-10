---
name: email-monitor
version: 3.0.0
author: community
description: >-
  When user asks to monitor inbox, check new emails, summarize emails,
  get email digest, review recent mail, send email, or start email
  monitoring service — fetch unread emails via IMAP from one or multiple
  mailboxes, summarize each email into structured markdown grouped by
  account, send emails via SMTP, and reply the summary directly in chat.
  Supports multi-account simultaneous monitoring and real-time notifications.
metadata:
  openclaw:
    emoji: "📬"
    requires:
      bins:
        - node
    install:
      - kind: node
        package: imapflow
        bins: []
      - kind: node
        package: mailparser
        bins: []
      - kind: node
        package: dotenv
        bins: []
      - kind: node
        package: nodemailer
        bins: []
triggers:
  - check email
  - monitor inbox
  - email summary
  - new mail
  - email digest
  - send email
  - compose email
  - 查看邮件
  - 邮件摘要
  - 监控邮箱
  - 新邮件
  - 查看所有邮箱
  - 发送邮件
  - 写邮件
  - 发邮件
  - 开始监控
  - 启动邮件监控
  - check all mailboxes
  - start email monitor
allowed-tools: ["bash", "exec"]
user-invocable: true
---

# 📬 Email Monitor — 多邮箱监控、摘要与发送技能

同时监控多个收件箱的新邮件，自动生成按账户分组的结构化 Markdown 摘要，支持实时邮件推送和邮件发送，直接在聊天中回复。

## 前置条件

1. 确保 Node.js 已安装（>=18）
2. 运行 `cd <skills_dir>/email-monitor && npm install` 安装依赖（以实际安装路径为准）
3. 配置邮箱（二选一）：
   - **多邮箱模式**：复制 `accounts.json.example` 为 `accounts.json`，编辑填入各邮箱的 IMAP 和 SMTP 信息
   - **单邮箱模式**：复制 `.env.example` 为 `.env`，填入一个邮箱的 IMAP 信息

`<skills_dir>` 指实际安装的 skills 根目录，常见示例：
- macOS/Linux：`~/.openclaw/skills`
- Windows：`%USERPROFILE%\.openclaw\skills`
已在技能目录中时，可直接执行后续 `node scripts/...` 命令，无需再 `cd`。

## 使用说明

### 一次交互原则

对每个用户问题只执行一次命令并直接用输出回复，优先使用 `| node scripts/summarize.js` 将 JSON 转成最终可读答案，避免多轮追问或中间步骤。

### 查看所有邮箱的未读邮件

当用户说"查看邮件"、"check email"、"有什么新邮件"、"查看所有邮箱"等：

1. 进入技能目录：`cd <skills_dir>/email-monitor`
2. 运行一次命令并直接回复输出：`node scripts/imap-monitor.js check --limit 10 --unseen | node scripts/summarize.js`

### 只查看某个邮箱

当用户说"查看工作邮箱"、"check work email"等：

1. 进入技能目录：`cd <skills_dir>/email-monitor`
2. 运行一次命令并直接回复输出：`node scripts/imap-monitor.js check --account <name> --limit 10 --unseen | node scripts/summarize.js`
   - `<name>` 是 accounts.json 中的 `name` 字段，如 `work`、`personal`
   - 支持逗号分隔多个：`--account work,personal`

### 查看指定时间范围的邮件

当用户说"最近2小时的邮件"、"今天的邮件"等：

1. 进入技能目录：`cd <skills_dir>/email-monitor`
2. 运行一次命令并直接回复输出：`node scripts/imap-monitor.js check --recent <时间> --limit 20 | node scripts/summarize.js`
   - 时间格式示例：`1h`（1小时）、`6h`（6小时）、`1d`（1天）、`7d`（7天）
   - 默认查询所有账户，可加 `--account <name>` 限定

### 读取最近一份邮件内容

当用户说"读取最近一份邮件内容"、"最新一封邮件"等：

1. 进入技能目录：`cd <skills_dir>/email-monitor`
2. 运行一次命令并直接回复输出：`node scripts/imap-monitor.js latest | node scripts/summarize.js --mode detail`
   - 可加 `--account <name>` 指定邮箱
   - 可加 `--recent 7d` 限定时间范围
   - 可加 `--unseen` 只看未读

### 获取单封邮件详情

当用户说"看看第3封邮件的详情"或提供了 UID 和账户名：

1. 进入技能目录：`cd <skills_dir>/email-monitor`
2. 运行一次命令并直接回复输出：`node scripts/imap-monitor.js fetch <uid> --account <name> | node scripts/summarize.js --mode detail`
   - 必须指定 `--account`（除非只配了一个邮箱）

### 搜索邮件

当用户说"搜索某人的邮件"、"找关于XX的邮件"：

1. 进入技能目录：`cd <skills_dir>/email-monitor`
2. 运行一次命令并直接回复输出：`node scripts/imap-monitor.js search --from <email> --subject <关键词> --unseen | node scripts/summarize.js`
   - 默认搜索所有账户，可加 `--account <name>` 限定

### 标记已读

当用户说"标记已读"：

1. 进入技能目录：`cd <skills_dir>/email-monitor`
2. 运行：`node scripts/imap-monitor.js mark-read <uid1,uid2,...> --account <name>`
   - 必须指定 `--account`（除非只配了一个邮箱）

### 启动实时邮件监控（服务模式）

当用户说"开始监控邮箱"、"启动邮件监控"、"start email monitor"等：

1. 进入技能目录：`cd <skills_dir>/email-monitor`
2. 在后台启动监控服务：`node scripts/imap-monitor.js monitor`
   - 使用 IMAP IDLE 实时监听新邮件，收到后立即输出 Markdown 通知
   - 默认监控所有账户，可加 `--account <name>` 限定
   - 连接断开后自动重连
   - 按 Ctrl+C 停止监控
3. 监控输出格式为 Markdown，包含：邮箱名称、发件人、主题、时间、内容预览、UID

### 发送邮件

当用户说"发送邮件"、"写邮件"、"发邮件"、"send email"等：

1. 从用户消息中提取：收件人邮箱、邮件主题、邮件正文、附件文件路径（如有）
2. 将邮件正文整理为 Markdown 格式
3. 进入技能目录：`cd <skills_dir>/email-monitor`
4. 运行发送命令并回复结果：`node scripts/imap-monitor.js send --to <收件人> --subject <主题> --body <正文> [--cc <抄送>] [--attach <附件路径>] --account <name> | node scripts/summarize.js --mode send`
   - `--to`：收件人邮箱地址（必填）
   - `--subject`：邮件主题
   - `--body`：邮件正文（支持 Markdown 格式，自动转换为 HTML）
   - `--cc`：抄送地址（可选）
   - `--attach`：附件文件路径，多个用逗号分隔（可选）
   - `--account`：发送账户（多账户时必填）
5. 也可通过 stdin 传递正文：`echo "正文内容" | node scripts/imap-monitor.js send --to <收件人> --subject <主题> --account <name> | node scripts/summarize.js --mode send`

### 列出已配置的账户

当用户说"我配了哪些邮箱"、"list accounts"：

1. 进入技能目录：`cd <skills_dir>/email-monitor`
2. 运行：`node scripts/imap-monitor.js list-accounts`
3. 将结果格式化为表格回复

---

## 多账户摘要模板

多邮箱时使用以下 Markdown 格式回复用户：

```markdown
## 📬 邮件摘要

> **3 个邮箱** | 共 12 封邮件 | 2026-03-10 14:30

| 邮箱 | 未读 | 已读 | 总量 | 匹配 | 状态 |
| ---- | ---- | ---- | ---- | ---- | ---- |
| 工作邮箱 | 5 | 12 | 17 | 5 | ✅ 正常 |
| 个人邮箱 | 7 | 4 | 11 | 7 | ✅ 正常 |
| Outlook | 0 | 3 | 3 | 0 | ✅ 正常 |

---

### 📧 工作邮箱

#### 1. {subject}
- **发件人：** {from}
- **时间：** {date}
- **摘要：** {1-2句话概括}
- **标签：** {智能标签}
- **UID：** `{uid}` | **账户：** `work`

#### 2. ...

---

### 📧 个人邮箱

#### 3. {subject}
...

---

> 💡 查看详情请指定账户："查看 work 账户 UID 42 的邮件"
> 💡 只看某个邮箱："查看 work 邮箱的邮件"
```

## 单账户摘要模板

只有一个邮箱时，格式和之前一样：

```markdown
## 📬 邮件摘要

> 未读 {unread} | 已读 {read} | 总量 {total} | 匹配 {count} | 邮箱：{label} | 检查时间：{timestamp}

---

### 1. {subject}
- **发件人：** {from}
- **时间：** {date}
- **摘要：** {概括}
- **标签：** {标签}
- **UID：** `{uid}`

---
```

## 详情模板

单封邮件详情使用以下格式：

```markdown
## 📧 邮件详情

| 字段     | 内容               |
| -------- | ------------------ |
| 主题     | {subject}          |
| 发件人   | {from}             |
| 收件人   | {to}               |
| 时间     | {date}             |
| UID      | `{uid}`            |
| 账户     | {accountLabel}     |
| 附件     | {attachments_list}  |

### 正文内容

{email_body_text}

---
> 💡 回复 "标记已读 {uid} --account {account}" 可将此邮件标为已读
```

## 发送结果模板

```markdown
## ✅ 邮件发送成功

| 字段 | 内容 |
| ---- | ---- |
| 发件人 | {from} |
| 收件人 | {to} |
| 主题 | {subject} |
| 账户 | {account} |
| 附件 | {attachmentCount} 个 |
| Message-ID | `{messageId}` |
```

## 实时监控通知模板

```markdown
## 📨 新邮件通知

> **{accountLabel}** | {date}

### {subject}

- **发件人：** {from}
- **收件人：** {to}
- **附件：** {attachmentCount} 个

**内容预览：**

{preview}

---
> UID: `{uid}` | 账户: `{account}`
```

## 注意事项

- 多账户模式下，`check`、`search` 和 `monitor` 默认并发查询/监控所有账户
- `fetch`、`mark-read` 和 `send` 必须用 `--account` 指定具体账户（UID 在不同账户间不唯一）
- 如果某个账户连接失败，不影响其他账户的结果，错误会在概览表格中显示
- 邮件正文过长时，只提取前 500 字并加 `...（全文已截断）`
- 摘要中的"标签"根据邮件内容智能判断
- 敏感信息（验证码、密码重置链接）自动标注 `🔒` 并隐藏
- 发送邮件需在 `accounts.json` 中配置 `smtp` 字段；若未配置，将从 `imap` 配置自动推导
- 邮件发送支持 Markdown 正文，自动转换为 HTML 格式
- 监控服务使用 IMAP IDLE 实现实时推送，连接断开后自动重连
