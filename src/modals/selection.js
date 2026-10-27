/** Right-click "generate from selection" dialog. */
import { Modal, Notice, setIcon, MarkdownRenderer } from "obsidian";
import {
  parseCloze,
  formatRichInline,
  formatRichText,
  formatRichCodeAware,
  wireCodeToggles
} from "../formatting.js";
import { normalizeCardText } from "../utils.js";
import { DEFAULT_AI_PROMPTS } from "../constants.js";
import { FlashcardStudioModal } from "./studio.js";

class FlashcardSelectionAIModal extends Modal {
  constructor(app, plugin, sourceFile, selectedText) {
    super(app);
    this.plugin = plugin;
    this.sourceFile = sourceFile;
    this.sourcePath = sourceFile?.path || "";
    this.selectedText = String(selectedText || "").trim();
    this.targetDeckFile = null;
    this.deckChecked = false;
    this.counts = { basic: 3, mcq: 2, cloze: 2 };
  }

  onOpen() {
    this.modalEl.addClass("pdl-selection-modal");
    this.modalEl.addClass("pdl-flashcard");
    this.render();
    // Cheap one-off scan so the user knows up front whether saving appends.
    void this.plugin.findDeckFileForSource(this.sourcePath).then(file => {
      this.targetDeckFile = file;
      this.deckChecked = true;
      this.renderStatus();
    }).catch(() => {
      this.deckChecked = true;
      this.renderStatus();
    });
  }

  render() {
    const root = this.contentEl; root.empty();
    const head = root.createDiv({ cls: "pdl-selection-modal-head" });
    head.createSpan({ text: "AI FLASHCARDS FROM SELECTION" });
    head.createEl("h2", { text: this.sourceFile?.basename || "Untitled note" });
    head.createEl("p", { text: `${this.selectedText.length} ký tự được bôi đen` });

    const quote = root.createEl("blockquote", { cls: "pdl-selection-text" });
    quote.setText(this.selectedText.length > 600 ? `${this.selectedText.slice(0, 600)}…` : this.selectedText);

    this.statusEl = root.createDiv({ cls: "pdl-selection-status" });
    this.renderStatus();

    const counts = root.createDiv({ cls: "pdl-ai-counts" });
    const numberInput = (label, key) => {
      counts.createEl("label", { text: label });
      const input = counts.createEl("input", { attr: { type: "number", min: "0", max: "30", value: String(this.counts[key]) } });
      input.oninput = () => { this.counts[key] = Math.max(0, Math.min(30, Number(input.value) || 0)); };
      return input;
    };
    numberInput("Q&A", "basic");
    numberInput("MCQ", "mcq");
    numberInput("Cloze", "cloze");

    const promptSelect = counts.createEl("select", { cls: "pdl-ai-prompt-select", attr: { title: "Select AI Prompt Preset" } });
    const prompts = this.plugin.settings.aiPrompts || DEFAULT_AI_PROMPTS;
    prompts.forEach(preset => promptSelect.createEl("option", { text: preset.name, attr: { value: preset.id } }));
    promptSelect.value = this.plugin.settings.selectedPromptId || "default";
    promptSelect.onchange = async () => {
      this.plugin.settings.selectedPromptId = promptSelect.value;
      await this.plugin.saveData(this.plugin.settings);
    };

    const actions = root.createDiv({ cls: "pdl-selection-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.onclick = () => this.close();
    const run = actions.createEl("button", { cls: "mod-cta", text: "Generate flashcards" });
    run.onclick = () => {
      const source = this.app.vault.getAbstractFileByPath(this.sourcePath);
      if (!source) { new Notice("The source note could not be found."); return; }
      this.close();
      new FlashcardStudioModal(this.app, this.plugin, source, {
        selectedText: this.selectedText,
        autoGenerate: true,
        counts: { ...this.counts },
        promptId: promptSelect.value
      }).open();
    };
  }

  renderStatus() {
    if (!this.statusEl) return;
    this.statusEl.empty();
    if (!this.deckChecked) {
      this.statusEl.createSpan({ text: "Checking for an existing flashcard deck…" });
      return;
    }
    if (this.targetDeckFile) {
      const icon = this.statusEl.createSpan(); setIcon(icon, "layers");
      this.statusEl.createSpan({ text: `Note này đã có deck "${this.targetDeckFile.basename}" — thẻ mới sẽ được bổ sung vào deck đó.` });
    } else {
      const icon = this.statusEl.createSpan(); setIcon(icon, "file-plus");
      this.statusEl.createSpan({ text: `Note này chưa có flashcard — một deck mới sẽ được tạo trong ${this.plugin.settings.outputFolder}.` });
    }
  }
}


export { FlashcardSelectionAIModal };
