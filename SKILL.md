---
name: email-monitor
version: 2.0.0
author: community
description: >-
  When user asks to monitor inbox, check new emails, summarize emails,
  get email digest, or review recent mail — fetch unread emails via IMAP
  from one or multiple mailboxes, summarize each email into structured
  markdown grouped by account, and reply the summary directly in chat.
  Supports multi-account simultaneous monitoring.
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
triggers:
  - check email
  - monitor inbox
  - email summary
  - new mail
  - email digest
  - 查看邮件
  - 邮件摘要
  - 监控邮箱
  - 新邮件
  - 查看所有邮箱
  - check all mailboxes
allowed-tools: ["bash", "exec"]
user-invocable: true
---

# 📬 Email Monitor — 多邮箱监控与摘要技能

同时监控多个收件箱的新邮件，自动生成按账户分组的结构化 Markdown 摘要，直接在聊天中回复。

## 前置条件

1. 确保 Node.js 已安装（>=18）
2. 运行 `cd ~/.openclaw/skills/email-monitor && npm install` 安装依赖
3. 配置邮箱（二选一）：
   - **多邮箱模式**：复制 `accounts.json.example` 为 `accounts.json`，编辑填入各邮箱信息
   - **单邮箱模式**：复制 `.env.example` 为 `.env`，填入一个邮箱的 IMAP 信息

## 使用说明

### 查看所有邮箱的未读邮件

当用户说"查看邮件"、"check email"、"有什么新邮件"、"查看所有邮箱"等：

1. 进入技能目录：`cd ~/.openclaw/skills/email-monitor`
2. 先列出已配置账户确认状态：`node scripts/imap-monitor.js list-accounts`
3. 运行邮件检查（自动查询所有账户）：`node scripts/imap-monitor.js check --limit 10 --unseen`
4. 脚本会输出多账户 JSON（每封邮件带 `account` 和 `accountLabel` 字段）
5. 将 JSON 结果按照下方【多账户摘要模板】格式化为 Markdown
6. 回复到聊天中

### 只查看某个邮箱

当用户说"查看工作邮箱"、"check work email"等：

1. 进入技能目录：`cd ~/.openclaw/skills/email-monitor`
2. 运行：`node scripts/imap-monitor.js check --account <name> --limit 10 --unseen`
   - `<name>` 是 accounts.json 中的 `name` 字段，如 `work`、`personal`
   - 支持逗号分隔多个：`--account work,personal`
3. 按【摘要模板】格式化并回复

### 查看指定时间范围的邮件

当用户说"最近2小时的邮件"、"今天的邮件"等：

1. 进入技能目录：`cd ~/.openclaw/skills/email-monitor`
2. 运行：`node scripts/imap-monitor.js check --recent <时间> --limit 20`
   - 时间格式示例：`1h`（1小时）、`6h`（6小时）、`1d`（1天）、`7d`（7天）
   - 默认查询所有账户，可加 `--account <name>` 限定
3. 按【摘要模板】格式化并回复

### 获取单封邮件详情

当用户说"看看第3封邮件的详情"或提供了 UID 和账户名：

1. 进入技能目录：`cd ~/.openclaw/skills/email-monitor`
2. 运行：`node scripts/imap-monitor.js fetch <uid> --account <name>`
   - 必须指定 `--account`（除非只配了一个邮箱）
3. 按【详情模板】格式化并回复

### 搜索邮件

当用户说"搜索某人的邮件"、"找关于XX的邮件"：

1. 进入技能目录：`cd ~/.openclaw/skills/email-monitor`
2. 运行：`node scripts/imap-monitor.js search --from <email> --subject <关键词> --unseen`
   - 默认搜索所有账户，可加 `--account <name>` 限定
3. 按【摘要模板】格式化并回复

### 标记已读

当用户说"标记已读"：

1. 进入技能目录：`cd ~/.openclaw/skills/email-monitor`
2. 运行：`node scripts/imap-monitor.js mark-read <uid1,uid2,...> --account <name>`
   - 必须指定 `--account`（除非只配了一个邮箱）

### 列出已配置的账户

当用户说"我配了哪些邮箱"、"list accounts"：

1. 进入技能目录：`cd ~/.openclaw/skills/email-monitor`
2. 运行：`node scripts/imap-monitor.js list-accounts`
3. 将结果格式化为表格回复

---

## 多账户摘要模板

多邮箱时使用以下 Markdown 格式回复用户：

```markdown
## 📬 邮件摘要

> **3 个邮箱** | 共 12 封邮件 | 2026-03-10 14:30

| 邮箱 | 未读 | 总匹配 | 状态 |
| ---- | ---- | ------ | ---- |
| 工作邮箱 | 5 | 5 | ✅ 正常 |
| 个人邮箱 | 7 | 7 | ✅ 正常 |
| Outlook | 0 | 0 | ✅ 正常 |

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

> 共 {count} 封未读邮件 | 邮箱：{label} | 检查时间：{timestamp}

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

## 注意事项

- 多账户模式下，`check` 和 `search` 默认并发查询所有账户
- `fetch` 和 `mark-read` 必须用 `--account` 指定具体账户（UID 在不同账户间不唯一）
- 如果某个账户连接失败，不影响其他账户的结果，错误会在概览表格中显示
- 邮件正文过长时，只提取前 500 字并加 `...（全文已截断）`
- 摘要中的"标签"根据邮件内容智能判断
- 敏感信息（验证码、密码重置链接）自动标注 `🔒` 并隐藏
