/** Batch deck creation: pick a folder, choose all or some notes, generate decks. */
import { Modal, Notice } from "obsidian";
import { L } from "../i18n.js";

class FlashcardBatchModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.files = [];
    this.folder = "";
    this.noteChecks = new Map();
    this.running = false;
  }

  onOpen() {
    this.modalEl.addClass("pdl-batch-modal");
    this.files = this.app.vault.getMarkdownFiles()
      .filter(file => this.plugin.isConfiguredSource(file))
      .sort((a, b) => a.path.localeCompare(b.path, "vi"));
    this.folder = this.defaultFolder();
    this.render();
  }

  folders() {
    return [...new Set(this.files.map(file => file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : ""))]
      .sort((a, b) => a.localeCompare(b, "vi"));
  }

  defaultFolder() {
    const preferred = (this.plugin.settings.sourceFolders || [])
      .find(folder => this.files.some(file => file.path.startsWith(`${folder}/`)));
    if (preferred) return preferred;
    const folders = this.folders();
    return folders.find(Boolean) || "";
  }

  notes() {
    return this.files.filter(file => !this.folder || file.path.startsWith(`${this.folder}/`));
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.createSpan({ cls: "pdl-edit-kicker", text: L("BATCH STUDIO", "TẠO HÀNG LOẠT") });
    root.createEl("h2", { text: L("Create decks from a folder", "Tạo deck từ một folder") });
    root.createEl("p", { cls: "pdl-edit-context", text: L("Pick a folder, then create decks for all notes or only the ones you select.", "Chọn folder, rồi tạo deck cho tất cả note hoặc chỉ những note bạn chọn.") });

    const folderLabel = root.createEl("label", { cls: "pdl-editor-field" });
    folderLabel.createSpan({ text: L("Folder", "Folder") });
    const folderSelect = folderLabel.createEl("select", { cls: "pdl-edit-type pdl-batch-folder" });
    this.folders().forEach(folder => folderSelect.createEl("option", {
      text: folder || L("Vault root", "Gốc vault"),
      attr: { value: folder }
    }));
    folderSelect.value = this.folder;
    folderSelect.onchange = () => { this.folder = folderSelect.value; this.renderNotes(); };

    const tools = root.createDiv({ cls: "pdl-batch-tools" });
    const selectAllLabel = tools.createEl("label", { cls: "pdl-batch-select-all" });
    this.selectAll = selectAllLabel.createEl("input", { attr: { type: "checkbox" } });
    selectAllLabel.createSpan({ text: L("Select all notes", "Chọn tất cả note") });
    this.selectAll.onchange = () => {
      this.noteChecks.forEach(({ checkbox }) => { checkbox.checked = this.selectAll.checked; });
      this.updateCount();
    };

    this.listEl = root.createDiv({ cls: "pdl-batch-list" });

    const counts = root.createDiv({ cls: "pdl-ai-counts pdl-batch-counts" });
    const defaults = {
      basic: Number(this.plugin.settings.defaultBasicCount ?? 4),
      mcq: Number(this.plugin.settings.defaultMcqCount ?? 3),
      cloze: Number(this.plugin.settings.defaultClozeCount ?? 3)
    };
    const countInput = (label, key, fallback) => {
      counts.createEl("label", { text: label });
      return counts.createEl("input", { attr: { type: "number", min: "0", max: "30", value: String(defaults[key] ?? fallback) } });
    };
    this.basicInput = countInput(L("Q&A", "Hỏi đáp"), "basic", 4);
    this.mcqInput = countInput("MCQ", "mcq", 3);
    this.clozeInput = countInput(L("Cloze", "Điền khuyết"), "cloze", 3);
    this.promptSelect = counts.createEl("select", { cls: "pdl-ai-prompt-select", attr: { title: L("Select AI Prompt Preset", "Chọn prompt AI") } });
    (this.plugin.settings.aiPrompts || []).forEach(prompt => this.promptSelect.createEl("option", { text: prompt.name, attr: { value: prompt.id } }));
    this.promptSelect.value = this.plugin.settings.selectedPromptId || "default";

    this.statusEl = root.createDiv({ cls: "pdl-batch-status" });
    const footer = root.createDiv({ cls: "pdl-edit-footer" });
    this.cancelButton = footer.createEl("button", { text: L("Cancel", "Hủy") });
    this.cancelButton.onclick = () => this.close();
    this.generateButton = footer.createEl("button", { cls: "mod-cta pdl-batch-generate" });
    this.generateButton.onclick = () => this.generate();
    this.renderNotes();
  }

  renderNotes() {
    if (!this.listEl) return;
    this.listEl.empty();
    this.noteChecks.clear();
    const notes = this.notes();
    if (!notes.length) {
      this.listEl.createDiv({ cls: "pdl-batch-empty", text: L("No notes in this folder.", "Folder này không có note nào.") });
    } else {
      notes.forEach(file => {
        const row = this.listEl.createEl("label", { cls: "pdl-batch-note" });
        const checkbox = row.createEl("input", { attr: { type: "checkbox" } });
        checkbox.checked = true;
        checkbox.onchange = () => this.updateCount();
        const copy = row.createDiv({ cls: "pdl-batch-copy" });
        copy.createEl("strong", { text: file.basename });
        copy.createSpan({ text: file.path });
        const state = row.createSpan({ cls: "pdl-batch-state" });
        this.noteChecks.set(file.path, { row, checkbox, state });
      });
    }
    if (this.selectAll) this.selectAll.checked = true;
    this.updateCount();
  }

  selectedFiles() {
    return this.notes().filter(file => this.noteChecks.get(file.path)?.checkbox.checked);
  }

  updateCount() {
    const count = this.selectedFiles().length;
    this.generateButton.textContent = count
      ? L(`Generate ${count} deck${count === 1 ? "" : "s"}`, `Tạo ${count} deck`)
      : L("Generate decks", "Tạo deck");
    this.generateButton.disabled = this.running || count === 0;
    const all = this.notes();
    if (this.selectAll) this.selectAll.checked = all.length > 0 && count === all.length;
  }

  setState(file, kind, text) {
    const entry = this.noteChecks.get(file.path);
    if (!entry) return;
    entry.row.removeClass("is-running");
    entry.row.removeClass("is-done");
    entry.row.removeClass("is-error");
    if (kind) entry.row.addClass(`is-${kind}`);
    entry.state.setText(text || "");
  }

  async generate() {
    if (this.running) return;
    const files = this.selectedFiles();
    if (!files.length) { new Notice(L("Select at least one note.", "Hãy chọn ít nhất một note.")); return; }
    const counts = {
      basic: Number(this.basicInput.value) || 0,
      mcq: Number(this.mcqInput.value) || 0,
      cloze: Number(this.clozeInput.value) || 0
    };
    this.running = true;
    this.generateButton.disabled = true;
    this.cancelButton.disabled = true;
    let done = 0;
    let failed = 0;
    for (const file of files) {
      this.setState(file, "running", L("Generating…", "Đang tạo…"));
      try {
        const cards = await this.plugin.generateWithAI(file, counts, this.promptSelect.value);
        if (!Array.isArray(cards) || !cards.length) throw new Error(L("No cards generated.", "Không tạo được thẻ nào."));
        const existingDeck = await this.plugin.findDeckFileForSource(file.path);
        if (existingDeck) await this.plugin.appendCardsToDeck(existingDeck, cards);
        else await this.plugin.createDeck(file, cards, "ai-batch", { silent: true });
        done++;
        this.setState(file, "done", L(`${cards.length} cards`, `${cards.length} thẻ`));
      } catch (error) {
        failed++;
        this.setState(file, "error", error.message || String(error));
      }
      this.statusEl.setText(L(`${done} done · ${failed} failed`, `${done} xong · ${failed} lỗi`));
    }
    this.running = false;
    this.cancelButton.disabled = false;
    this.updateCount();
    new Notice(L(`Batch finished: ${done} decks created, ${failed} failed.`, `Hoàn tất: ${done} deck đã tạo, ${failed} lỗi.`));
  }
}

export { FlashcardBatchModal };
