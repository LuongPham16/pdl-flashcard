/** Global card manager dialog. */
import { Modal, Notice, setIcon, MarkdownRenderer } from "obsidian";
import {
  parseCloze,
  formatRichInline,
  formatRichText,
  formatRichCodeAware,
  wireCodeToggles
} from "../formatting.js";
import { normalizeCardText, formatCount } from "../utils.js";
import { FlashcardStudioModal } from "./studio.js";
import { FlashcardEditModal, DeleteFlashcardModal } from "./edit.js";

class FlashcardManagerModal extends Modal {
  constructor(app, plugin) {
    super(app); this.plugin = plugin; this.cards = []; this.query = ""; this.type = "all"; this.page = 0; this.pageSize = 25;
  }

  async onOpen() {
    this.modalEl.addClass("pdl-manager-modal");
    this.contentEl.createDiv({ cls: "pdl-manager-loading", text: "Loading flashcards…" });
    this.cards = await this.plugin.getCards();
    this.render();
  }

  async reload() {
    this.cards = await this.plugin.getCards(); this.render();
  }

  render() {
    const root = this.contentEl; root.empty();
    const head = root.createDiv({ cls: "pdl-manager-head" });
    const copy = head.createDiv(); copy.createSpan({ text: "GLOBAL CARD INDEX" }); copy.createEl("h2", { text: "Flashcard Manager" }); copy.createEl("p", { text: "Find, edit, or remove any card without navigating through deck notes." });
    const total = head.createDiv({ cls: "pdl-manager-total" }); total.createEl("strong", { text: formatCount(this.cards.length, this.cards.length >= 10000), attr: { title: formatCount(this.cards.length) } }); total.createSpan({ text: "CARDS" });
    const toolbar = root.createDiv({ cls: "pdl-manager-toolbar" });
    const searchWrap = toolbar.createDiv({ cls: "pdl-manager-search" }); setIcon(searchWrap.createSpan(), "search");
    this.search = searchWrap.createEl("input", { placeholder: "Search question, answer, tags, source, or deck…", attr: { type: "search", "aria-label": "Search all flashcards" } });
    this.search.value = this.query; this.search.oninput = () => { this.query = this.search.value; this.page = 0; this.renderResults(); };
    this.filter = toolbar.createEl("select", { attr: { "aria-label": "Filter by card type" } });
    [["all","All types"],["basic","Q&A"],["multiple-choice","Multiple choice"],["cloze","Cloze deletion"]].forEach(([value,label]) => this.filter.createEl("option", { text: label, attr: { value } }));
    this.filter.value = this.type; this.filter.onchange = () => { this.type = this.filter.value; this.page = 0; this.renderResults(); };
    const add = toolbar.createEl("button", { cls: "pdl-manager-add", text: "Create deck" }); setIcon(add.createSpan(), "plus"); add.onclick = () => new FlashcardStudioModal(this.app, this.plugin).open();
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
    const pages = Math.max(1, Math.ceil(filtered.length / this.pageSize)); this.page = Math.min(this.page, pages - 1);
    const visible = filtered.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
    const meta = this.results.createDiv({ cls: "pdl-manager-meta" });
    meta.createSpan({ text: `${formatCount(filtered.length)} results` });
    meta.createSpan({ text: `Page ${this.page + 1} of ${pages}` });
    if (!visible.length) {
      const empty = this.results.createDiv({ cls: "pdl-manager-empty" }); setIcon(empty.createSpan(), "search-x"); empty.createEl("strong", { text: "No matching flashcards" }); empty.createEl("p", { text: "Try a broader search or switch the card-type filter." }); return;
    }
    const table = this.results.createDiv({ cls: "pdl-manager-table", attr: { role: "table", "aria-label": "Flashcards" } });
    const header = table.createDiv({ cls: "pdl-manager-row is-header", attr: { role: "row" } });
    ["Type","Question","Answer","Source","Actions"].forEach(label => header.createSpan({ text: label, attr: { role: "columnheader" } }));
    visible.forEach(card => {
      const row = table.createDiv({ cls: "pdl-manager-row", attr: { role: "row" } });
      const badgeCls = card.type === "multiple-choice" ? "is-mcq" : card.type === "cloze" ? "is-cloze" : "is-basic";
      const badgeLabel = card.type === "multiple-choice" ? "MCQ" : card.type === "cloze" ? "CLOZE" : "Q&A";
      row.createSpan({ cls: `pdl-type-badge ${badgeCls}`, text: badgeLabel, attr: { role: "cell" } });
      
      const question = row.createDiv({ cls: "pdl-manager-cell pdl-manager-question", attr: { role: "cell", title: card.question } });
      const scheduleEntry = this.plugin.settings.schedule[card.id];
      question.createEl("strong", { text: card.question });
      if (scheduleEntry && (scheduleEntry.suspended || (scheduleEntry.buriedUntil && scheduleEntry.buriedUntil > Date.now()))) {
        const state = scheduleEntry.suspended ? "SUSPENDED" : "BURIED";
        question.createSpan({ cls: `pdl-state-badge ${scheduleEntry.suspended ? "is-suspended" : "is-buried"}`, text: state });
      }
      if (card.tags && card.tags.length > 0) {
        const tagLine = question.createDiv({ cls: "pdl-manager-tags" });
        card.tags.forEach(t => tagLine.createSpan({ cls: "pdl-tag-badge", text: `#${t}` }));
      } else {
        question.createSpan({ text: card.explanation || "No explanation" });
      }

      const displayAnswer = card.type === "cloze" ? parseCloze(card.question).answers.join(", ") : card.answer;
      row.createDiv({ cls: "pdl-manager-cell pdl-manager-answer", text: displayAnswer, attr: { role: "cell", title: displayAnswer } });
      const source = row.createDiv({ cls: "pdl-manager-cell pdl-manager-source", attr: { role: "cell" } });
      source.createEl("strong", { text: card.sourceFile ? card.sourceFile.basename : "Missing source" }); source.createSpan({ text: card.deckTitle || card.file.basename });
      const actions = row.createDiv({ cls: "pdl-manager-actions", attr: { role: "cell" } });
      const isSuspended = scheduleEntry && scheduleEntry.suspended === true;
      const suspend = actions.createEl("button", { cls: isSuspended ? "is-active" : "", attr: { "aria-label": isSuspended ? `Unsuspend ${card.question}` : `Suspend ${card.question}`, title: isSuspended ? "Unsuspend" : "Suspend" } });
      setIcon(suspend, isSuspended ? "play-circle" : "pause-circle");
      suspend.onclick = async () => { await this.plugin.setSuspended(card, !isSuspended); await this.reload(); };
      const edit = actions.createEl("button", { attr: { "aria-label": `Edit ${card.question}` } }); setIcon(edit, "pencil"); edit.onclick = () => new FlashcardEditModal(this.app, this.plugin, card, () => this.reload()).open();
      const remove = actions.createEl("button", { cls: "is-danger", attr: { "aria-label": `Delete ${card.question}` } }); setIcon(remove, "trash-2"); remove.onclick = () => new DeleteFlashcardModal(this.app, this.plugin, card, () => this.reload()).open();
    });
    const pager = this.results.createDiv({ cls: "pdl-manager-pager" });
    pager.createSpan({ text: `Showing ${this.page * this.pageSize + 1}–${this.page * this.pageSize + visible.length} of ${filtered.length}` });
    const nav = pager.createDiv(); const previous = nav.createEl("button", { text: "Previous" }); previous.disabled = this.page === 0; previous.onclick = () => { this.page--; this.renderResults(); };
    const next = nav.createEl("button", { text: "Next" }); next.disabled = this.page >= pages - 1; next.onclick = () => { this.page++; this.renderResults(); };
  }
}


export { FlashcardManagerModal };
