/** Card text formatting: code blocks, inline values, cloze and speech. */
import { Notice } from "obsidian";
import { L } from "./i18n.js";
import {
  normalizeCardText,
  formatRichText,
  looksLikeCommand,
  looksLikeConfigLine
} from "./utils.js";

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function codeToggleLabel(pre) {
  return L(`Show all ${pre.dataset.lines} lines`, `Xem đủ ${pre.dataset.lines} dòng`);
}


/** Collapsed code shows the first two lines; the height is measured so any font works. */
const CODE_COLLAPSED_LINES = 2;

function codeLineHeight(pre) {
  const win = pre.ownerDocument?.defaultView;
  if (!win || typeof win.getComputedStyle !== "function") return 0;
  const preStyle = win.getComputedStyle(pre);
  const codeStyle = win.getComputedStyle(pre.querySelector("code") || pre);
  const candidates = [parseFloat(codeStyle.lineHeight), parseFloat(preStyle.lineHeight), parseFloat(preStyle.fontSize) * 1.6]
    .filter(value => Number.isFinite(value) && value > 0);
  return candidates.length ? Math.max(...candidates) : 0;
}

function applyCodeCollapse(pre) {
  const lineHeight = codeLineHeight(pre);
  if (!lineHeight) return;
  pre.style.maxHeight = pre.classList.contains("is-collapsed")
    ? `${Math.round(lineHeight * CODE_COLLAPSED_LINES)}px`
    : "";
}
/** Wires up every code toggle inside a container. Safe to call more than once. */
function wireCodeToggles(container) {
  if (!container || typeof container.querySelectorAll !== "function") return;
  container.querySelectorAll(".pdl-code pre").forEach(applyCodeCollapse);
  container.querySelectorAll(".pdl-code-toggle").forEach(button => {
    if (button.dataset.pdlWired === "1") return;
    button.dataset.pdlWired = "1";
    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      const pre = button.closest(".pdl-code")?.querySelector("pre");
      if (!pre) return;
      const collapsed = pre.toggleClass("is-collapsed");
      applyCodeCollapse(pre);
      button.setText(collapsed ? codeToggleLabel(pre) : L("Collapse", "Thu gọn"));
      button.setAttr("aria-expanded", String(!collapsed));
    };
  });
}

/** Inline context (headings, options, summaries): one flat run of text. */
function formatRichInline(raw) {
  const flat = normalizeCardText(raw).replace(/\n{2,}/g, " \u00b6 ").replace(/\n/g, " ");
  const trimmed = flat.trim();
  // A short one-liner that is plainly a command is shown as code, not as prose.
  if (trimmed && !trimmed.includes("\u00b6") && trimmed.length <= 220 && !trimmed.includes("*")
    && (looksLikeCommand(trimmed) || looksLikeConfigLine(trimmed))) {
    return `<span class="pdl-inline-code is-code">${escapeHtml(trimmed.replace(/`/g, ""))}</span>`;
  }
  return formatRichText(flat, { inline: true });
}

/** Short one-line values (a command, a config key) shown as code instead of prose. */
function formatRichCodeAware(raw) {
  const text = normalizeCardText(raw);
  if (text && !text.includes("\n") && text.length <= 220 && !text.includes("*")
    && (looksLikeCommand(text) || looksLikeConfigLine(text))) {
    return `<span class="pdl-inline-code is-code">${escapeHtml(text.replace(/`/g, ""))}</span>`;
  }
  return formatRichText(text);
}

function parseCloze(text) {
  if (!text) return { hiddenPrompt: "", fullAnswer: "", answers: [] };
  const answers = [];

  // Match {{c1::hidden::hint}} or {{c1::hidden}} or {{hidden}}
  let hiddenPrompt = text.replace(/\{\{(?:c\d+::)?([^}:]+)(?:::([^}]+))?\}\}/g, (match, word, hint) => {
    answers.push(word.trim());
    return hint ? `[${hint.trim()}]` : "[...]";
  });
  // Also match ==hidden==
  hiddenPrompt = hiddenPrompt.replace(/==([^=]+)==/g, (match, word) => {
    answers.push(word.trim());
    return "[...]";
  });

  let fullAnswer = text.replace(/\{\{(?:c\d+::)?([^}:]+)(?:::([^}]+))?\}\}/g, (match, word) => {
    return `<mark class="pdl-cloze-target">${word.trim()}</mark>`;
  });
  fullAnswer = fullAnswer.replace(/==([^=]+)==/g, (match, word) => {
    return `<mark class="pdl-cloze-target">${word.trim()}</mark>`;
  });

  return { hiddenPrompt, fullAnswer, answers };
}

/** Turn card Markdown into plain prose that a speech engine can pronounce. */
function cleanForSpeech(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[\[[^\]]*\]\]/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias || target)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, " ")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/\{\{(?:c\d+::)?([^}:]+)(?:::([^}]+))?\}\}/g, "$1")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function pickSpeechVoice(synth, lang, preferred) {
  const voices = typeof synth.getVoices === "function" ? synth.getVoices() || [] : [];
  if (preferred) {
    const selected = voices.find(voice => voice.voiceURI === preferred || voice.name === preferred);
    if (selected) return selected;
  }
  return voices.find(voice => voice.lang === lang)
    || voices.find(voice => String(voice.lang || "").toLowerCase().startsWith(`${lang.slice(0, 2).toLowerCase()}-`))
    || null;
}

function speakText(text, options = {}) {
  if (!("speechSynthesis" in window)) {
    new Notice(L("Text-to-speech is not supported in this environment.", "Môi trường này không hỗ trợ đọc văn bản (TTS)."));
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const clean = cleanForSpeech(text);
  if (!clean) return;

  const utterance = new SpeechSynthesisUtterance(clean);
  const isVietnamese = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(clean);
  const lang = isVietnamese ? "vi-VN" : "en-US";
  utterance.lang = lang;
  const voice = pickSpeechVoice(synth, lang, options.voice);
  if (voice) utterance.voice = voice;
  const rate = Number(options.rate);
  if (Number.isFinite(rate)) utterance.rate = Math.max(0.5, Math.min(2, rate));
  synth.speak(utterance);
}

export {
  formatRichText,
  formatRichCodeAware,
  formatRichInline,
  parseCloze,
  wireCodeToggles,
  speakText,
  escapeHtml
};
