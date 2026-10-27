#!/usr/bin/env node
/**
 * One-off migration helper: slices the original monolithic main.js into ESM
 * modules under src/. It only moves line ranges and adds import/export lines;
 * no logic is rewritten, so behaviour is preserved by construction.
 *
 * Usage: node scripts/split-monolith.mjs <path-to-old-main.js>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = process.argv[2];
if (!source || !fs.existsSync(source)) {
  console.error("usage: node scripts/split-monolith.mjs <old main.js>");
  process.exit(1);
}

const lines = fs.readFileSync(source, "utf8").split(/\r?\n/);
/** 1-based inclusive line range. */
const splice = (from, to) => lines.slice(from - 1, to).join("\n");

const files = {};

// constants.js -----------------------------------------------------------------
files["src/constants.js"] = `/** Shared constants used across the plugin. */

const VIEW_TYPE = "pdl-flashcard-view";
const DAY = 86400000;

${splice(6, 97)}

export {
  VIEW_TYPE,
  DAY,
  AI_FORMAT_RULES,
  DEFAULT_AI_PROMPTS,
  DEFAULTS
};
`;

// utils.js ---------------------------------------------------------------------
// Pure helpers only: text normalisation, prose rendering, command detection and
// rich formatting. `formatRichCodeAware` was declared twice in the original
// (lines 377 and 439); the later declaration is what JS actually used, so only
// that one is carried over (into formatting.js).
files["src/utils.js"] = `/** Small pure helpers shared by the data layer and the UI. */

${splice(99, 121)}

${splice(122, 227)}

${splice(229, 300)}

${splice(302, 351)}

export {
  dateKey,
  formatCount,
  truncateLabel,
  cleanAndParseJSON,
  formatInlineMarkdown,
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
`;

// formatting.js ----------------------------------------------------------------
files["src/formatting.js"] = `/** Card text formatting: code blocks, inline values, cloze and speech. */
import {
  normalizeCardText,
  formatRichText,
  looksLikeCommand,
  looksLikeConfigLine,
  isDefiniteCodeLine
} from "./utils.js";

${splice(353, 375)}

${splice(386, 490)}

export {
  formatRichText,
  formatRichCodeAware,
  formatRichInline,
  parseCloze,
  wireCodeToggles,
  speakText,
  escapeHtml
};
`;

// ai.js -----------------------------------------------------------------------
files["src/ai.js"] = `/** AI integration: prompt assembly and provider request layer. */
import { requestUrl } from "obsidian";
import { DEFAULT_AI_PROMPTS } from "./constants.js";
import { cleanAndParseJSON } from "./utils.js";

/** Mixed into PDLFlashcardPlugin in plugin.js. */
export class AiMethods {
${splice(849, 856)}

${splice(855, 868)}

${splice(871, 967)}
}
`;

// storage.js ------------------------------------------------------------------
files["src/storage.js"] = `/** Deck persistence: finding, reading, writing and appending flashcard notes. */
import { Notice, normalizePath } from "obsidian";
import { normalizeCardText, truncateLabel } from "./utils.js";
import { parseCloze } from "./formatting.js";

/** Mixed into PDLFlashcardPlugin in plugin.js. */
export class StorageMethods {
${splice(664, 847)}
}
`;

// review.js -------------------------------------------------------------------
files["src/review.js"] = `/** Spaced repetition: grading, leech detection, suspend, bury and availability. */
import { Notice } from "obsidian";
import { DAY } from "./constants.js";
import { dateKey, truncateLabel } from "./utils.js";

/** Mixed into PDLFlashcardPlugin in plugin.js. */
export class ReviewMethods {
${splice(969, 1028)}
}
`;

// settings.js -----------------------------------------------------------------
files["src/settings.js"] = `/** Settings UI. */
import { PluginSettingTab, Setting, normalizePath } from "obsidian";
import { DEFAULT_AI_PROMPTS } from "./constants.js";

export class PDLFlashcardSettingTab extends PluginSettingTab {
${splice(2663, 2847)}
`;

// view.js ---------------------------------------------------------------------
files["src/view.js"] = `/** The review dashboard: library, review session, heatmap and summary. */
import { ItemView, Notice, setIcon, MarkdownRenderer } from "obsidian";
import { VIEW_TYPE, DAY } from "./constants.js";
import { dateKey, formatCount, truncateLabel } from "./utils.js";
import {
  formatRichInline,
  formatRichText,
  formatRichCodeAware,
  parseCloze,
  wireCodeToggles,
  speakText
} from "./formatting.js";
import { FlashcardCustomStudyModal } from "./modals/study.js";
import { FlashcardExportImportModal } from "./modals/import-export.js";
import { FlashcardStatisticsModal } from "./modals/statistics.js";
import { FlashcardManagerModal } from "./modals/manager.js";
import { FlashcardStudioModal } from "./modals/studio.js";

export class PDLFlashcardView extends ItemView {
${splice(1032, 1586)}
`;

// plugin.js -------------------------------------------------------------------
files["src/plugin.js"] = `/**
 * PDL Flashcard — plugin entry point.
 *
 * This class only holds lifecycle wiring (commands, menus, view registration).
 * Data, AI and scheduling behaviour live in the mixins imported below, so each
 * concern can be read, changed and tested on its own.
 */
import { Plugin, Notice, setIcon, normalizePath } from "obsidian";
import { VIEW_TYPE, AI_FORMAT_RULES, DEFAULT_AI_PROMPTS, DEFAULTS } from "./constants.js";
import { formatRichInline } from "./formatting.js";
import { StorageMethods } from "./storage.js";
import { ReviewMethods } from "./review.js";
import { AiMethods } from "./ai.js";
import { PDLFlashcardView } from "./view.js";
import { PDLFlashcardSettingTab } from "./settings.js";
import { FlashcardStudioModal } from "./modals/studio.js";
import { FlashcardSelectionAIModal } from "./modals/selection.js";
import { FlashcardCustomStudyModal } from "./modals/study.js";
import { FlashcardExportImportModal } from "./modals/import-export.js";
import { FlashcardStatisticsModal } from "./modals/statistics.js";
import { FlashcardManagerModal } from "./modals/manager.js";

class PDLFlashcardPlugin extends Plugin {
${splice(493, 646)}

${splice(648, 653)}

${splice(655, 662)}
}

/**
 * Copies mixin methods onto the plugin prototype. Class methods are
 * non-enumerable, so Object.assign alone would silently copy nothing.
 */
function applyMixin(target, mixin) {
  for (const key of Object.getOwnPropertyNames(mixin.prototype)) {
    if (key === "constructor") continue;
    const descriptor = Object.getOwnPropertyDescriptor(mixin.prototype, key);
    Object.defineProperty(target.prototype, key, descriptor);
  }
}

applyMixin(PDLFlashcardPlugin, StorageMethods);
applyMixin(PDLFlashcardPlugin, ReviewMethods);
applyMixin(PDLFlashcardPlugin, AiMethods);

export { applyMixin };
export default PDLFlashcardPlugin;
`;

// modals ----------------------------------------------------------------------
const modals = [
  ["modals/study.js", "Custom study session dialog.", 1587, 1669, "FlashcardCustomStudyModal"],
  ["modals/import-export.js", "CSV / JSON import and export dialog.", 1670, 1841, "FlashcardExportImportModal"],
  ["modals/statistics.js", "Learning statistics dashboard dialog.", 1842, 1887, "FlashcardStatisticsModal"],
  ["modals/manager.js", "Global card manager dialog.", 1888, 1984, "FlashcardManagerModal"],
  ["modals/edit.js", "Single-card edit and delete dialogs.", 1985, 2069, "FlashcardEditModal"],
  ["modals/studio.js", "Flashcard Studio: manual drafting and AI generation.", 2070, 2567, "FlashcardStudioModal"],
  ["modals/selection.js", 'Right-click "generate from selection" dialog.', 2568, 2661, "FlashcardSelectionAIModal"]
];
for (const [rel, comment, from, to, className] of modals) {
  files[`src/${rel}`] = `/** ${comment} */
import { Modal, Notice, setIcon, MarkdownRenderer } from "obsidian";
import {
  parseCloze,
  formatRichInline,
  formatRichText,
  formatRichCodeAware,
  wireCodeToggles
} from "../formatting.js";
import { normalizeCardText } from "../utils.js";

${splice(from, to)}

export { ${className} };
`;
}

// index.js --------------------------------------------------------------------
files["src/index.js"] = `/** Bundle entry: esbuild compiles this into the CommonJS main.js Obsidian loads. */
import PDLFlashcardPlugin from "./plugin.js";

export default PDLFlashcardPlugin;
`;

let written = 0;
for (const [rel, content] of Object.entries(files)) {
  const target = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${content.trimEnd()}\n`);
  written++;
}
console.log(`[split] wrote ${written} modules from ${lines.length} source lines`);
