/** CSV / JSON import and export dialog. */
import { Modal, Notice, setIcon, MarkdownRenderer } from "obsidian";
import {
  parseCloze,
  formatRichInline,
  formatRichText,
  formatRichCodeAware,
  wireCodeToggles
} from "../formatting.js";
import { normalizeCardText } from "../utils.js";
import { L } from "../i18n.js";
import { DELIMITER_OPTIONS, parseImportCards } from "../import-parse.js";

class FlashcardExportImportModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.initialText = options.text || "";
    this.initialTargetPath = options.targetPath || "";
    this.initialDelimiter = options.delimiter || "auto";
    this.activeTab = options.tab === "import" ? "import" : "export";
  }

  async onOpen() {
    this.modalEl.addClass("pdl-import-export-modal");
    this.cards = await this.plugin.getCards();
    this.render();
  }

  render() {
    const root = this.contentEl;
    root.empty();
    const head = root.createDiv({ cls: "pdl-manager-head" });
    const copy = head.createDiv();
    copy.createSpan({ text: L("DATA PORTABILITY", "XUẤT / NHẬP DỮ LIỆU") });
    copy.createEl("h2", { text: L("Import & Export Flashcards", "Nhập & xuất flashcard") });
    copy.createEl("p", { text: L("Export cards to CSV/JSON or import new cards from external sources.", "Xuất thẻ ra CSV/JSON hoặc nhập thẻ mới từ nguồn bên ngoài.") });

    const tabs = root.createDiv({ cls: "pdl-stats-ranges", attr: { style: "margin: 16px 0;" } });
    const expBtn = tabs.createEl("button", { text: L("Export Decks", "Xuất deck"), attr: { "aria-pressed": String(this.activeTab === "export") } });
    if (this.activeTab === "export") expBtn.addClass("is-active");
    expBtn.onclick = () => { this.activeTab = "export"; this.render(); };

    const impBtn = tabs.createEl("button", { text: L("Import Cards", "Nhập thẻ"), attr: { "aria-pressed": String(this.activeTab === "import") } });
    if (this.activeTab === "import") impBtn.addClass("is-active");
    impBtn.onclick = () => { this.activeTab = "import"; this.render(); };

    const container = root.createDiv({ cls: "pdl-import-export-body" });
    if (this.activeTab === "export") {
      this.renderExport(container);
    } else {
      this.renderImport(container);
    }
  }

  renderExport(parent) {
    parent.createEl("h3", { text: L("Export Flashcard Data", "Xuất dữ liệu flashcard") });
    parent.createEl("p", { cls: "pdl-edit-context", text: L(`Total available cards in vault: ${this.cards.length}`, `Tổng số thẻ có trong vault: ${this.cards.length}`) });

    const formatLabel = parent.createEl("label", { cls: "pdl-editor-field" });
    formatLabel.createSpan({ text: L("Export Format", "Định dạng xuất") });
    const formatSelect = formatLabel.createEl("select", { cls: "pdl-edit-type" });
    formatSelect.createEl("option", { text: L("CSV (Anki & Excel compatible)", "CSV (tương thích Anki & Excel)"), attr: { value: "csv" } });
    formatSelect.createEl("option", { text: L("JSON (PDL Native format)", "JSON (định dạng gốc PDL)"), attr: { value: "json" } });

    const deckLabel = parent.createEl("label", { cls: "pdl-editor-field" });
    deckLabel.createSpan({ text: L("Deck to Export", "Deck cần xuất") });
    const deckSelect = deckLabel.createEl("select", { cls: "pdl-edit-type" });
    deckSelect.createEl("option", { text: L("All Decks (Entire Library)", "Tất cả deck (toàn thư viện)"), attr: { value: "all" } });
    const decks = new Map();
    this.cards.forEach(c => decks.set(c.file.path, c.deckTitle));
    [...decks.entries()].forEach(([path, title]) => deckSelect.createEl("option", { text: title, attr: { value: path } }));

    const btnRow = parent.createDiv({ cls: "pdl-edit-footer" });
    const exportBtn = btnRow.createEl("button", { cls: "mod-cta", text: L("Download Export File", "Tải file xuất") });
    exportBtn.onclick = () => {
      let targetCards = this.cards;
      if (deckSelect.value !== "all") {
        targetCards = targetCards.filter(c => c.file.path === deckSelect.value);
      }
      if (!targetCards.length) { new Notice(L("No cards to export.", "Không có thẻ nào để xuất.")); return; }

      const format = formatSelect.value;
      if (format === "csv") {
        let csv = "Question,Answer,Type,Explanation,Tags,DeckTitle\n";
        targetCards.forEach(c => {
          const q = `"${(c.question || "").replace(/"/g, '""')}"`;
          const a = `"${(c.answer || "").replace(/"/g, '""')}"`;
          const type = `"${c.type || "basic"}"`;
          const exp = `"${(c.explanation || "").replace(/"/g, '""')}"`;
          const tags = `"${(c.tags || []).join(",")}"`;
          const deck = `"${(c.deckTitle || "").replace(/"/g, '""')}"`;
          csv += `${q},${a},${type},${exp},${tags},${deck}\n`;
        });
        this.downloadFile("pdl-flashcards-export.csv", csv, "text/csv");
      } else {
        const json = JSON.stringify(targetCards.map(c => ({
          id: c.id, type: c.type, question: c.question, answer: c.answer,
          explanation: c.explanation, choices: c.choices, tags: c.tags, deckTitle: c.deckTitle
        })), null, 2);
        this.downloadFile("pdl-flashcards-export.json", json, "application/json");
      }
      new Notice(L(`Exported ${targetCards.length} cards successfully.`, `Đã xuất ${targetCards.length} thẻ thành công.`));
    };
  }

  renderImport(parent) {
    parent.createEl("h3", { text: L("Import Flashcards from CSV / JSON", "Nhập flashcard từ CSV / JSON") });
    parent.createEl("p", { cls: "pdl-edit-context", text: L("Paste CSV or JSON content below to create a new flashcard deck note.", "Dán nội dung CSV hoặc JSON bên dưới để tạo note deck flashcard mới.") });

    const targetLabel = parent.createEl("label", { cls: "pdl-editor-field" });
    targetLabel.createSpan({ text: L("Save to an existing note (optional)", "Lưu vào note có sẵn (tùy chọn)") });
    const targetSelect = targetLabel.createEl("select", { cls: "pdl-edit-type pdl-import-target" });
    targetSelect.createEl("option", { text: L("Standalone deck (enter a name below)", "Deck riêng (nhập tên bên dưới)"), attr: { value: "" } });
    this.app.vault.getMarkdownFiles()
      .filter(file => this.plugin.isConfiguredSource(file))
      .sort((a, b) => a.path.localeCompare(b.path, "vi"))
      .forEach(file => targetSelect.createEl("option", { text: file.path, attr: { value: file.path } }));
    if (this.initialTargetPath) targetSelect.value = this.initialTargetPath;
    const targetStatus = parent.createDiv({ cls: "pdl-import-target-status" });

    const nameLabel = parent.createEl("label", { cls: "pdl-editor-field" });
    nameLabel.createSpan({ text: L("New Deck Name", "Tên deck mới") });
    const nameInput = nameLabel.createEl("input", { attr: { type: "text", placeholder: L("Imported Deck", "Deck đã nhập") } });
    nameInput.value = L("Imported Deck", "Deck đã nhập");
    const syncTarget = () => {
      const target = targetSelect.value;
      nameLabel.style.display = target ? "none" : "";
      nameInput.disabled = Boolean(target);
      targetStatus.setText(target
        ? L(`Cards will be added to the deck of “${target}”.`, `Thẻ sẽ được thêm vào deck của “${target}”.`)
        : L("Cards will be saved as a standalone deck.", "Thẻ sẽ được lưu thành một deck riêng."));
    };
    targetSelect.onchange = syncTarget;
    syncTarget();

    const delimiterLabel = parent.createEl("label", { cls: "pdl-editor-field" });
    delimiterLabel.createSpan({ text: L("Field delimiter", "Dấu phân cách trường") });
    const delimiterSelect = delimiterLabel.createEl("select", { cls: "pdl-edit-type pdl-import-delimiter" });
    const delimiterLabels = {
      auto: L("Auto-detect", "Tự nhận diện"),
      comma: L("Comma  ,", "Dấu phẩy  ,"),
      semicolon: L("Semicolon  ;", "Dấu chấm phẩy  ;"),
      tab: L("Tab", "Tab"),
      space: L("Space", "Dấu cách"),
      "double-colon": L("Double colon  ::", "Hai dấu hai chấm  ::"),
      pipe: L("Pipe  |", "Dấu gạch đứng  |")
    };
    DELIMITER_OPTIONS.forEach(([value]) => delimiterSelect.createEl("option", { text: delimiterLabels[value] || value, attr: { value } }));
    delimiterSelect.value = this.initialDelimiter;

    const contentLabel = parent.createEl("label", { cls: "pdl-editor-field" });
    contentLabel.createSpan({ text: L("Data Content (CSV or JSON)", "Nội dung dữ liệu (CSV hoặc JSON)") });
    const textarea = contentLabel.createEl("textarea", { attr: { rows: "8", placeholder: "Question,Answer,Type,Explanation\nWhat is Obsidian?,A knowledge base software,basic," } });
    textarea.value = this.initialText;

    const preview = parent.createDiv({ cls: "pdl-import-preview" });
    const updatePreview = () => {
      try {
        const parsed = parseImportCards(textarea.value, delimiterSelect.value);
        const label = parsed.delimiter === "json" ? "JSON" : (delimiterLabels[parsed.delimiter] || parsed.delimiter || "—");
        preview.setText(L(`${parsed.cards.length} cards ready · ${label}`, `${parsed.cards.length} thẻ sẵn sàng · ${label}`));
      } catch (error) {
        preview.setText(L(`Invalid data: ${error.message}`, `Dữ liệu chưa hợp lệ: ${error.message}`));
      }
    };
    textarea.oninput = updatePreview;
    delimiterSelect.onchange = updatePreview;
    updatePreview();

    const btnRow = parent.createDiv({ cls: "pdl-edit-footer" });
    const importBtn = btnRow.createEl("button", { cls: "mod-cta", text: L("Import Cards", "Nhập thẻ") });
    importBtn.onclick = async () => {
      const text = textarea.value.trim();
      const deckName = nameInput.value.trim() || "Imported Deck";
      if (!text) { new Notice(L("Please paste data to import.", "Hãy dán dữ liệu cần nhập.")); return; }

      let cards = [];
      try {
        cards = parseImportCards(text, delimiterSelect.value).cards;
      } catch (e) {
        new Notice(L("Failed to parse import data: " + e.message, "Không đọc được dữ liệu nhập: " + e.message));
        return;
      }

      if (!cards.length) {
        new Notice(L("No flashcards found. Use Q::A, tab, comma, semicolon or pipe between fields.", "Không tìm thấy flashcard. Dùng Q::A, tab, dấu phẩy, chấm phẩy hoặc dấu | giữa các trường."));
        return;
      }

      const targetPath = targetSelect.value;
      const targetFile = targetPath ? this.app.vault.getAbstractFileByPath(targetPath) : null;
      if (targetPath && !targetFile) {
        new Notice(L("The selected note could not be found.", "Không tìm thấy note đã chọn."));
        return;
      }
      try {
        if (targetFile) {
          const existingDeck = await this.plugin.findDeckFileForSource(targetPath);
          if (existingDeck) {
            const result = await this.plugin.appendCardsToDeck(existingDeck, cards);
            new Notice(L(`Imported ${result.added} cards into ${existingDeck.basename}.`, `Đã nhập ${result.added} thẻ vào ${existingDeck.basename}.`));
          } else {
            await this.plugin.createDeck(targetFile, cards, "import");
            new Notice(L(`Created a deck linked to ${targetFile.basename}.`, `Đã tạo deck liên kết với ${targetFile.basename}.`));
          }
        } else {
          const dummySource = { path: `${this.plugin.settings.outputFolder}/${deckName}.md`, basename: deckName };
          await this.plugin.createDeck(dummySource, cards, "import");
          new Notice(L(`Successfully imported ${cards.length} cards into ${deckName}.`, `Đã nhập ${cards.length} thẻ vào ${deckName}.`));
        }
        this.close();
      } catch (err) {
        new Notice(L("Import error: " + (err.message || err), "Lỗi nhập: " + (err.message || err)));
      }
    };
  }

  downloadFile(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }
}


export { FlashcardExportImportModal };
