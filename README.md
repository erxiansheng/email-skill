# 📬 email-monitor — OpenClaw 多邮箱监控技能

同时监控多个收件箱新邮件，按账户分组生成 Markdown 摘要，直接回复到聊天中。

## 功能

- 同时监控多个邮箱账户（Gmail、QQ、163、Outlook 等）
- 并发拉取，单个账户连接失败不影响其他账户
- 按账户分组生成结构化 Markdown 摘要
- 按时间范围过滤邮件（最近 1h / 6h / 1d / 7d）
- 搜索特定发件人或主题的邮件（跨所有账户）
- 查看单封邮件完整详情
- 标记邮件为已读
- 自动分类标签（📌重要 / 📋工作 / 💰账单 / 📢通知 等）
- 自动隐藏敏感信息（验证码、密码重置链接）
- 向后兼容单邮箱 `.env` 配置

## 安装

### 方式一：手动安装

```bash
# 复制技能目录到 OpenClaw skills 目录
cp -r email-monitor-skill ~/.openclaw/skills/email-monitor

# 安装依赖
cd ~/.openclaw/skills/email-monitor
npm install

# 配置邮箱（二选一）
# 多邮箱模式：
cp accounts.json.example accounts.json
# 编辑 accounts.json 填入你的多个邮箱

# 单邮箱模式：
cp .env.example .env
# 编辑 .env 填入一个邮箱
```

### 方式二：ClawHub 安装（发布后）

```bash
clawhub install email-monitor
```

## 配置

### 多邮箱模式（推荐）

复制 `accounts.json.example` 为 `accounts.json` 并编辑：

```json
{
  "accounts": [
    {
      "name": "work",
      "label": "工作邮箱",
      "imap": {
        "host": "imap.gmail.com",
        "port": 993,
        "tls": true,
        "user": "work@gmail.com",
        "pass": "your_app_password",
        "mailbox": "INBOX"
      }
    },
    {
      "name": "personal",
      "label": "个人邮箱",
      "imap": {
        "host": "imap.qq.com",
        "port": 993,
        "tls": true,
        "user": "123456@qq.com",
        "pass": "your_auth_code",
        "mailbox": "INBOX"
      }
    }
  ]
}
```

每个账户字段说明：

| 字段           | 必填 | 说明                             |
| -------------- | ---- | -------------------------------- |
| `name`         | 是   | 账户标识符，用于 --account 参数  |
| `label`        | 否   | 显示名称，摘要中展示用           |
| `imap.host`    | 是   | IMAP 服务器地址                  |
| `imap.port`    | 否   | 端口，默认 993                   |
| `imap.tls`     | 否   | 是否启用 TLS，默认 true          |
| `imap.user`    | 是   | 邮箱账号                         |
| `imap.pass`    | 是   | 密码/授权码                      |
| `imap.mailbox` | 否   | 收件箱名称，默认 INBOX           |

### 单邮箱模式（向后兼容）

如果只监控一个邮箱，可以只用 `.env`：

```env
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your@gmail.com
IMAP_PASS=your_app_password
IMAP_TLS=true
IMAP_MAILBOX=INBOX
```

> 注意：当 `accounts.json` 存在时，`.env` 配置会被忽略。

### 各邮箱配置参考

| 邮箱     | host                   | 密码说明           |
| -------- | ---------------------- | ------------------ |
| Gmail    | imap.gmail.com         | 需要应用专用密码   |
| QQ 邮箱  | imap.qq.com            | 需要授权码         |
| 163 邮箱 | imap.163.com           | 需要授权码         |
| Outlook  | outlook.office365.com  | 账户密码或应用密码 |
| 126 邮箱 | imap.126.com           | 需要授权码         |
| 新浪邮箱 | imap.sina.com          | 需要授权码         |

## 使用

安装完成后，在 OpenClaw 聊天中直接说：

```
查看邮件              → 所有邮箱未读邮件
查看工作邮箱的邮件     → 只看 work 账户
最近2小时的邮件        → 按时间过滤（所有邮箱）
搜索来自 boss@co.com 的邮件  → 跨所有邮箱搜索
看看 work 账户 UID 42 的详情 → 指定账户看详情
标记已读 42,43 --account work → 批量标记
我配了哪些邮箱         → 列出账户
```

## 脚本直接调用

```bash
# 列出已配置的账户
node scripts/imap-monitor.js list-accounts

# 检查所有邮箱未读（默认行为）
node scripts/imap-monitor.js check --unseen --limit 10

# 只检查某个账户
node scripts/imap-monitor.js check --account work --unseen

# 检查多个指定账户
node scripts/imap-monitor.js check --account work,personal --unseen

# 最近 6 小时（所有邮箱）
node scripts/imap-monitor.js check --recent 6h

# 获取邮件详情（必须指定账户）
node scripts/imap-monitor.js fetch 42 --account work

# 搜索所有邮箱
node scripts/imap-monitor.js search --from "test@example.com" --unseen

# 搜索指定账户
node scripts/imap-monitor.js search --subject "会议" --account work

# 标记已读（必须指定账户）
node scripts/imap-monitor.js mark-read 42,43 --account work

# 列出所有账户的文件夹
node scripts/imap-monitor.js list-mailboxes

# 管道格式化
node scripts/imap-monitor.js check --unseen | node scripts/summarize.js
node scripts/imap-monitor.js fetch 42 --account work | node scripts/summarize.js --mode detail
```

## 目录结构

```
email-monitor-skill/
├── SKILL.md                # 技能定义（核心文件）
├── README.md               # 使用文档
├── package.json            # Node 依赖
├── accounts.json.example   # 多邮箱配置模板
├── .env.example            # 单邮箱配置模板（向后兼容）
└── scripts/
    ├── imap-monitor.js     # IMAP 多邮箱监控脚本
    └── summarize.js        # Markdown 摘要格式化工具
```

## 许可

MIT
