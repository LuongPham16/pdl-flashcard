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
import { BulkTagModal, MoveCardsModal, BulkDeleteModal, CreateDeckModal, ArchiveDecksModal } from "./bulk.js";

class FlashcardManagerModal extends Modal {
  constructor(app, plugin) {
    super(app); this.plugin = plugin; this.cards = []; this.query = ""; this.type = "all"; this.deck = "all"; this.tag = "all"; this.page = 0; this.pageSize = 25; this.selected = new Set(); this.duplicateOnly = false;
  }

  async onOpen() {
    this.modalEl.addClass("pdl-manager-modal");
    this.contentEl.createDiv({ cls: "pdl-manager-loading", text: L("Loading flashcards…", "Đang tải flashcard…") });
    this.cards = await this.plugin.getCards();
    this.render();
  }

  async reload() {
    this.cards = await this.plugin.getCards();
    const ids = new Set(this.cards.map(card => card.id));
    this.selected.forEach(id => { if (!ids.has(id)) this.selected.delete(id); });
    this.render();
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

    const decks = new Map();
    const tags = new Set();
    this.cards.forEach(card => {
      if (card.file?.path) decks.set(card.file.path, card.deckTitle || card.file.basename || card.file.path);
      (card.tags || []).forEach(tag => tags.add(tag));
    });
    if (!decks.has(this.deck)) this.deck = "all";
    if (!tags.has(this.tag)) this.tag = "all";

    this.deckFilter = toolbar.createEl("select", { cls: "pdl-manager-deck", attr: { "aria-label": L("Filter by deck", "Lọc theo deck") } });
    this.deckFilter.createEl("option", { text: L("All decks", "Tất cả deck"), attr: { value: "all" } });
    [...decks.entries()].sort((a, b) => a[1].localeCompare(b[1], "vi"))
      .forEach(([path, title]) => this.deckFilter.createEl("option", { text: title, attr: { value: path } }));
    this.deckFilter.value = this.deck;
    this.deckFilter.onchange = () => { this.deck = this.deckFilter.value; this.page = 0; this.renderResults(); };

    this.tagFilter = toolbar.createEl("select", { cls: "pdl-manager-tag", attr: { "aria-label": L("Filter by tag", "Lọc theo tag") } });
    this.tagFilter.createEl("option", { text: L("All tags", "Tất cả tag"), attr: { value: "all" } });
    [...tags].sort((a, b) => a.localeCompare(b, "vi"))
      .forEach(tag => this.tagFilter.createEl("option", { text: `#${tag}`, attr: { value: tag } }));
    this.tagFilter.value = this.tag;
    this.tagFilter.onchange = () => { this.tag = this.tagFilter.value; this.page = 0; this.renderResults(); };

    const add = toolbar.createEl("button", { cls: "pdl-manager-add", text: L("Create deck", "Tạo deck") });
    setIcon(add.createSpan(), "plus");
    add.onclick = () => new FlashcardStudioModal(this.app, this.plugin).open();

    const bulk = root.createDiv({ cls: "pdl-manager-bulk" });
    this.bulkCount = bulk.createSpan({ cls: "pdl-manager-bulk-count" });
    const bulkAction = (label, icon, onClick, cls = "") => {
      const button = bulk.createEl("button", { cls: `pdl-manager-bulk-button ${cls}`.trim(), attr: { title: label, "aria-label": label } });
      setIcon(button.createSpan(), icon);
      button.createSpan({ text: label });
      button.onclick = onClick;
      return button;
    };
    bulkAction(L("Bulk tags", "Tag hàng loạt"), "tags", () => {
      if (this.selected.size) new BulkTagModal(this.app, this.plugin, this.selectedCards(), () => this.reload()).open();
    });
    bulkAction(L("Bulk move", "Chuyển hàng loạt"), "folder-input", () => {
      if (this.selected.size) new MoveCardsModal(this.app, this.plugin, this.selectedCards(), () => this.reload()).open();
    });
    bulkAction(L("Bulk suspend", "Tạm dừng hàng loạt"), "pause-circle", async () => {
      if (!this.selected.size) return;
      await this.plugin.bulkSetSuspended(this.selectedCards(), true);
      await this.reload();
    });
    bulkAction(L("Bulk unsuspend", "Bỏ tạm dừng hàng loạt"), "play-circle", async () => {
      if (!this.selected.size) return;
      await this.plugin.bulkSetSuspended(this.selectedCards(), false);
      await this.reload();
    });
    bulkAction(L("Bulk delete", "Xóa hàng loạt"), "trash-2", () => {
      if (this.selected.size) new BulkDeleteModal(this.app, this.plugin, this.selectedCards(), () => this.reload()).open();
    }, "is-danger");
    const duplicates = bulkAction(L("Bulk duplicates", "Trùng lặp hàng loạt"), "copy", () => {
      this.duplicateOnly = !this.duplicateOnly;
      this.page = 0;
      this.renderResults();
    });
    duplicates.addClass("is-filter");
    const archived = bulk.createEl("button", { cls: "pdl-manager-bulk-button is-filter", text: L("Archived decks", "Deck lưu trữ") });
    archived.onclick = () => new ArchiveDecksModal(this.app, this.plugin, () => this.reload()).open();
    const newDeck = bulk.createEl("button", { cls: "pdl-manager-bulk-button is-secondary", text: L("New empty deck", "Deck rỗng") });
    newDeck.onclick = () => new CreateDeckModal(this.app, this.plugin, () => this.reload()).open();
    this.bulkBar = bulk;
    this.results = root.createDiv({ cls: "pdl-manager-results" });
    this.renderResults();
  }

  selectedCards() {
    return this.cards.filter(card => this.selected.has(card.id));
  }

  updateBulkBar() {
    if (!this.bulkCount) return;
    this.bulkCount.setText(L(`${this.selected.size} selected`, `Đã chọn ${this.selected.size}`));
    this.bulkBar.querySelectorAll("button").forEach(button => {
      if (!button.classList.contains("is-secondary") && !button.classList.contains("is-filter")) button.disabled = this.selected.size === 0;
    });
  }

  getFiltered() {
    const q = this.query.trim().toLowerCase();
    const duplicateIds = new Set();
    if (this.duplicateOnly) {
      const groups = new Map();
      this.cards.forEach(card => {
        const key = card.question.trim().toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(card.id);
      });
      groups.forEach(ids => { if (ids.length > 1) ids.forEach(id => duplicateIds.add(id)); });
    }
    return this.cards.filter(card => {
      if (this.type !== "all" && card.type !== this.type) return false;
      if (this.deck !== "all" && card.file?.path !== this.deck) return false;
      if (this.tag !== "all" && !(card.tags || []).includes(this.tag)) return false;
      if (this.duplicateOnly && !duplicateIds.has(card.id)) return false;
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
      this.updateBulkBar();
      return;
    }
    const table = this.results.createDiv({ cls: "pdl-manager-table", attr: { role: "table", "aria-label": L("Flashcards", "Flashcard") } });
    const header = table.createDiv({ cls: "pdl-manager-row is-header", attr: { role: "row" } });
    const typeHeader = header.createDiv({ cls: "pdl-manager-type-head", attr: { role: "columnheader" } });
    const selectPage = typeHeader.createEl("input", { cls: "pdl-manager-select", attr: { type: "checkbox", "aria-label": L("Select page", "Chọn trang") } });
    typeHeader.createSpan({ text: L("Type", "Loại") });
    [L("Question", "Câu hỏi"), L("Answer", "Đáp án"), L("Source", "Nguồn"), L("Actions", "Thao tác")].forEach(label => header.createSpan({ text: label, attr: { role: "columnheader" } }));
    selectPage.checked = visible.every(card => this.selected.has(card.id));
    selectPage.onchange = () => {
      visible.forEach(card => { if (selectPage.checked) this.selected.add(card.id); else this.selected.delete(card.id); });
      this.renderResults();
    };
    visible.forEach(card => {
      const row = table.createDiv({ cls: "pdl-manager-row", attr: { role: "row" } });
      const typeCell = row.createDiv({ cls: "pdl-manager-type-cell", attr: { role: "cell" } });
      const select = typeCell.createEl("input", { cls: "pdl-manager-select", attr: { type: "checkbox", "aria-label": L("Select card", "Chọn thẻ") } });
      select.checked = this.selected.has(card.id);
      select.onchange = () => {
        if (select.checked) this.selected.add(card.id); else this.selected.delete(card.id);
        this.updateBulkBar();
      };
      const badgeCls = card.type === "multiple-choice" ? "is-mcq" : card.type === "cloze" ? "is-cloze" : "is-basic";
      const badgeLabel = card.type === "multiple-choice" ? "MCQ" : card.type === "cloze" ? "CLOZE" : "Q&A";
      typeCell.createSpan({ cls: `pdl-type-badge ${badgeCls}`, text: badgeLabel });

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
      const suspend = actions.createEl("button", { cls: isSuspended ? "is-active" : "", attr: { "aria-label": isSuspended ? L("Unsuspend", "Bỏ tạm dừng") : L("Suspend", "Tạm dừng"), title: isSuspended ? L("Unsuspend", "Bỏ tạm dừng") : L("Suspend", "Tạm dừng") } });
      setIcon(suspend, isSuspended ? "play-circle" : "pause-circle");
      suspend.onclick = async () => { await this.plugin.setSuspended(card, !isSuspended); await this.reload(); };
      const edit = actions.createEl("button", { attr: { "aria-label": L("Edit", "Sửa"), title: L("Edit", "Sửa") } });
      setIcon(edit, "pencil");
      edit.onclick = () => new FlashcardEditModal(this.app, this.plugin, card, () => this.reload()).open();
      const remove = actions.createEl("button", { cls: "is-danger", attr: { "aria-label": L("Delete", "Xóa"), title: L("Delete", "Xóa") } });
      setIcon(remove, "trash-2");
      remove.onclick = () => new DeleteFlashcardModal(this.app, this.plugin, card, () => this.reload()).open();
    });
    const pager = this.results.createDiv({ cls: "pdl-manager-pager" });
    pager.createSpan({ text: L(`Showing ${this.page * this.pageSize + 1}–${this.page * this.pageSize + visible.length} of ${filtered.length}`, `Hiển thị ${this.page * this.pageSize + 1}–${this.page * this.pageSize + visible.length} / ${filtered.length}`) });
    const nav = pager.createDiv();
    const previous = nav.createEl("button", { text: L("Previous", "Trước") }); previous.disabled = this.page === 0; previous.onclick = () => { this.page--; this.renderResults(); };
    const next = nav.createEl("button", { text: L("Next", "Sau") }); next.disabled = this.page >= pages - 1; next.onclick = () => { this.page++; this.renderResults(); };
    this.updateBulkBar();
  }
}


export { FlashcardManagerModal };
