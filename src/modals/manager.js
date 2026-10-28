/** Global card manager dialog. */
import { Modal, setIcon } from "obsidian";
import {
  parseCloze,
  formatRichCodeAware
} from "../formatting.js";
import { formatCount } from "../utils.js";
import { L } from "../i18n.js";
import { FlashcardStudioModal } from "./studio.js";
import { FlashcardEditModal, DeleteFlashcardModal } from "./edit.js";

class FlashcardManagerModal extends Modal {
  constructor(app, plugin) {
    super(app); this.plugin = plugin; this.cards = []; this.query = ""; this.type = "all"; this.page = 0; this.pageSize = 25;
  }

  async onOpen() {
    this.modalEl.addClass("pdl-manager-modal");
    this.contentEl.createDiv({ cls: "pdl-manager-loading", text: L("Loading flashcards…", "Đang tải flashcard…") });
    this.cards = await this.plugin.getCards();
    this.render();
  }

  async reload() {
    this.cards = await this.plugin.getCards(); this.render();
  }

  render() {
    const root = this.contentEl; root.empty();
    const head = root.createDiv({ cls: "pdl-manager-head" });
    const copy = head.createDiv();
    copy.createSpan({ text: L("GLOBAL CARD INDEX", "CHỈ MỤC THẺ TOÀN BỘ") });
    copy.createEl("h2", { text: L("Flashcard Manager", "Quản lý flashcard") });
    copy.createEl("p", { text: L("Find, edit, or remove any card without navigating through deck notes.", "Tìm, sửa hoặc xóa bất kỳ thẻ nào mà không cần mở từng note deck.") });
    const total = head.createDiv({ cls: "pdl-manager-total" });
    total.createEl("strong", { text: formatCount(this.cards.length, this.cards.length >= 10000), attr: { title: formatCount(this.cards.length) } });
    total.createSpan({ text: L("CARDS", "THẺ") });
    const toolbar = root.createDiv({ cls: "pdl-manager-toolbar" });
    const searchWrap = toolbar.createDiv({ cls: "pdl-manager-search" }); setIcon(searchWrap.createSpan(), "search");
    this.search = searchWrap.createEl("input", { placeholder: L("Search question, answer, tags, source, or deck…", "Tìm câu hỏi, đáp án, tag, nguồn hoặc deck…"), attr: { type: "search", "aria-label": L("Search all flashcards", "Tìm tất cả flashcard") } });
    this.search.value = this.query;
    this.search.oninput = () => { this.query = this.search.value; this.page = 0; this.renderResults(); };
    this.filter = toolbar.createEl("select", { attr: { "aria-label": L("Filter by card type", "Lọc theo loại thẻ") } });
    [["all", L("All types", "Tất cả loại")], ["basic", L("Q&A", "Hỏi đáp")], ["multiple-choice", L("Multiple choice", "Trắc nghiệm")], ["cloze", L("Cloze deletion", "Điền khuyết")]].forEach(([value, label]) => this.filter.createEl("option", { text: label, attr: { value } }));
    this.filter.value = this.type;
    this.filter.onchange = () => { this.type = this.filter.value; this.page = 0; this.renderResults(); };
    const add = toolbar.createEl("button", { cls: "pdl-manager-add", text: L("Create deck", "Tạo deck") });
    setIcon(add.createSpan(), "plus");
    add.onclick = () => new FlashcardStudioModal(this.app, this.plugin).open();
    this.results = root.createDiv({ cls: "pdl-manager-results" });
    this.renderResults();
  }

  getFiltered() {
    const q = this.query.trim().toLowerCase();
    return this.cards.filter(card => {
      if (this.type !== "all" && card.type !== this.type) return false;
      if (!q) return true;
      const cardTags = (card.tags || []).join(" ");
      return [card.question, card.answer, card.explanation, ...(card.choices || []), cardTags, card.sourcePath, card.deckTitle].join(" ").toLowerCase().includes(q);
    });
  }

  renderResults() {
    if (!this.results) return;
    this.results.empty();
    const filtered = this.getFiltered();
    const pages = Math.max(1, Math.ceil(filtered.length / this.pageSize));
    this.page = Math.min(this.page, pages - 1);
    const visible = filtered.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
    const meta = this.results.createDiv({ cls: "pdl-manager-meta" });
    meta.createSpan({ text: L(`${formatCount(filtered.length)} results`, `${formatCount(filtered.length)} kết quả`) });
    meta.createSpan({ text: L(`Page ${this.page + 1} of ${pages}`, `Trang ${this.page + 1}/${pages}`) });
    if (!visible.length) {
      const empty = this.results.createDiv({ cls: "pdl-manager-empty" });
      setIcon(empty.createSpan(), "search-x");
      empty.createEl("strong", { text: L("No matching flashcards", "Không có flashcard phù hợp") });
      empty.createEl("p", { text: L("Try a broader search or switch the card-type filter.", "Thử từ khóa rộng hơn hoặc đổi bộ lọc loại thẻ.") });
      return;
    }
    const table = this.results.createDiv({ cls: "pdl-manager-table", attr: { role: "table", "aria-label": L("Flashcards", "Flashcard") } });
    const header = table.createDiv({ cls: "pdl-manager-row is-header", attr: { role: "row" } });
    [L("Type", "Loại"), L("Question", "Câu hỏi"), L("Answer", "Đáp án"), L("Source", "Nguồn"), L("Actions", "Thao tác")].forEach(label => header.createSpan({ text: label, attr: { role: "columnheader" } }));
    visible.forEach(card => {
      const row = table.createDiv({ cls: "pdl-manager-row", attr: { role: "row" } });
      const badgeCls = card.type === "multiple-choice" ? "is-mcq" : card.type === "cloze" ? "is-cloze" : "is-basic";
      const badgeLabel = card.type === "multiple-choice" ? "MCQ" : card.type === "cloze" ? "CLOZE" : "Q&A";
      row.createSpan({ cls: `pdl-type-badge ${badgeCls}`, text: badgeLabel, attr: { role: "cell" } });

      const question = row.createDiv({ cls: "pdl-manager-cell pdl-manager-question", attr: { role: "cell", title: card.question } });
      const scheduleEntry = this.plugin.settings.schedule[card.id];
      question.createEl("strong", { text: card.question });
      if (scheduleEntry && (scheduleEntry.suspended || (scheduleEntry.buriedUntil && scheduleEntry.buriedUntil > Date.now()))) {
        const state = scheduleEntry.suspended ? L("SUSPENDED", "TẠM DỪNG") : L("BURIED", "ĐÃ ẨN");
        question.createSpan({ cls: `pdl-state-badge ${scheduleEntry.suspended ? "is-suspended" : "is-buried"}`, text: state });
      }
      if (card.tags && card.tags.length > 0) {
        const tagLine = question.createDiv({ cls: "pdl-manager-tags" });
        card.tags.forEach(t => tagLine.createSpan({ cls: "pdl-tag-badge", text: `#${t}` }));
      } else {
        question.createSpan({ text: card.explanation || L("No explanation", "Không có giải thích") });
      }

      const displayAnswer = card.type === "cloze" ? parseCloze(card.question).answers.join(", ") : card.answer;
      row.createDiv({ cls: "pdl-manager-cell pdl-manager-answer", text: displayAnswer, attr: { role: "cell", title: displayAnswer } });
      const source = row.createDiv({ cls: "pdl-manager-cell pdl-manager-source", attr: { role: "cell" } });
      source.createEl("strong", { text: card.sourceFile ? card.sourceFile.basename : L("Missing source", "Thiếu note nguồn") });
      source.createSpan({ text: card.deckTitle || card.file.basename });
      const actions = row.createDiv({ cls: "pdl-manager-actions", attr: { role: "cell" } });
      const isSuspended = scheduleEntry && scheduleEntry.suspended === true;
      const suspend = actions.createEl("button", { cls: isSuspended ? "is-active" : "", attr: { "aria-label": isSuspended ? L(`Unsuspend ${card.question}`, `Bỏ tạm dừng ${card.question}`) : L(`Suspend ${card.question}`, `Tạm dừng ${card.question}`), title: isSuspended ? L("Unsuspend", "Bỏ tạm dừng") : L("Suspend", "Tạm dừng") } });
      setIcon(suspend, isSuspended ? "play-circle" : "pause-circle");
      suspend.onclick = async () => { await this.plugin.setSuspended(card, !isSuspended); await this.reload(); };
      const edit = actions.createEl("button", { attr: { "aria-label": L(`Edit ${card.question}`, `Sửa ${card.question}`) } });
      setIcon(edit, "pencil");
      edit.onclick = () => new FlashcardEditModal(this.app, this.plugin, card, () => this.reload()).open();
      const remove = actions.createEl("button", { cls: "is-danger", attr: { "aria-label": L(`Delete ${card.question}`, `Xóa ${card.question}`) } });
      setIcon(remove, "trash-2");
      remove.onclick = () => new DeleteFlashcardModal(this.app, this.plugin, card, () => this.reload()).open();
    });
    const pager = this.results.createDiv({ cls: "pdl-manager-pager" });
    pager.createSpan({ text: L(`Showing ${this.page * this.pageSize + 1}–${this.page * this.pageSize + visible.length} of ${filtered.length}`, `Hiển thị ${this.page * this.pageSize + 1}–${this.page * this.pageSize + visible.length} / ${filtered.length}`) });
    const nav = pager.createDiv();
    const previous = nav.createEl("button", { text: L("Previous", "Trước") }); previous.disabled = this.page === 0; previous.onclick = () => { this.page--; this.renderResults(); };
    const next = nav.createEl("button", { text: L("Next", "Sau") }); next.disabled = this.page >= pages - 1; next.onclick = () => { this.page++; this.renderResults(); };
  }
}


export { FlashcardManagerModal };
