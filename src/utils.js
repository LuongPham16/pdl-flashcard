/** Small pure helpers shared by the data layer and the UI. */
import { L, getLanguage } from "./i18n.js";

function dateKey(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function formatCount(value, compact = false) {
  return new Intl.NumberFormat(getLanguage() === "vi" ? "vi-VN" : "en-US", compact ? { notation: "compact", maximumFractionDigits: 1 } : {}).format(value);
}

/** One-line, length-limited label for notices. */
function truncateLabel(text, limit = 48) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

function cleanAndParseJSON(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
  }
  return JSON.parse(cleaned);
}


function formatInlineMarkdown(text) {
  if (!text) return "";
  let safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  safe = safe.replace(/`([^`]+)`/g, '<code class="pdl-inline-code">$1</code>');
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return safe;
}

/**
 * Normalize text produced by an LLM or typed by hand so it renders identically
 * everywhere: unify newlines/tabs, strip non-breaking + zero-width characters
 * (a common source of "random" spaces in AI output), collapse runs of spaces in
 * prose while keeping code indentation, and never let stray indentation turn a
 * paragraph into a code block.
 */
/**
 * Unicode-only normalization (NFC). Vietnamese text from AI/import can arrive
 * decomposed (base letter + separate accents); some fonts then render the accents
 * as stray marks or gaps, which is exactly the "lỗi font" looking card.
 */
function nfcText(text) {
  return String(text ?? "").normalize("NFC");
}

function normalizeCardText(text) {
  if (!text) return "";
  return nfcText(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\u200b|\u200c|\u200d|\ufeff|\u200e|\u200f/g, "")
    .replace(/[\u2022\u25cf\u25aa]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .split("\n")
    .map(line => line.replace(/\t/g, "    ").replace(/[ ]+$/, ""))
    .map(line => line.replace(/^[ ]{6,}(?=\S)/, "  "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collapseProseSpaces(text) {
  return String(text).replace(/[ ]{2,}/g, " ").replace(/[ ]+\n/g, "\n");
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Code block chrome shared by every answer/explanation. Multi-line code starts
 * collapsed; short one-liners stay open so they read like an inline value.
 */
function codeHtml(code, options = {}) {
  const value = String(code).replace(/\n+$/, "").trim();
  const newlines = (value.match(/\n/g) || []).length;
  const collapsible = options.collapsible !== false && newlines >= 2;
  const inner = `<pre class="${collapsible ? "is-collapsed" : "is-open"}" data-lines="${newlines + 1}"><code>${escapeHtml(value)}</code></pre>`;
  if (!collapsible) return `<div class="pdl-code">${inner}</div>`;
  return `<div class="pdl-code"><div class="pdl-code-head"><button type="button" class="pdl-code-toggle" data-pdl-toggle="1" aria-expanded="false">${L(`Show all ${newlines + 1} lines`, `Xem đủ ${newlines + 1} dòng`)}</button></div>${inner}</div>`;
}

function formatProseLine(line) {
  return formatInlineMarkdown(collapseProseSpaces(String(line).trim()));
}

/** Inline context (headings, options, summaries): one flat run of text. */
function proseToInline(chunk) {
  return String(chunk)
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => formatProseLine(part.replace(/\n/g, " ")))
    .join("<br>")
    .replace(/@@PDLCODE/g, "");
}

/** Block context (answers, explanations): paragraphs, real lists, code blocks. */
function proseToBlocks(chunk) {
  const groups = String(chunk).replace(/\n{3,}/g, "\n\n").split(/\n{2,}/);
  let html = "";
  let list = null;

  const closeList = () => {
    if (list) html += `</${list}>`;
    list = null;
  };

  for (const group of groups) {
    const lines = group.split("\n").map(line => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const raw = lines[0];
    if (raw.startsWith("@@PDLCODE")) {
      closeList();
      html += raw.slice(9);
      continue;
    }
    const codeMarker = raw.includes("@@PDLCODE");
    const cleaned = codeMarker ? raw.replace(/@@PDLCODE/g, "") : raw;
    const single = codeMarker ? [cleaned] : lines;
    const listLike = line => /^[-*\u2022+]\s+/.test(line) || /^\d{1,3}[.)]\s+/.test(line);
    // AI answers often write "Steps:" on its own line and then the bullets.
    const leadIn = lines.length > 1 && !listLike(lines[0]) ? lines[0] : null;
    const listLines = leadIn ? lines.slice(1) : lines;
    const bullets = !codeMarker && listLines.length > 0 && listLines.every(line => /^[-*\u2022+]\s+/.test(line));
    const ordered = !bullets && !codeMarker && listLines.length > 0 && listLines.every(line => /^\d{1,3}[.)]\s+/.test(line));
    if (bullets || ordered) {
      if (leadIn) html += `<p>${formatProseLine(leadIn)}</p>`;
      const tag = bullets ? "ul" : "ol";
      if (list !== tag) {
        closeList();
        list = tag;
        html += tag === "ul" ? "<ul>" : "<ol>";
      }
      for (const line of listLines) {
        const item = line.replace(/^[-*\u2022+]\s+/, "").replace(/^\d{1,3}[.)]\s+/, "");
        html += `<li>${formatProseLine(item)}</li>`;
      }
      continue;
    }
    closeList();
    single.forEach((line, index) => {
      const body = formatProseLine(line);
      html += index ? `<br>${body}` : `<p>${body}`;
    });
    html += "</p>";
  }
  closeList();
  return html;
}

function formatRichText(raw, options = {}) {
  const text = normalizeCardText(raw);
  if (!text) return "";
  const inline = options.inline === true;
  const fence = /```([^\n`]*)\n?([\s\S]*?)(?:\n?```|$)/g;
  let output = "";
  let cursor = 0;
  let match;
  let blocks = 0;

  const pushProse = chunk => {
    if (!chunk) return;
    if (!chunk.trim()) return;
    output += inline ? proseToInline(chunk) : proseToBlocks(chunk);
  };

  const pushCode = code => {
    const clean = code.replace(/^\n+/, "").replace(/\n+$/, "");
    if (!clean.trim()) return;
    blocks += 1;
    // Emitted through a placeholder so paragraph/list grouping around it stays correct.
    output += `\n\n@@PDLCODE${codeHtml(clean, { collapsible: !inline })}\n\n`;
  };

  while ((match = fence.exec(text)) !== null) {
    pushProse(text.slice(cursor, match.index));
    pushCode(match[2] || "");
    cursor = match.index + match[0].length;
  }
  pushProse(text.slice(cursor));

  // An answer made of raw command / config lines reads far better as a block than as prose.
  if (!blocks) {
    const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
    const codeLine = line => looksLikeCommand(line) || looksLikeConfigLine(line);
    // A line that ends like a sentence is a lead-in ("Chạy lệnh sau:"), not code.
    const isProseLeadIn = line => /[.:!?;]$/.test(line);
    const runsOf = classify => {
      const runs = [];
      for (const line of lines) {
        const kind = classify(line);
        const last = runs[runs.length - 1];
        if (last && last.kind === kind) last.lines.push(line);
        else runs.push({ kind, lines: [line] });
      }
      return runs;
    };
    const render = runs => runs
      .map(run => (run.kind === "c" ? codeHtml(run.lines.join("\n"), { collapsible: !inline }) : `<p>${formatProseLine(run.lines.join(" "))}</p>`))
      .join("");

    if (lines.length === 1) {
      // A one-line answer that is plainly a command becomes code.
      if (looksLikeCommand(lines[0]) && !isProseLeadIn(lines[0])) return codeHtml(lines[0], { collapsible: false });
    } else {
      const runs = runsOf(line => (isProseLeadIn(line) ? "p" : codeLine(line) ? "c" : "p"));
      const codeRuns = runs.filter(run => run.kind === "c");
      const codeLines = codeRuns.reduce((sum, run) => sum + run.lines.length, 0);
      if (codeLines === lines.length) return codeHtml(lines.join("\n"), { collapsible: !inline });
      const obvious = value => /\|\||&&|\$\(|>>|\s\|\s/.test(value) || /^[$#>]\s+\S/.test(value);
      // A run becomes a code block when it spans several lines or is unmistakably a
      // command; a lone command mentioned inside a prose sentence stays inline.
      const shouldBlock = run => run.lines.length > 1
        || run.lines.some(obvious)
        || isDefiniteCodeLine(run.lines[0])
        || run.lines.every(line => looksLikeConfigLine(line));
      if (codeRuns.length && codeRuns.every(shouldBlock)) return render(runs);
    }
  }

  return output.replace(/@@PDLCODE/g, "");
}

function looksLikeConfigLine(line) {
  const value = line.trim();
  if (!value || value.length > 200) return false;
  // A sentence ending in punctuation is prose, not a config line.
  if (/[:.?!;,]$/.test(value) || value.length > 80) return false;
  if (/^[A-Za-z_][\w.-]*\s*=\s*\S/.test(value)) return true;
  if (/^[A-Za-z_][\w.-]*\s*:\s*\S/.test(value)) return true;
  if (/^[A-Za-z_][\w.-]*\s*\{$/.test(value)) return true;
  if (/^<\/?[A-Za-z][\w:-]*[ />]/.test(value)) return true;
  if (/^(true|false|null|\d+(\.\d+)?)$/i.test(value)) return true;
  if (/^["'][\w./-]+["']\s*[,:]?$/.test(value)) return true;
  return false;
}

function looksLikeCommand(line) {
  const value = line.trim();
  if (!value || value.length > 200) return false;
  const promptPrefix = /^[$>]\s+\S|^#\s+\S/;
  const tools = /^(docker|docker-compose|kubectl|helm|terraform|ansible|ansible-playbook|git|npm|npx|pnpm|yarn|node|python3?|pip3?|pipenv|poetry|go|cargo|rustc|java|javac|mvn|gradle|dotnet|make|cmake|gcc|g\+\+|curl|wget|ssh|scp|rsync|netstat|ss|lsof|nc|ncat|telnet|ping|traceroute|dig|nslookup|ip|ifconfig|systemctl|service|journalctl|ps|top|htop|kill|killall|chmod|chown|mkdir|rmdir|rm|cp|mv|ls|cat|tail|head|grep|egrep|sed|awk|sort|uniq|wc|find|xargs|tar|gzip|zip|unzip|env|export|source|echo|printf|sudo|apt|apt-get|yum|dnf|apk|brew|sqlite3|psql|mysql|redis-cli|mongosh|kafka-topics|kafka-console-producer|kafka-console-consumer|zookeeper-shell|openssl|jq|yq|ffmpeg|python|python3)\b/;
  const shell = /(\|\||&&|\|\s*\w|\$\(|\bsudo\b)/;
  if (promptPrefix.test(value)) return true;
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH|FROM)\b/i.test(value)) return true;
  const words = value.split(/\s+/).length;
  if (tools.test(value) && words <= 14) return true;
  // Prose rarely contains a long flag such as -it / --bootstrap-server.
  if (/\s-{1,2}[A-Za-z][\w-]{2,}/.test(value)) return true;
  // Two short flags in one short line is a strong command signal
  // (for example: nc -zv host port, docker exec -it NAME bash).
  if (words <= 16 && (value.match(/\s-[A-Za-z0-9]/g) || []).length >= 2 && !/[.!?]$/.test(value)) return true;
  // A real command line has no sentence-ending punctuation and no Vietnamese diacritics.
  if (!/[.!?,:;]$/.test(value) && words >= 3 && words <= 12 && shell.test(value) && !/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(value)) return true;
  return false;
}

/**
 * True only for a line that is definitely code, not a sentence that happens to
 * mention a command. Command prefixes, shell operators and config assignments
 * are definitive; a bare tool name inside prose is not.
 */
function isDefiniteCodeLine(line) {
  const value = String(line).trim();
  if (!value) return false;
  if (/^[$#>]\s+\S/.test(value)) return true;
  if (/\|\||&&|\$\(|>>|<<|\s\|\s/.test(value)) return true;
  if (looksLikeConfigLine(value)) return true;
  const words = value.split(/\s+/).length;
  if (words >= 3 && words <= 16 && /^(?:sudo\s+)?[a-z][\w./-]*\s+-{1,2}[A-Za-z]/.test(value)) return true;
  if (words <= 14 && /^(docker|docker-compose|kubectl|helm|terraform|ansible|ansible-playbook|systemctl|journalctl|git|npm|npx|pnpm|yarn|pip3?|brew|apt|apt-get|dnf|yum)\s+(compose|run|exec|logs|ps|build|up|down|start|stop|restart|status|inspect|pull|push|commit|merge|rebase|stash|reset|checkout|switch|branch|remote|config|add|fetch|clone|apply|describe|get|delete|create|list|install)\b/.test(value)) return true;
  return false;
}

export {
  dateKey,
  formatCount,
  truncateLabel,
  cleanAndParseJSON,
  formatInlineMarkdown,
  nfcText,
  normalizeCardText,
  collapseProseSpaces,
  formatProseLine,
  proseToInline,
  proseToBlocks,
  formatRichText,
  looksLikeConfigLine,
  looksLikeCommand,
  isDefiniteCodeLine
};
