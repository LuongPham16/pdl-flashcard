/** Custom study session dialog. */
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

class FlashcardCustomStudyModal extends Modal {
  constructor(app, plugin, view) {
    super(app);
    this.plugin = plugin;
    this.view = view;
    this.mode = "cram_all";
    this.selectedTag = "";
    this.selectedDeckPath = "";
  }

  async onOpen() {
    this.modalEl.addClass("pdl-custom-study-modal");
    this.cards = await this.plugin.getCards();
    this.render();
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.createSpan({ cls: "pdl-edit-kicker", text: L("CUSTOM STUDY SESSION", "PHIÊN ÔN TÙY CHỌN") });
    root.createEl("h2", { text: L("Focus Learning & Cramming", "Học tập trung & luyện nhanh") });
    root.createEl("p", { cls: "pdl-edit-context", text: L("Review cards flexibly outside normal Spaced Repetition limits.", "Ôn thẻ linh hoạt, không giới hạn bởi lịch lặp lại ngắt quãng.") });

    const modeLabel = root.createEl("label", { cls: "pdl-editor-field" });
    modeLabel.createSpan({ text: L("Study Mode", "Chế độ ôn") });
    const modeSelect = modeLabel.createEl("select", { cls: "pdl-edit-type" });
    [
      ["cram_all", L("Cram All Cards (Ignore Due dates)", "Luyện toàn bộ (bỏ qua ngày đến hạn)")],
      ["lapsed", L("Difficult Cards (Lapses > 0)", "Thẻ khó (đã quên > 0 lần)")],
      ["by_tag", L("Filter by Tag", "Lọc theo tag")]
    ].forEach(([val, label]) => modeSelect.createEl("option", { text: label, attr: { value: val } }));
    modeSelect.value = this.mode;
    modeSelect.onchange = () => { this.mode = modeSelect.value; this.render(); };

    if (this.mode === "by_tag") {
      const allTags = new Set();
      this.cards.forEach(c => (c.tags || []).forEach(t => allTags.add(t)));
      const tagLabel = root.createEl("label", { cls: "pdl-editor-field" });
      tagLabel.createSpan({ text: L("Select Tag", "Chọn tag") });
      const tagSelect = tagLabel.createEl("select", { cls: "pdl-edit-type" });
      tagSelect.createEl("option", { text: L("— Choose a tag —", "— Chọn một tag —"), attr: { value: "" } });
      [...allTags].sort().forEach(t => tagSelect.createEl("option", { text: `#${t}`, attr: { value: t } }));
      tagSelect.value = this.selectedTag;
      tagSelect.onchange = () => { this.selectedTag = tagSelect.value; };
    }

    const deckLabel = root.createEl("label", { cls: "pdl-editor-field" });
    deckLabel.createSpan({ text: L("Deck Scope", "Phạm vi deck") });
    const deckSelect = deckLabel.createEl("select", { cls: "pdl-edit-type" });
    deckSelect.createEl("option", { text: L("All Decks in Vault", "Tất cả deck trong vault"), attr: { value: "" } });
    const decks = new Map();
    this.cards.forEach(c => decks.set(c.file.path, c.deckTitle));
    [...decks.entries()].forEach(([path, title]) => deckSelect.createEl("option", { text: title, attr: { value: path } }));
    deckSelect.value = this.selectedDeckPath;
    deckSelect.onchange = () => { this.selectedDeckPath = deckSelect.value; };

    const footer = root.createDiv({ cls: "pdl-edit-footer" });
    const cancel = footer.createEl("button", { text: L("Cancel", "Hủy") });
    cancel.onclick = () => this.close();
    const start = footer.createEl("button", { cls: "mod-cta", text: L("Start Custom Session", "Bắt đầu phiên tùy chọn") });
    start.onclick = () => {
      let pool = this.cards;
      if (this.selectedDeckPath) {
        pool = pool.filter(c => c.file.path === this.selectedDeckPath);
      }
      if (this.mode === "lapsed") {
        pool = pool.filter(c => (this.plugin.settings.schedule[c.id]?.lapses || 0) > 0);
      } else if (this.mode === "by_tag") {
        if (!this.selectedTag) { new Notice(L("Please select a tag first.", "Hãy chọn một tag trước.")); return; }
        pool = pool.filter(c => (c.tags || []).includes(this.selectedTag));
      }

      if (!pool.length) {
        new Notice(L("No cards match your selected criteria.", "Không có thẻ nào khớp tiêu chí đã chọn."));
        return;
      }

      this.close();
      this.view.startSession(pool, true);
    };
  }
}


export { FlashcardCustomStudyModal };
