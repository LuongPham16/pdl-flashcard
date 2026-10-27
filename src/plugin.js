/**
 * PDL Flashcard — plugin entry point.
 *
 * This class only holds lifecycle wiring (commands, menus, view registration).
 * Data, AI and scheduling behaviour live in the mixins imported below, so each
 * concern can be read, changed and tested on its own.
 */
import { Plugin, Notice, setIcon, normalizePath } from "obsidian";
import { VIEW_TYPE, AI_FORMAT_RULES, DEFAULT_AI_PROMPTS, DEFAULTS } from "./constants.js";
import { formatRichInline } from "./formatting.js";
import { normalizeCardText } from "./utils.js";
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
  async onload() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULTS, saved || {});
    if (!saved || Number(saved.schemaVersion || 0) < 3) {
      this.settings.schemaVersion = 3;
      this.settings.outputFolder ||= "06 - Flashcards";
      this.settings.sourceFolders ||= [...DEFAULTS.sourceFolders];
    }
    this.settings.schedule ||= {};
    this.settings.reviews ||= [];
    this.settings.streakDates ||= [];
    this.settings.aiPrompts ||= DEFAULT_AI_PROMPTS;
    this.settings.selectedPromptId ||= "default";

    // Older versions shipped built-in prompts without the output-format rules,
    // which is what made AI cards arrive with broken spacing and unformatted code.
    let promptsUpgraded = false;
    this.settings.aiPrompts = this.settings.aiPrompts.map(prompt => {
      const isBuiltIn = DEFAULT_AI_PROMPTS.some(item => item.id === prompt.id);
      if (!isBuiltIn || String(prompt.template || "").includes("Output formatting rules")) return prompt;
      promptsUpgraded = true;
      return { ...prompt, template: `${String(prompt.template || "").trimEnd()}\n\n${AI_FORMAT_RULES}` };
    });
    if (promptsUpgraded) await this.saveData(this.settings);

    // Perform deep-merge and migration of settings.ai
    const legacyAi = this.settings.ai || {};
    this.settings.ai = Object.assign({}, DEFAULTS.ai, legacyAi);
    this.settings.ai.apiKeys = Object.assign({}, DEFAULTS.ai.apiKeys, legacyAi.apiKeys || {});
    this.settings.ai.endpoints = Object.assign({}, DEFAULTS.ai.endpoints, legacyAi.endpoints || {});
    this.settings.ai.models = Object.assign({}, DEFAULTS.ai.models, legacyAi.models || {});
    
    if (legacyAi.apiKey && !this.settings.ai.apiKeys.openai) {
      this.settings.ai.apiKeys.openai = legacyAi.apiKey;
    }
    if (legacyAi.endpoint && !this.settings.ai.endpoints.openai) {
      this.settings.ai.endpoints.openai = legacyAi.endpoint;
    }
    if (legacyAi.model && !this.settings.ai.models.openai) {
      this.settings.ai.models.openai = legacyAi.model;
    }
    await this.ensureOutputFolder();
    this.registerView(VIEW_TYPE, leaf => new PDLFlashcardView(leaf, this));
    this.addRibbonIcon("brain-circuit", "Open PDL Flashcard", () => this.activateView());
    this.addCommand({ id: "open", name: "Open learning dashboard", callback: () => this.activateView() });
    this.addCommand({ id: "quick-review", name: "Start quick review", callback: async () => {
      await this.activateView();
      const view = this.getView();
      if (view) view.startSession();
    }});
    this.addCommand({ id: "custom-study", name: "Custom study session", callback: async () => {
      await this.activateView();
      const view = this.getView();
      if (view) new FlashcardCustomStudyModal(this.app, this, view).open();
    }});
    this.addCommand({ id: "import-export", name: "Import or export flashcards", callback: () => new FlashcardExportImportModal(this.app, this).open() });
    this.addCommand({ id: "create-deck", name: "Create flashcards from a note", callback: () => new FlashcardStudioModal(this.app, this).open() });
    this.addCommand({ id: "create-deck-active-note", name: "Create flashcards from active note", checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!this.isEligibleSource(file)) return false;
      if (!checking) new FlashcardStudioModal(this.app, this, file).open();
      return true;
    }});
    this.addCommand({ id: "open-or-create-active-note", name: "Open or create flashcards for active note", hotkeys: [{ modifiers: ["Mod", "Alt"], key: "k" }], checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!this.isEligibleSource(file)) return false;
      if (!checking) void this.openOrCreateForNote(file);
      return true;
    }});
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (!this.isEligibleSource(file)) return;
      menu.addItem(item => item.setTitle("Open or create flashcards").setIcon("brain-circuit").onClick(() => void this.openOrCreateForNote(file)));
    }));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, view) => {
      const file = view?.file;
      if (!this.isEligibleSource(file)) return;
      menu.addItem(item => item.setTitle("Open or create flashcards").setIcon("brain-circuit").onClick(() => void this.openOrCreateForNote(file)));
      const rawSelection = editor?.getSelection?.() || "";
      const selectedText = normalizeCardText(rawSelection);
      if (!selectedText.trim()) return;
      menu.addItem(item => item.setTitle("Tạo flashcard AI từ đoạn bôi đen").setIcon("sparkles")
        .onClick(() => new FlashcardSelectionAIModal(this.app, this, file, selectedText).open()));
    }));
    this.addCommand({ id: "ai-from-selection", name: "Generate flashcards from selected text", checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      const editor = this.app.workspace.activeEditor?.editor;
      if (!this.isEligibleSource(file) || !String(editor?.getSelection?.() || "").trim()) return false;
      if (!checking) new FlashcardSelectionAIModal(this.app, this, file, normalizeCardText(editor.getSelection())).open();
      return true;
    }});
    this.addCommand({ id: "open-manager", name: "Open flashcard manager", callback: () => new FlashcardManagerModal(this.app, this).open() });
    this.addCommand({ id: "open-statistics", name: "Open statistics dashboard", callback: () => new FlashcardStatisticsModal(this.app, this).open() });
    this.registerMarkdownCodeBlockProcessor("pdl-flashcards", (source, el) => {
      try {
        const deck = JSON.parse(source);
        const box = el.createDiv({ cls: "pdl-deck-preview" });
        box.createEl("strong", { text: deck.title || "PDL Flashcard deck" });
        box.createEl("p", { text: `${Array.isArray(deck.cards) ? deck.cards.length : 0} questions · source: ${deck.sourcePath || "unknown"}` });
        const open = box.createEl("button", { text: "Open PDL Flashcard" }); open.onclick = () => this.activateView();
      } catch (_) { el.createEl("code", { text: "Invalid flashcard data." }); }
    });
    this.addSettingTab(new PDLFlashcardSettingTab(this.app, this));
    await this.saveData(this.settings);
    await this.autoBackup();
  }

  async autoBackup() {
    try {
      const backupDir = normalizePath(this.manifest.dir + "/backups");
      if (!(await this.app.vault.adapter.exists(backupDir))) {
        await this.app.vault.adapter.mkdir(backupDir);
      }
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const backupFile = normalizePath(`${backupDir}/data-${dateStr}.json`);
      const content = JSON.stringify(this.settings, null, 2);
      await this.app.vault.adapter.write(backupFile, content);

      const list = await this.app.vault.adapter.list(backupDir);
      const files = list.files.filter(f => f.endsWith('.json')).sort();
      if (files.length > 30) {
        for (let i = 0; i < files.length - 30; i++) {
          await this.app.vault.adapter.remove(files[i]);
        }
      }
    } catch (e) {
      console.error("PDL Flashcard backup error:", e);
    }
  }

  async ensureOutputFolder() {
    const folder = normalizePath(this.settings.outputFolder);
    if (!(await this.app.vault.adapter.exists(folder))) await this.app.vault.createFolder(folder);
  }

  isEligibleSource(file) {
    if (!file || file.extension !== "md") return false;
    const output = normalizePath(this.settings.outputFolder);
    return file.path !== output && !file.path.startsWith(output + "/");
  }

  async openOrCreateForNote(file) {
    if (!this.isEligibleSource(file)) { new Notice("Open a Markdown source note first."); return; }
    const cards = (await this.getCards()).filter(card => card.sourcePath === file.path);
    if (!cards.length) { new FlashcardStudioModal(this.app, this, file).open(); return; }
    await this.activateView();
    const view = this.getView();
    if (!view) { new Notice("Could not open PDL Flashcard."); return; }
    await view.refresh();
    const linkedCards = view.cards.filter(card => card.sourcePath === file.path);
    if (!linkedCards.length) { new FlashcardStudioModal(this.app, this, file).open(); return; }
    view.startSession(linkedCards);
    new Notice(`Opened ${linkedCards.length} flashcards for ${file.basename}.`);
  }

  onunload() { this.app.workspace.detachLeavesOfType(VIEW_TYPE); }

  getView() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    return leaf && leaf.view;
  }

  async activateView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }
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
