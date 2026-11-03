/** Custom study session dialog with a composable filter builder. */
import { Modal, Notice } from "obsidian";
import { L } from "../i18n.js";

class FlashcardCustomStudyModal extends Modal {
  constructor(app, plugin, view) {
    super(app);
    this.plugin = plugin;
    this.view = view;
    this.decks = null;
    this.tag = "";
    this.type = "all";
    this.status = "any";
    this.rating = "any";
    this.limit = "all";
    this.order = "due";
  }

  async onOpen() {
    this.modalEl.addClass("pdl-custom-study-modal");
    this.cards = await this.plugin.getCards();
    this.render();
  }

  entry(card) {
    return this.plugin.settings.schedule?.[card.id];
  }

  filteredCards() {
    const now = Date.now();
    const aheadMatch = String(this.status).match(/^ahead(\d+)$/);
    const aheadDays = aheadMatch ? Number(aheadMatch[1]) : 0;
    return this.cards.filter(card => {
      if (this.decks) {
        if (!this.decks.size || !this.decks.has(card.file?.path)) return false;
      }
      if (this.tag && !(card.tags || []).includes(this.tag)) return false;
      if (this.type !== "all" && card.type !== this.type) return false;
      const entry = this.entry(card);

      if (this.status === "new" && entry && Number(entry.reps || 0) > 0) return false;
      if (this.status === "due" && (!entry || entry.due > now || !this.plugin.isCardAvailable(card, now))) return false;
      if (this.status === "learning" && entry?.learning !== true) return false;
      if (this.status === "suspended" && entry?.suspended !== true) return false;
      if (aheadDays && (!entry || entry.suspended || entry.due <= now || entry.due > now + aheadDays * 86400000)) return false;

      if (this.rating === "weak") {
        if (!entry || (Number(entry.lastGrade) > 2 && !(entry.lapses > 0))) return false;
      } else if (this.rating !== "any") {
        const grade = Number(this.rating);
        if (Number(entry?.lastGrade) !== grade) return false;
      }
      return true;
    });
  }

  orderedCards(cards) {
    const now = Date.now();
    const list = cards.slice();
    if (this.order === "random") {
      for (let index = list.length - 1; index > 0; index--) {
        const swap = Math.floor(Math.random() * (index + 1));
        [list[index], list[swap]] = [list[swap], list[index]];
      }
    } else if (this.order === "newest") {
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    } else {
      list.sort((a, b) => {
        const dueA = this.entry(a)?.due ?? 0;
        const dueB = this.entry(b)?.due ?? 0;
        return dueA - dueB;
      });
    }
    return list;
  }

  getPool() {
    const ordered = this.orderedCards(this.filteredCards());
    return this.limit === "all" ? ordered : ordered.slice(0, Number(this.limit));
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.createSpan({ cls: "pdl-edit-kicker", text: L("CUSTOM STUDY SESSION", "PHIÊN ÔN TÙY CHỌN") });
    root.createEl("h2", { text: L("Focus Learning & Cramming", "Học tập trung & luyện nhanh") });
    root.createEl("p", { cls: "pdl-edit-context", text: L("Build a session with filters. Nothing is written back to the normal schedule.", "Tạo phiên ôn bằng bộ lọc. Phiên này không ghi đè lịch ôn thường.") });

    const form = root.createDiv({ cls: "pdl-study-filters" });
    const addField = (label, options, value, onChange) => {
      const field = form.createEl("label", { cls: "pdl-editor-field" });
      field.createSpan({ text: label });
      const select = field.createEl("select", { cls: "pdl-edit-type" });
      options.forEach(([optionValue, optionLabel]) => select.createEl("option", { text: optionLabel, attr: { value: optionValue } }));
      select.value = value;
      select.onchange = () => onChange(select.value);
      return select;
    };
    const set = (key, value) => { this[key] = value; this.render(); };

    const decks = new Map();
    this.cards.forEach(card => decks.set(card.file.path, card.deckTitle || card.file.basename));
    const deckEntries = [...decks.entries()].sort((a, b) => a[1].localeCompare(b[1], "vi"));
    const allDeckPaths = deckEntries.map(([path]) => path);
    const deckField = form.createDiv({ cls: "pdl-editor-field pdl-study-deck-field" });
    const deckHead = deckField.createDiv({ cls: "pdl-study-deck-head" });
    deckHead.createSpan({ text: L("Deck", "Deck") });
    const deckSummary = deckHead.createSpan({ cls: "pdl-study-deck-summary" });
    const deckTrigger = deckField.createEl("button", { cls: "pdl-deck-trigger", attr: { type: "button", "aria-haspopup": "listbox" } });
    const deckTriggerText = deckTrigger.createSpan({ cls: "pdl-deck-trigger-text" });
    deckTrigger.createSpan({ cls: "pdl-deck-trigger-chevron", text: "▾" });
    const deckPanel = deckField.createDiv({ cls: "pdl-deck-panel is-hidden" });
    const deckSearch = deckPanel.createEl("input", { cls: "pdl-deck-search", attr: { type: "search", placeholder: L("Search decks…", "Tìm deck…") } });
    const deckList = deckPanel.createDiv({ cls: "pdl-deck-list" });
    const deckActions = deckPanel.createDiv({ cls: "pdl-deck-actions" });
    const selectAll = deckActions.createEl("button", { cls: "pdl-deck-link", text: L("Select all", "Chọn tất cả"), attr: { type: "button" } });
    const clearAll = deckActions.createEl("button", { cls: "pdl-deck-link", text: L("Clear", "Bỏ chọn"), attr: { type: "button" } });
    const deckDone = deckActions.createEl("button", { cls: "mod-cta pdl-deck-done", text: L("Done", "Xong"), attr: { type: "button" } });
    let deckBoxes = [];
    const syncDeckUi = () => {
      const count = this.decks ? this.decks.size : allDeckPaths.length;
      const all = this.decks === null;
      deckSummary.setText(all ? L("All decks", "Tất cả deck") : count ? L(`${count} decks selected`, `Đã chọn ${count} deck`) : L("No decks", "Chưa chọn deck"));
      deckTriggerText.setText(all ? L("All decks", "Tất cả deck") : count ? L(`${count} decks selected`, `Đã chọn ${count} deck`) : L("No decks", "Chưa chọn deck"));
      deckBoxes.forEach(({ path, input }) => { input.checked = all || Boolean(this.decks?.has(path)); });
    };
    const renderDeckList = () => {
      const query = deckSearch.value.trim().toLowerCase();
      const filtered = query ? deckEntries.filter(([, name]) => name.toLowerCase().includes(query)) : deckEntries;
      deckList.empty();
      deckBoxes = [];
      const allRow = deckList.createEl("label", { cls: "pdl-study-check is-all" });
      const allBox = allRow.createEl("input", { attr: { type: "checkbox" } });
      allBox.checked = this.decks === null;
      allBox.onchange = () => { this.decks = allBox.checked ? null : new Set(); syncDeckUi(); renderDeckList(); };
      allRow.createSpan({ text: L("All decks", "Tất cả deck") });
      filtered.slice(0, 200).forEach(([path, name]) => {
        const row = deckList.createEl("label", { cls: "pdl-study-check" });
        const box = row.createEl("input", { attr: { type: "checkbox" } });
        box.checked = this.decks === null || this.decks.has(path);
        box.onchange = () => {
          if (this.decks === null) this.decks = new Set(allDeckPaths);
          if (box.checked) this.decks.add(path); else this.decks.delete(path);
          if (this.decks.size === allDeckPaths.length) this.decks = null;
          syncDeckUi();
          renderDeckList();
        };
        row.createSpan({ text: name });
        deckBoxes.push({ path, input: box });
      });
      if (filtered.length > 200) {
        deckList.createDiv({ cls: "pdl-deck-limit", text: L(`Showing 200 of ${filtered.length}. Type to narrow the list.`, `Hiển thị 200 / ${filtered.length}. Gõ để thu hẹp.`) });
      }
      if (!filtered.length) deckList.createDiv({ cls: "pdl-deck-empty", text: L("No matching decks.", "Không có deck phù hợp.") });
    };
    deckTrigger.onclick = () => {
      const open = deckPanel.classList.contains("is-hidden");
      deckPanel.toggleClass("is-hidden", !open);
      deckTrigger.toggleClass("is-open", open);
      if (open) { renderDeckList(); deckSearch.focus(); }
    };
    deckSearch.oninput = () => renderDeckList();
    selectAll.onclick = () => { this.decks = null; syncDeckUi(); renderDeckList(); };
    clearAll.onclick = () => { this.decks = new Set(); syncDeckUi(); renderDeckList(); };
    deckDone.onclick = () => { deckPanel.addClass("is-hidden"); deckTrigger.removeClass("is-open"); };
    syncDeckUi();

    const tags = new Set();
    this.cards.forEach(card => (card.tags || []).forEach(tag => tags.add(tag)));
    addField(L("Tag", "Tag"), [["", L("All tags", "Tất cả tag")], ...[...tags].sort().map(tag => [tag, `#${tag}`])],
      this.tag, value => set("tag", value));

    addField(L("Type", "Loại"), [
      ["all", L("All types", "Tất cả loại")],
      ["basic", L("Q&A", "Hỏi đáp")],
      ["multiple-choice", L("Multiple choice", "Trắc nghiệm")],
      ["cloze", L("Cloze", "Điền khuyết")]
    ], this.type, value => set("type", value));

    addField(L("Status", "Trạng thái"), [
      ["any", L("Any", "Bất kỳ")],
      ["new", L("New", "Mới")],
      ["due", L("Due now", "Đến hạn")],
      ["learning", L("Learning", "Đang học")],
      ["suspended", L("Suspended", "Tạm dừng")],
      ["ahead7", L("Ahead 7 days", "Trước 7 ngày")],
      ["ahead14", L("Ahead 14 days", "Trước 14 ngày")],
      ["ahead30", L("Ahead 30 days", "Trước 30 ngày")]
    ], this.status, value => set("status", value));

    addField(L("Rating", "Đánh giá"), [
      ["any", L("Any", "Bất kỳ")],
      ["1", L("Again", "Lại")],
      ["2", L("Hard", "Khó")],
      ["3", L("Good", "Tốt")],
      ["4", L("Easy", "Dễ")],
      ["weak", L("Weak (Again/Hard)", "Yếu (Lại/Khó)")]
    ], this.rating, value => set("rating", value));

    addField(L("Limit", "Giới hạn"), [
      ["all", L("All matching cards", "Tất cả thẻ khớp")],
      ["10", "10"],
      ["20", "20"],
      ["50", "50"]
    ], this.limit, value => set("limit", value));

    addField(L("Order", "Thứ tự"), [
      ["due", L("Due date", "Ngày đến hạn")],
      ["random", L("Random", "Ngẫu nhiên")],
      ["newest", L("Newest first", "Mới nhất trước")]
    ], this.order, value => set("order", value));

    const matchCount = this.filteredCards().length;
    const selectedCount = this.getPool().length;
    const preview = root.createDiv({ cls: "pdl-study-preview" });
    preview.createSpan({ cls: "pdl-study-preview-count", text: `${selectedCount}` });
    preview.createSpan({ text: L(`cards selected${matchCount !== selectedCount ? ` · ${matchCount} match` : ""}`, `thẻ được chọn${matchCount !== selectedCount ? ` · ${matchCount} khớp` : ""}`) });

    const footer = root.createDiv({ cls: "pdl-edit-footer" });
    const cancel = footer.createEl("button", { text: L("Cancel", "Hủy") });
    cancel.onclick = () => this.close();
    const start = footer.createEl("button", { cls: "mod-cta", text: L("Start Custom Session", "Bắt đầu phiên tùy chọn") });
    start.disabled = selectedCount === 0;
    start.onclick = () => {
      const pool = this.getPool();
      if (!pool.length) {
        new Notice(L("No cards match your selected criteria.", "Không có thẻ nào khớp tiêu chí đã chọn."));
        return;
      }
      this.close();
      this.view.startSession(pool, true, pool.length);
    };
  }
}

export { FlashcardCustomStudyModal };
