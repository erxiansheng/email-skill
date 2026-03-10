#!/usr/bin/env node

/**
 * email-monitor skill — IMAP 多邮箱监控脚本
 *
 * 支持同时配置多个邮箱账户，通过 accounts.json 管理。
 * 兼容单账户 .env 配置（向后兼容）。
 *
 * 命令:
 *   check    [--limit N] [--unseen] [--recent <time>] [--account NAME | --all]
 *   fetch    <uid> --account NAME [--mailbox NAME]
 *   search   [--from X] [--subject X] [--unseen] [--account NAME | --all]
 *   mark-read <uid1,uid2,...> --account NAME [--mailbox NAME]
 *   list-mailboxes [--account NAME | --all]
 *   list-accounts  列出所有已配置账户
 */

const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const path = require("path");
const fs = require("fs");

// 加载 .env（向后兼容单账户）
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const SKILL_DIR = path.join(__dirname, "..");
const ACCOUNTS_FILE = path.join(SKILL_DIR, "accounts.json");

// ─── 账户加载 ──────────────────────────────────────────────

function loadAccounts() {
  // 优先读 accounts.json
  if (fs.existsSync(ACCOUNTS_FILE)) {
    const raw = fs.readFileSync(ACCOUNTS_FILE, "utf8");
    const data = JSON.parse(raw);
    const accounts = data.accounts || [];
    if (accounts.length > 0) return accounts;
  }

  // 向后兼容：从 .env 单账户构造
  if (process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASS) {
    return [
      {
        name: "default",
        label: process.env.IMAP_USER,
        imap: {
          host: process.env.IMAP_HOST,
          port: parseInt(process.env.IMAP_PORT || "993", 10),
          tls: process.env.IMAP_TLS !== "false",
          user: process.env.IMAP_USER,
          pass: process.env.IMAP_PASS,
          mailbox: process.env.IMAP_MAILBOX || "INBOX",
        },
      },
    ];
  }

  return [];
}

function resolveAccounts(args) {
  const all = loadAccounts();
  if (all.length === 0) {
    console.error(
      "Error: 未找到邮箱配置。请创建 accounts.json 或 .env 文件。\n" +
        "参考 accounts.json.example 配置多邮箱。"
    );
    process.exit(1);
  }

  // --all 或无指定 → 全部账户
  if (args.all === true || !args.account) {
    return all;
  }

  // --account name1,name2 → 按名称筛选（支持逗号分隔多个）
  const names = args.account.split(",").map((n) => n.trim().toLowerCase());
  const matched = all.filter((a) => names.includes(a.name.toLowerCase()));
  if (matched.length === 0) {
    const available = all.map((a) => a.name).join(", ");
    console.error(
      `Error: 未找到账户 "${args.account}"。可用账户: ${available}`
    );
    process.exit(1);
  }
  return matched;
}

function resolveSingleAccount(args) {
  const all = loadAccounts();
  if (all.length === 0) {
    console.error("Error: 未找到邮箱配置。");
    process.exit(1);
  }

  if (args.account) {
    const name = args.account.toLowerCase();
    const found = all.find((a) => a.name.toLowerCase() === name);
    if (!found) {
      const available = all.map((a) => a.name).join(", ");
      console.error(
        `Error: 未找到账户 "${args.account}"。可用账户: ${available}`
      );
      process.exit(1);
    }
    return found;
  }

  // 只有一个账户时自动选择
  if (all.length === 1) return all[0];

  // 多账户未指定 → 报错
  const available = all.map((a) => `${a.name} (${a.label})`).join(", ");
  console.error(
    `Error: 存在多个账户，请用 --account <name> 指定。可用: ${available}`
  );
  process.exit(1);
}

// ─── 工具函数 ──────────────────────────────────────────────

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function parseRecent(timeStr) {
  const match = timeStr.match(/^(\d+)([mhdw])$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const ms = { m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return new Date(Date.now() - num * (ms[unit] || 0));
}

function truncate(text, maxLen = 500) {
  if (!text) return "";
  text = text.replace(/\r?\n/g, " ").trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...（全文已截断）";
}

function formatTimestamp(isoStr) {
  if (!isoStr) return "未知时间";
  const d = new Date(isoStr);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

function formatNewMailNotification(email) {
  const lines = [];
  lines.push(`\n## 📨 新邮件通知\n`);
  lines.push(`> **${email.accountLabel}** | ${formatTimestamp(email.date)}\n`);
  lines.push(`### ${email.subject}\n`);
  lines.push(`- **发件人：** ${email.from}`);
  lines.push(`- **收件人：** ${email.to}`);
  if (email.hasAttachments) {
    lines.push(`- **附件：** ${email.attachmentCount} 个`);
  }
  lines.push(`\n**内容预览：**\n`);
  lines.push(email.preview || "(无内容)");
  lines.push(`\n---`);
  lines.push(`> UID: \`${email.uid}\` | 账户: \`${email.account}\``);
  lines.push("");
  return lines.join("\n");
}

function markdownToHtml(md) {
  if (!md) return "";
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");
  html = "<p>" + html + "</p>";
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6;">${html}</div>`;
}

// ─── IMAP 连接 ─────────────────────────────────────────────

async function connect(account) {
  const imap = account.imap;
  const client = new ImapFlow({
    host: imap.host,
    port: imap.port || 993,
    secure: imap.tls !== false,
    auth: { user: imap.user, pass: imap.pass },
    logger: false,
  });
  await client.connect();
  return client;
}

// ─── 单账户邮件拉取（内部复用）──────────────────────────────

async function fetchEmailsForAccount(account, searchCriteria, limit) {
  const mailbox = account.imap.mailbox || "INBOX";
  const client = await connect(account);
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const status = await client.status(mailbox, { messages: true });
      // 使用 SEARCH 精确统计未读数，避免部分 IMAP 服务器 STATUS UNSEEN 不准确
      const allUnseenUids = await client.search({ seen: false }, { uid: true });
      const unread = allUnseenUids.length;
      const uids = await client.search(searchCriteria, { uid: true });
      const mailboxTotal =
        status && typeof status.messages === "number" ? status.messages : 0;
      if (uids.length === 0)
        return { uids: [], emails: [], total: 0, mailboxTotal, unread };

      const targetUids = uids.slice(-limit).reverse();
      const uidRange = targetUids.join(",");

      const emails = [];
      for await (const msg of client.fetch(uidRange, {
        uid: true,
        envelope: true,
        bodyStructure: true,
        source: true,
      }, { uid: true })) {
        const parsed = await simpleParser(msg.source);
        emails.push({
          uid: msg.uid,
          account: account.name,
          accountLabel: account.label || account.name,
          subject: parsed.subject || "(无主题)",
          from: parsed.from ? parsed.from.text : "未知发件人",
          to: parsed.to ? parsed.to.text : "",
          date: parsed.date ? parsed.date.toISOString() : "",
          preview: truncate(parsed.text, 200),
          hasAttachments: (parsed.attachments || []).length > 0,
          attachmentCount: (parsed.attachments || []).length,
        });
      }

      return { emails, total: uids.length, mailboxTotal, unread };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

async function fetchLatestForAccount(account, searchCriteria) {
  const mailbox = account.imap.mailbox || "INBOX";
  const client = await connect(account);
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const uids = await client.search(searchCriteria, { uid: true });
      if (uids.length === 0) return { email: null, total: 0 };

      const latestUid = uids[uids.length - 1];
      const msg = await client.fetchOne(latestUid, { uid: true, source: true }, { uid: true });
      const parsed = await simpleParser(msg.source);
      const email = {
        uid: msg.uid,
        account: account.name,
        accountLabel: account.label || account.name,
        subject: parsed.subject || "(无主题)",
        from: parsed.from ? parsed.from.text : "未知发件人",
        to: parsed.to ? parsed.to.text : "",
        cc: parsed.cc ? parsed.cc.text : "",
        date: parsed.date ? parsed.date.toISOString() : "",
        text: parsed.text || "",
        html: parsed.html || "",
        attachments: (parsed.attachments || []).map((a) => ({
          filename: a.filename || "未命名文件",
          contentType: a.contentType,
          size: a.size,
        })),
      };

      return { email, total: uids.length };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

// ─── 命令: check ────────────────────────────────────────────

async function cmdCheck(args) {
  const limit = parseInt(args.limit || "10", 10);
  const unseenOnly = args.unseen === true;
  const recentTime = args.recent ? parseRecent(args.recent) : null;
  const accounts = resolveAccounts(args);

  const searchCriteria = {};
  if (unseenOnly) searchCriteria.seen = false;
  if (recentTime) searchCriteria.since = recentTime;

  // 并发拉取所有账户
  const results = await Promise.allSettled(
    accounts.map(async (acct) => {
      try {
        const { emails, total, mailboxTotal, unread } =
          await fetchEmailsForAccount(
          acct,
          searchCriteria,
          limit
        );
        return {
          account: acct.name,
          label: acct.label || acct.name,
          count: emails.length,
          total,
          mailboxTotal,
          unread,
          emails,
          error: null,
        };
      } catch (err) {
        return {
          account: acct.name,
          label: acct.label || acct.name,
          count: 0,
          total: 0,
          mailboxTotal: 0,
          unread: 0,
          emails: [],
          error: err.message,
        };
      }
    })
  );

  const accountResults = results.map((r) =>
    r.status === "fulfilled" ? r.value : r.reason
  );

  const allEmails = accountResults.flatMap((r) => r.emails || []);
  // 按时间倒序排列
  allEmails.sort((a, b) => new Date(b.date) - new Date(a.date));

  console.log(
    JSON.stringify({
      multiAccount: true,
      accountCount: accounts.length,
      accounts: accountResults.map((r) => ({
        name: r.account,
        label: r.label,
        count: r.count,
        total: r.total,
        mailboxTotal: r.mailboxTotal,
        unread: r.unread,
        error: r.error,
      })),
      count: allEmails.length,
      timestamp: new Date().toISOString(),
      emails: allEmails,
    })
  );
}

// ─── 命令: monitor（服务模式）────────────────────────────────

async function monitorAccount(account) {
  const mailbox = account.imap.mailbox || "INBOX";

  while (true) {
    let client;
    let lock;
    try {
      client = new ImapFlow({
        host: account.imap.host,
        port: account.imap.port || 993,
        secure: account.imap.tls !== false,
        auth: { user: account.imap.user, pass: account.imap.pass },
        logger: false,
      });

      await client.connect();
      lock = await client.getMailboxLock(mailbox);

      // 获取初始最大 UID
      const initialUids = await client.search({ all: true }, { uid: true });
      let lastUid = initialUids.length > 0 ? Math.max(...initialUids) : 0;

      console.error(
        `[${account.name}] 已连接 (${account.label})，当前邮件数: ${initialUids.length}，最新UID: ${lastUid}`
      );

      let checking = false;

      const checkNewMails = async () => {
        if (checking) return;
        checking = true;
        try {
          // 等待 500ms 批量处理快速到达的多封邮件
          await new Promise((r) => setTimeout(r, 500));

          for await (const msg of client.fetch(`${lastUid + 1}:*`, {
            uid: true,
            source: true,
          }, { uid: true })) {
            if (msg.uid <= lastUid) continue;
            const parsed = await simpleParser(msg.source);
            const email = {
              uid: msg.uid,
              account: account.name,
              accountLabel: account.label || account.name,
              subject: parsed.subject || "(无主题)",
              from: parsed.from ? parsed.from.text : "未知发件人",
              to: parsed.to ? parsed.to.text : "",
              date: parsed.date ? parsed.date.toISOString() : "",
              preview: truncate(parsed.text, 200),
              hasAttachments: (parsed.attachments || []).length > 0,
              attachmentCount: (parsed.attachments || []).length,
            };

            console.log(formatNewMailNotification(email));
            lastUid = msg.uid;
          }
        } catch (err) {
          console.error(`[${account.name}] 获取新邮件失败: ${err.message}`);
        } finally {
          checking = false;
        }
      };

      client.on("exists", checkNewMails);

      // 等待连接关闭
      await new Promise((resolve) => {
        client.on("close", resolve);
        client.on("error", (err) => {
          console.error(`[${account.name}] 连接错误: ${err.message}`);
          resolve();
        });
      });
    } catch (err) {
      console.error(`[${account.name}] 连接失败: ${err.message}`);
    } finally {
      if (lock) try { lock.release(); } catch (_) {}
      if (client) try { await client.logout(); } catch (_) {}
    }

    console.error(`[${account.name}] 连接断开，5秒后重连...`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function cmdMonitor(args) {
  const accounts = resolveAccounts(args);

  console.error(`[monitor] 启动邮件监控服务，监控 ${accounts.length} 个邮箱`);
  console.error(`[monitor] 按 Ctrl+C 停止监控\n`);

  process.on("SIGINT", () => {
    console.error("\n[monitor] 停止监控服务");
    process.exit(0);
  });

  // 并发监控所有账户
  await Promise.all(accounts.map((acct) => monitorAccount(acct)));
}

// ─── 命令: fetch ────────────────────────────────────────────

async function cmdFetch(args) {
  const uid = args._[0];
  if (!uid) {
    console.error("Error: 请提供邮件 UID");
    process.exit(1);
  }

  const account = resolveSingleAccount(args);
  const mailbox = args.mailbox || account.imap.mailbox || "INBOX";
  const client = await connect(account);
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const msg = await client.fetchOne(uid, { uid: true, source: true }, { uid: true });
      const parsed = await simpleParser(msg.source);
      const result = {
        uid: msg.uid,
        account: account.name,
        accountLabel: account.label || account.name,
        subject: parsed.subject || "(无主题)",
        from: parsed.from ? parsed.from.text : "未知发件人",
        to: parsed.to ? parsed.to.text : "",
        cc: parsed.cc ? parsed.cc.text : "",
        date: parsed.date ? parsed.date.toISOString() : "",
        text: parsed.text || "",
        html: parsed.html || "",
        attachments: (parsed.attachments || []).map((a) => ({
          filename: a.filename || "未命名文件",
          contentType: a.contentType,
          size: a.size,
        })),
      };
      console.log(JSON.stringify(result));
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

async function cmdLatest(args) {
  const unseenOnly = args.unseen === true;
  const recentTime = args.recent ? parseRecent(args.recent) : null;
  const accounts = resolveAccounts(args);

  const searchCriteria = {};
  if (unseenOnly) searchCriteria.seen = false;
  if (recentTime) searchCriteria.since = recentTime;

  const results = await Promise.allSettled(
    accounts.map(async (acct) => {
      try {
        const { email, total } = await fetchLatestForAccount(
          acct,
          searchCriteria
        );
        return {
          account: acct.name,
          label: acct.label || acct.name,
          total,
          email,
          error: null,
        };
      } catch (err) {
        return {
          account: acct.name,
          label: acct.label || acct.name,
          total: 0,
          email: null,
          error: err.message,
        };
      }
    })
  );

  const accountResults = results.map((r) =>
    r.status === "fulfilled" ? r.value : r.reason
  );

  let latestEmail = null;
  let latestTime = -1;
  for (const r of accountResults) {
    if (!r.email) continue;
    const t = r.email.date ? new Date(r.email.date).getTime() : -1;
    if (t > latestTime) {
      latestTime = t;
      latestEmail = r.email;
    }
  }

  if (!latestEmail) {
    const fallback = accountResults.find((r) => r.email);
    latestEmail = fallback ? fallback.email : null;
  }

  console.log(
    JSON.stringify({
      multiAccount: accounts.length > 1,
      accountCount: accounts.length,
      accounts: accountResults.map((r) => ({
        name: r.account,
        label: r.label,
        total: r.total,
        hasMail: !!r.email,
        error: r.error,
      })),
      count: latestEmail ? 1 : 0,
      timestamp: new Date().toISOString(),
      email: latestEmail,
    })
  );
}

// ─── 命令: search ───────────────────────────────────────────

async function cmdSearch(args) {
  const limit = parseInt(args.limit || "20", 10);
  const accounts = resolveAccounts(args);

  const searchCriteria = {};
  if (args.unseen === true) searchCriteria.seen = false;
  if (args.from) searchCriteria.from = args.from;
  if (args.subject) searchCriteria.subject = args.subject;
  if (args.since) searchCriteria.since = new Date(args.since);
  if (args.recent) {
    const d = parseRecent(args.recent);
    if (d) searchCriteria.since = d;
  }

  const results = await Promise.allSettled(
    accounts.map(async (acct) => {
      try {
        const { emails, total, mailboxTotal, unread } =
          await fetchEmailsForAccount(
          acct,
          searchCriteria,
          limit
        );
        return {
          account: acct.name,
          label: acct.label || acct.name,
          count: emails.length,
          total,
          mailboxTotal,
          unread,
          emails,
          error: null,
        };
      } catch (err) {
        return {
          account: acct.name,
          label: acct.label || acct.name,
          count: 0,
          total: 0,
          mailboxTotal: 0,
          unread: 0,
          emails: [],
          error: err.message,
        };
      }
    })
  );

  const accountResults = results.map((r) =>
    r.status === "fulfilled" ? r.value : r.reason
  );
  const allEmails = accountResults.flatMap((r) => r.emails || []);
  allEmails.sort((a, b) => new Date(b.date) - new Date(a.date));

  console.log(
    JSON.stringify({
      multiAccount: true,
      accountCount: accounts.length,
      accounts: accountResults.map((r) => ({
        name: r.account,
        label: r.label,
        count: r.count,
        total: r.total,
        mailboxTotal: r.mailboxTotal,
        unread: r.unread,
        error: r.error,
      })),
      count: allEmails.length,
      timestamp: new Date().toISOString(),
      emails: allEmails,
    })
  );
}

// ─── 命令: mark-read ───────────────────────────────────────

async function cmdMarkRead(args) {
  const uidStr = args._[0];
  if (!uidStr) {
    console.error("Error: 请提供邮件 UID（多个用逗号分隔）");
    process.exit(1);
  }

  const account = resolveSingleAccount(args);
  const mailbox = args.mailbox || account.imap.mailbox || "INBOX";
  const uids = uidStr.split(",").map((u) => u.trim());

  const client = await connect(account);
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      for (const uid of uids) {
        await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
      }
      console.log(
        JSON.stringify({
          success: true,
          account: account.name,
          marked: uids,
          mailbox,
        })
      );
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

// ─── 命令: list-mailboxes ──────────────────────────────────

async function cmdListMailboxes(args) {
  const accounts = resolveAccounts(args);

  const results = [];
  for (const acct of accounts) {
    try {
      const client = await connect(acct);
      try {
        const mailboxes = await client.list();
        results.push({
          account: acct.name,
          label: acct.label || acct.name,
          mailboxes: mailboxes.map((mb) => ({
            name: mb.name,
            path: mb.path,
            flags: mb.flags ? [...mb.flags] : [],
            specialUse: mb.specialUse || null,
          })),
          error: null,
        });
      } finally {
        await client.logout();
      }
    } catch (err) {
      results.push({
        account: acct.name,
        label: acct.label || acct.name,
        mailboxes: [],
        error: err.message,
      });
    }
  }

  console.log(JSON.stringify({ accounts: results }));
}

// ─── 命令: list-accounts ───────────────────────────────────

function cmdListAccounts() {
  const accounts = loadAccounts();
  if (accounts.length === 0) {
    console.log(JSON.stringify({ accounts: [], message: "未配置任何邮箱账户" }));
    return;
  }
  console.log(
    JSON.stringify({
      accounts: accounts.map((a) => ({
        name: a.name,
        label: a.label || a.name,
        user: a.imap.user,
        host: a.imap.host,
        mailbox: a.imap.mailbox || "INBOX",
      })),
    })
  );
}

// ─── 命令: send ─────────────────────────────────────────────

async function cmdSend(args) {
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch (_) {
    console.error("Error: 请先安装 nodemailer: npm install nodemailer");
    process.exit(1);
  }

  const account = resolveSingleAccount(args);
  const to = args.to;
  const subject = args.subject || "(无主题)";
  const cc = args.cc || "";
  const attachFiles = args.attach ? args.attach.split(",").map((f) => f.trim()) : [];

  if (!to) {
    console.error("Error: 请提供收件人 --to <email>");
    process.exit(1);
  }

  // 读取正文：优先 --body，否则从 stdin 读取
  let body = args.body || "";
  if (!body && !process.stdin.isTTY) {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) {
      body += chunk;
    }
    body = body.trim();
  }

  if (!body) {
    console.error("Error: 请提供邮件正文 --body <text> 或通过 stdin 输入");
    process.exit(1);
  }

  // SMTP 配置：优先使用 account.smtp，否则从 imap 推导
  const smtp = account.smtp || {
    host: account.imap.host.replace("imap", "smtp"),
    port: 465,
    tls: true,
    user: account.imap.user,
    pass: account.imap.pass,
  };

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port || 465,
    secure: smtp.tls !== false,
    auth: {
      user: smtp.user || account.imap.user,
      pass: smtp.pass || account.imap.pass,
    },
  });

  const htmlBody = markdownToHtml(body);

  const attachments = attachFiles
    .filter((f) => fs.existsSync(f))
    .map((f) => ({
      filename: path.basename(f),
      path: path.resolve(f),
    }));

  if (attachFiles.length > 0 && attachments.length !== attachFiles.length) {
    const missing = attachFiles.filter((f) => !fs.existsSync(f));
    console.error(`Warning: 以下附件文件未找到: ${missing.join(", ")}`);
  }

  const mailOptions = {
    from: smtp.user || account.imap.user,
    to: to,
    cc: cc || undefined,
    subject: subject,
    text: body,
    html: htmlBody,
    attachments: attachments.length > 0 ? attachments : undefined,
  };

  const info = await transporter.sendMail(mailOptions);

  console.log(
    JSON.stringify({
      success: true,
      messageId: info.messageId,
      account: account.name,
      from: mailOptions.from,
      to: to,
      cc: cc || undefined,
      subject: subject,
      attachmentCount: attachments.length,
    })
  );
}

// ─── 主入口 ─────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error(
      "用法: node imap-monitor.js <command> [options]\n\n" +
        "命令:\n" +
        "  check           检查邮件 [--limit N] [--unseen] [--recent <time>]\n" +
        "  fetch <uid>     获取邮件详情 --account <name>\n" +
        "  latest          获取最近一封邮件详情 [--unseen] [--recent <time>]\n" +
        "  search          搜索邮件 [--from X] [--subject X] [--unseen]\n" +
        "  mark-read <uids>  标记已读 --account <name>\n" +
        "  monitor         实时监控新邮件（IMAP IDLE 服务模式）\n" +
        "  send            发送邮件 --to <email> --subject <主题> --body <正文>\n" +
        "  list-mailboxes  列出文件夹\n" +
        "  list-accounts   列出已配置的账户\n\n" +
        "多邮箱选项:\n" +
        "  --account <name>   指定账户（逗号分隔多个）\n" +
        "  --all              所有账户（check/search/monitor 的默认行为）\n\n" +
        "发送选项:\n" +
        "  --to <email>       收件人\n" +
        "  --subject <text>   邮件主题\n" +
        "  --body <text>      邮件正文（支持 Markdown）\n" +
        "  --cc <email>       抄送\n" +
        "  --attach <files>   附件路径（逗号分隔多个）"
    );
    process.exit(1);
  }

  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  try {
    switch (command) {
      case "check":
        await cmdCheck(args);
        break;
      case "fetch":
        await cmdFetch(args);
        break;
      case "latest":
        await cmdLatest(args);
        break;
      case "search":
        await cmdSearch(args);
        break;
      case "mark-read":
        await cmdMarkRead(args);
        break;
      case "list-mailboxes":
        await cmdListMailboxes(args);
        break;
      case "list-accounts":
        cmdListAccounts();
        break;
      case "monitor":
        await cmdMonitor(args);
        break;
      case "send":
        await cmdSend(args);
        break;
      default:
        console.error(`未知命令: ${command}`);
        process.exit(1);
    }
  } catch (err) {
    console.error(JSON.stringify({ error: err.message, code: err.code }));
    process.exit(1);
  }
}

main();
