#!/usr/bin/env node

/**
 * email-monitor skill — 多邮箱摘要格式化工具
 *
 * 将 imap-monitor.js 输出的多账户 JSON 转换为 Markdown 摘要
 * 用法:
 *   node imap-monitor.js check --unseen | node summarize.js
 *   node imap-monitor.js fetch 42 --account work | node summarize.js --mode detail
 */

const LABELS = {
  urgent: "🚨紧急",
  important: "📌重要",
  work: "📋工作",
  shopping: "🛒购物",
  notification: "📢通知",
  billing: "💰账单",
  attachment: "📎附件",
  security: "🔒安全",
  newsletter: "📰订阅",
  spam: "🗑垃圾",
};

function classifyEmail(email) {
  const tags = [];
  const text =
    `${email.subject || ""} ${email.preview || ""} ${email.from || ""}`.toLowerCase();

  if (/password|密码|验证码|verification|reset|重置|安全码/.test(text))
    tags.push(LABELS.security);
  if (/urgent|紧急|asap|立即|immediately|critical/.test(text))
    tags.push(LABELS.urgent);
  if (/invoice|账单|付款|payment|receipt|发票|订单|order/.test(text))
    tags.push(LABELS.billing);
  if (/发货|shipping|物流|tracking|快递|delivered|签收/.test(text))
    tags.push(LABELS.shopping);
  if (/meeting|会议|project|项目|deadline|review|pr |merge|deploy/.test(text))
    tags.push(LABELS.work);
  if (/newsletter|订阅|unsubscribe|取消订阅|weekly|digest/.test(text))
    tags.push(LABELS.newsletter);
  if (/notification|通知|alert|提醒|reminder/.test(text))
    tags.push(LABELS.notification);
  if (email.hasAttachments || email.attachmentCount > 0)
    tags.push(LABELS.attachment);

  if (tags.length === 0) tags.push(LABELS.notification);
  return tags;
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

function maskSensitive(text) {
  let masked = text.replace(/\b\d{4,8}\b/g, (m) => {
    if (/验证码|code|pin/i.test(text)) return "****";
    return m;
  });
  masked = masked.replace(
    /(https?:\/\/\S*(?:reset|password|verify|token)\S*)/gi,
    "[🔒 链接已隐藏]"
  );
  return masked;
}

// ─── 多账户列表摘要 ────────────────────────────────────────

function formatMultiAccountList(data) {
  const lines = [];
  lines.push("## 📬 邮件摘要\n");

  // 账户概览
  if (data.multiAccount && data.accounts && data.accounts.length > 1) {
    lines.push(`> **${data.accountCount} 个邮箱** | 共 ${data.count} 封邮件 | ${formatTimestamp(data.timestamp)}\n`);
    const hasMailboxStats = (data.accounts || []).some(
      (a) =>
        typeof a.unread === "number" || typeof a.mailboxTotal === "number"
    );
    if (hasMailboxStats) {
      lines.push("| 邮箱 | 未读 | 已读 | 总量 | 匹配 | 状态 |");
      lines.push("| ---- | ---- | ---- | ---- | ---- | ---- |");
    } else {
      lines.push("| 邮箱 | 未读 | 总匹配 | 状态 |");
      lines.push("| ---- | ---- | ------ | ---- |");
    }
    for (const acct of data.accounts) {
      const status = acct.error ? `❌ ${acct.error}` : "✅ 正常";
      if (hasMailboxStats) {
        const unread =
          typeof acct.unread === "number" ? acct.unread : acct.count;
        const mailboxTotal =
          typeof acct.mailboxTotal === "number" ? acct.mailboxTotal : null;
        const read =
          typeof mailboxTotal === "number"
            ? Math.max(0, mailboxTotal - unread)
            : "-";
        const totalText =
          typeof mailboxTotal === "number" ? mailboxTotal : "-";
        lines.push(
          `| ${acct.label || acct.name} | ${unread} | ${read} | ${totalText} | ${acct.total} | ${status} |`
        );
      } else {
        lines.push(
          `| ${acct.label || acct.name} | ${acct.count} | ${acct.total} | ${status} |`
        );
      }
    }
    lines.push("");
  } else {
    const label =
      data.accounts && data.accounts[0]
        ? data.accounts[0].label || data.accounts[0].name
        : "INBOX";
    const acct = data.accounts && data.accounts[0] ? data.accounts[0] : null;
    if (acct && (typeof acct.unread === "number" || typeof acct.mailboxTotal === "number")) {
      const unread =
        typeof acct.unread === "number" ? acct.unread : data.count;
      const mailboxTotal =
        typeof acct.mailboxTotal === "number" ? acct.mailboxTotal : null;
      const read =
        typeof mailboxTotal === "number"
          ? Math.max(0, mailboxTotal - unread)
          : "-";
      const totalText =
        typeof mailboxTotal === "number" ? mailboxTotal : "-";
      const matchCount =
        typeof acct.total === "number" ? acct.total : data.count;
      lines.push(
        `> 未读 ${unread} | 已读 ${read} | 总量 ${totalText} | 匹配 ${matchCount} | 邮箱：${label} | ${formatTimestamp(data.timestamp)}\n`
      );
    } else {
      lines.push(
        `> 共 ${data.count} 封邮件 | 邮箱：${label} | ${formatTimestamp(data.timestamp)}\n`
      );
    }
  }

  lines.push("---\n");

  if (!data.emails || data.emails.length === 0) {
    lines.push("*所有邮箱暂无新邮件* ✅\n");
    return lines.join("\n");
  }

  // 按账户分组
  const isMulti =
    data.multiAccount && data.accounts && data.accounts.length > 1;
  if (isMulti) {
    const grouped = {};
    for (const email of data.emails) {
      const key = email.account || "default";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(email);
    }

    let globalIdx = 1;
    for (const [accountName, emails] of Object.entries(grouped)) {
      const label = emails[0]?.accountLabel || accountName;
      lines.push(`### 📧 ${label}\n`);

      for (const email of emails) {
        const tags = classifyEmail(email);
        const hasSensitive = tags.some((t) => t === LABELS.security);
        const preview = hasSensitive
          ? maskSensitive(email.preview || "")
          : email.preview || "(无预览)";

        lines.push(`#### ${globalIdx}. ${email.subject}`);
        lines.push(`- **发件人：** ${email.from}`);
        lines.push(`- **时间：** ${formatTimestamp(email.date)}`);
        lines.push(`- **摘要：** ${preview}`);
        lines.push(`- **标签：** ${tags.join(" ")}`);
        if (email.hasAttachments) {
          lines.push(`- **附件：** ${email.attachmentCount} 个`);
        }
        lines.push(`- **UID：** \`${email.uid}\` | **账户：** \`${email.account}\``);
        lines.push("");
        globalIdx++;
      }
      lines.push("---\n");
    }
  } else {
    // 单账户：和之前一样
    data.emails.forEach((email, i) => {
      const tags = classifyEmail(email);
      const hasSensitive = tags.some((t) => t === LABELS.security);
      const preview = hasSensitive
        ? maskSensitive(email.preview || "")
        : email.preview || "(无预览)";

      lines.push(`### ${i + 1}. ${email.subject}`);
      lines.push(`- **发件人：** ${email.from}`);
      lines.push(`- **时间：** ${formatTimestamp(email.date)}`);
      lines.push(`- **摘要：** ${preview}`);
      lines.push(`- **标签：** ${tags.join(" ")}`);
      if (email.hasAttachments) {
        lines.push(`- **附件：** ${email.attachmentCount} 个`);
      }
      lines.push(`- **UID：** \`${email.uid}\``);
      lines.push("\n---\n");
    });
  }

  // 多账户使用提示
  if (isMulti) {
    lines.push(
      "> 💡 查看详情请指定账户：\"查看 work 账户 UID 42 的邮件\""
    );
    lines.push(
      "> 💡 只看某个邮箱：\"查看 work 邮箱的邮件\""
    );
  }

  return lines.join("\n");
}

// ─── 单封邮件详情 ──────────────────────────────────────────

function formatEmailDetail(email) {
  const lines = [];
  lines.push("## 📧 邮件详情\n");
  lines.push("| 字段 | 内容 |");
  lines.push("| ---- | ---- |");
  lines.push(`| 主题 | ${email.subject} |`);
  lines.push(`| 发件人 | ${email.from} |`);
  lines.push(`| 收件人 | ${email.to} |`);
  if (email.cc) lines.push(`| 抄送 | ${email.cc} |`);
  lines.push(`| 时间 | ${formatTimestamp(email.date)} |`);
  lines.push(`| UID | \`${email.uid}\` |`);
  if (email.account) {
    lines.push(`| 账户 | ${email.accountLabel || email.account} |`);
  }

  const attachments = email.attachments || [];
  if (attachments.length > 0) {
    const attList = attachments
      .map(
        (a) =>
          `${a.filename} (${a.size ? (a.size / 1024).toFixed(1) + "KB" : "未知大小"})`
      )
      .join(", ");
    lines.push(`| 附件 | ${attList} |`);
  } else {
    lines.push("| 附件 | 无 |");
  }

  lines.push("\n### 正文内容\n");

  let body = email.text || "(无正文)";
  const hasSensitive = /password|密码|验证码|verification|reset|重置/.test(
    `${email.subject} ${body}`.toLowerCase()
  );

  if (hasSensitive) {
    body = maskSensitive(body);
    lines.push("> 🔒 此邮件包含敏感信息，部分内容已自动隐藏\n");
  }

  if (body.length > 2000) {
    body =
      body.slice(0, 2000) +
      "\n\n...（全文已截断，共 " +
      email.text.length +
      " 字）";
  }

  lines.push(body);
  lines.push("\n---");

  const acctHint = email.account ? ` --account ${email.account}` : "";
  lines.push(
    `> 💡 回复 "标记已读 ${email.uid}${acctHint}" 可将此邮件标为已读`
  );

  return lines.join("\n");
}

function formatEmptyDetail(data) {
  const lines = [];
  lines.push("## 📧 邮件详情\n");
  const label =
    data && data.accounts && data.accounts.length === 1
      ? data.accounts[0].label || data.accounts[0].name
      : "所有邮箱";
  const time = data && data.timestamp ? formatTimestamp(data.timestamp) : "";
  if (time) {
    lines.push(`> ${label} | ${time}\n`);
  }
  lines.push("*暂无符合条件的邮件* ✅\n");
  return lines.join("\n");
}

// ─── 发送结果格式化 ──────────────────────────────────────────

function formatSendResult(data) {
  const lines = [];
  if (data.success) {
    lines.push("## ✅ 邮件发送成功\n");
    lines.push("| 字段 | 内容 |");
    lines.push("| ---- | ---- |");
    lines.push(`| 发件人 | ${data.from} |`);
    lines.push(`| 收件人 | ${data.to} |`);
    if (data.cc) lines.push(`| 抄送 | ${data.cc} |`);
    lines.push(`| 主题 | ${data.subject} |`);
    lines.push(`| 账户 | ${data.account} |`);
    if (data.attachmentCount > 0) {
      lines.push(`| 附件 | ${data.attachmentCount} 个 |`);
    }
    lines.push(`| Message-ID | \`${data.messageId}\` |`);
  } else {
    lines.push("## ❌ 邮件发送失败\n");
    lines.push(`> 错误: ${data.error || "未知错误"}`);
  }
  return lines.join("\n");
}

// ─── 主入口 ─────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--mode")
    ? args[args.indexOf("--mode") + 1]
    : "list";

  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  try {
    const data = JSON.parse(input.trim());

    if (mode === "detail") {
      if (data && Object.prototype.hasOwnProperty.call(data, "email")) {
        if (data.email) {
          console.log(formatEmailDetail(data.email));
        } else {
          console.log(formatEmptyDetail(data));
        }
      } else {
        console.log(formatEmailDetail(data));
      }
    } else if (mode === "send") {
      console.log(formatSendResult(data));
    } else {
      console.log(formatMultiAccountList(data));
    }
  } catch (err) {
    console.error("Error: 无法解析输入的 JSON —", err.message);
    process.exit(1);
  }
}

main();
