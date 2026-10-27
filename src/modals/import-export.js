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

class FlashcardExportImportModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.activeTab = "export";
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
    copy.createSpan({ text: "DATA PORTABILITY" });
    copy.createEl("h2", { text: "Import & Export Flashcards" });
    copy.createEl("p", { text: "Export cards to CSV/JSON or import new cards from external sources." });

    const tabs = root.createDiv({ cls: "pdl-stats-ranges", attr: { style: "margin: 16px 0;" } });
    const expBtn = tabs.createEl("button", { text: "Export Decks", attr: { "aria-pressed": String(this.activeTab === "export") } });
    if (this.activeTab === "export") expBtn.addClass("is-active");
    expBtn.onclick = () => { this.activeTab = "export"; this.render(); };

    const impBtn = tabs.createEl("button", { text: "Import Cards", attr: { "aria-pressed": String(this.activeTab === "import") } });
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
    parent.createEl("h3", { text: "Export Flashcard Data" });
    parent.createEl("p", { cls: "pdl-edit-context", text: `Total available cards in vault: ${this.cards.length}` });

    const formatLabel = parent.createEl("label", { cls: "pdl-editor-field" });
    formatLabel.createSpan({ text: "Export Format" });
    const formatSelect = formatLabel.createEl("select", { cls: "pdl-edit-type" });
    formatSelect.createEl("option", { text: "CSV (Anki & Excel compatible)", attr: { value: "csv" } });
    formatSelect.createEl("option", { text: "JSON (PDL Native format)", attr: { value: "json" } });

    const deckLabel = parent.createEl("label", { cls: "pdl-editor-field" });
    deckLabel.createSpan({ text: "Deck to Export" });
    const deckSelect = deckLabel.createEl("select", { cls: "pdl-edit-type" });
    deckSelect.createEl("option", { text: "All Decks (Entire Library)", attr: { value: "all" } });
    const decks = new Map();
    this.cards.forEach(c => decks.set(c.file.path, c.deckTitle));
    [...decks.entries()].forEach(([path, title]) => deckSelect.createEl("option", { text: title, attr: { value: path } }));

    const btnRow = parent.createDiv({ cls: "pdl-edit-footer" });
    const exportBtn = btnRow.createEl("button", { cls: "mod-cta", text: "Download Export File" });
    exportBtn.onclick = () => {
      let targetCards = this.cards;
      if (deckSelect.value !== "all") {
        targetCards = targetCards.filter(c => c.file.path === deckSelect.value);
      }
      if (!targetCards.length) { new Notice("No cards to export."); return; }

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
      new Notice(`Exported ${targetCards.length} cards successfully.`);
    };
  }

  renderImport(parent) {
    parent.createEl("h3", { text: "Import Flashcards from CSV / JSON" });
    parent.createEl("p", { cls: "pdl-edit-context", text: "Paste CSV or JSON content below to create a new flashcard deck note." });

    const nameLabel = parent.createEl("label", { cls: "pdl-editor-field" });
    nameLabel.createSpan({ text: "New Deck Name" });
    const nameInput = nameLabel.createEl("input", { attr: { type: "text", placeholder: "Imported Deck" } });
    nameInput.value = "Imported Deck";

    const contentLabel = parent.createEl("label", { cls: "pdl-editor-field" });
    contentLabel.createSpan({ text: "Data Content (CSV or JSON)" });
    const textarea = contentLabel.createEl("textarea", { attr: { rows: "8", placeholder: "Question,Answer,Type,Explanation\nWhat is Obsidian?,A knowledge base software,basic," } });

    const btnRow = parent.createDiv({ cls: "pdl-edit-footer" });
    const importBtn = btnRow.createEl("button", { cls: "mod-cta", text: "Import Cards" });
    importBtn.onclick = async () => {
      const text = textarea.value.trim();
      const deckName = nameInput.value.trim() || "Imported Deck";
      if (!text) { new Notice("Please paste data to import."); return; }

      let cards = [];
      try {
        if (text.startsWith("[") || text.startsWith("{")) {
          const parsed = JSON.parse(text);
          const rawCards = Array.isArray(parsed) ? parsed : (parsed.cards || []);
          cards = rawCards.map(c => ({
            type: c.type || "basic",
            question: String(c.question || "").trim(),
            answer: String(c.answer || "").trim(),
            explanation: String(c.explanation || "").trim(),
            choices: Array.isArray(c.choices) ? c.choices : undefined,
            tags: Array.isArray(c.tags) ? c.tags : []
          }));
        } else {
          const lines = text.split("\n").filter(l => l.trim());
          const hasHeader = lines[0].toLowerCase().includes("question");
          const startIdx = hasHeader ? 1 : 0;
          for (let i = startIdx; i < lines.length; i++) {
            const cols = lines[i].split(",");
            if (cols.length >= 2) {
              const q = cols[0].replace(/^"|"$/g, "").replace(/""/g, '"').trim();
              const a = cols[1].replace(/^"|"$/g, "").replace(/""/g, '"').trim();
              const type = cols[2] ? cols[2].replace(/^"|"$/g, "").trim() : "basic";
              const exp = cols[3] ? cols[3].replace(/^"|"$/g, "").replace(/""/g, '"').trim() : "";
              const tags = cols[4] ? cols[4].replace(/^"|"$/g, "").split(",").map(t => t.trim()).filter(Boolean) : [];
              if (q && a) cards.push({ type, question: q, answer: a, explanation: exp, tags });
            }
          }
        }
      } catch (e) {
        new Notice("Failed to parse import data: " + e.message);
        return;
      }

      if (!cards.length) {
        new Notice("No valid cards found in import data.");
        return;
      }

      const dummySource = { path: `06 - Flashcards/${deckName}.md`, basename: deckName };
      try {
        await this.plugin.createDeck(dummySource, cards, "import");
        new Notice(`Successfully imported ${cards.length} cards into ${deckName}.`);
        this.close();
      } catch (err) {
        new Notice("Import error: " + (err.message || err));
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
