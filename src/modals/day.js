/** Cards reviewed on one heatmap day. */
import { Modal, setIcon } from "obsidian";
import { L, locale } from "../i18n.js";
import { dateKey } from "../utils.js";
import { parseCloze } from "../formatting.js";

const GRADE_NAMES = {
  1: L("Again", "Lại"),
  2: L("Hard", "Khó"),
  3: L("Good", "Tốt"),
  4: L("Easy", "Dễ")
};

class FlashcardDayModal extends Modal {
  constructor(app, plugin, dayKey, cards) {
    super(app);
    this.plugin = plugin;
    this.dayKey = dayKey;
    this.cards = cards || [];
    this.query = "";
    this.deck = "all";
    this.grade = "all";
  }

  onOpen() {
    this.modalEl.addClass("pdl-day-modal");
    const validIds = new Set(this.cards.map(card => card.id));
    const reviews = (this.plugin.settings.reviews || [])
      .filter(review => review && validIds.has(review.cardId) && dateKey(review.at) === this.dayKey);
    const byCard = new Map();
    reviews.forEach(review => {
      if (!byCard.has(review.cardId)) byCard.set(review.cardId, []);
      byCard.get(review.cardId).push(review);
    });
    this.rows = [...byCard.entries()]
      .map(([cardId, entries]) => ({
        card: this.cards.find(card => card.id === cardId),
        entries: entries.slice().sort((a, b) => b.at - a.at)
      }))
      .filter(item => item.card)
      .sort((a, b) => b.entries[0].at - a.entries[0].at);
    this.date = new Date(`${this.dayKey}T00:00:00`);
    this.render(reviews);
  }

  render(reviews) {
    const root = this.contentEl;
    root.empty();
    const dateLabel = new Intl.DateTimeFormat(locale(), {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(this.date);
    const head = root.createDiv({ cls: "pdl-day-head" });
    head.createSpan({ cls: "pdl-edit-kicker", text: L("REVIEW HISTORY", "LỊCH SỬ ÔN TẬP") });
    head.createEl("h2", { text: dateLabel });
    head.createEl("p", { text: L("Everything you reviewed on this day, grouped by card.", "Toàn bộ thẻ bạn đã ôn trong ngày, gom theo từng thẻ.") });

    const decks = new Set(this.rows.map(row => row.card.file?.path || row.card.deckTitle));
    const times = this.rows.flatMap(row => row.entries.map(entry => entry.at));
    const first = times.length ? Math.min(...times) : 0;
    const last = times.length ? Math.max(...times) : 0;
    const timeFormat = new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit" });
    const stats = root.createDiv({ cls: "pdl-day-stats" });
    [
      [L("REVIEWS", "LƯỢT ÔN"), String(reviews.length)],
      [L("CARDS", "THẺ"), String(this.rows.length)],
      [L("DECKS", "DECK"), String(decks.size)],
      [L("TIME", "THỜI GIAN"), times.length ? `${timeFormat.format(new Date(first))}–${timeFormat.format(new Date(last))}` : "—"]
    ].forEach(([label, value]) => {
      const stat = stats.createDiv({ cls: "pdl-day-stat" });
      stat.createEl("strong", { text: value });
      stat.createSpan({ text: label });
    });

    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    reviews.forEach(review => { if (counts[review.grade] != null) counts[review.grade]++; });
    const grades = root.createDiv({ cls: "pdl-day-grades" });
    grades.createSpan({ cls: "pdl-day-grades-label", text: L("RATINGS", "ĐÁNH GIÁ") });
    [1, 2, 3, 4].forEach(grade => grades.createSpan({
      cls: `pdl-day-grade is-grade-${grade}`,
      text: `${GRADE_NAMES[grade]} ${counts[grade]}`
    }));

    if (!this.rows.length) {
      root.createDiv({ cls: "pdl-day-empty", text: L("No cards reviewed on this day.", "Ngày này chưa ôn thẻ nào.") });
      return;
    }

    const toolbar = root.createDiv({ cls: "pdl-day-toolbar" });
    const searchWrap = toolbar.createDiv({ cls: "pdl-day-search" });
    setIcon(searchWrap.createSpan(), "search");
    const search = searchWrap.createEl("input", {
      attr: {
        type: "search",
        placeholder: L("Search question, answer, deck or tag…", "Tìm câu hỏi, đáp án, deck hoặc tag…"),
        "aria-label": L("Search reviewed cards", "Tìm thẻ đã ôn")
      }
    });
    search.oninput = () => { this.query = search.value; this.renderList(); };

    const deckSelect = toolbar.createEl("select", { cls: "pdl-day-deck", attr: { "aria-label": L("Filter by deck", "Lọc theo deck") } });
    deckSelect.createEl("option", { text: L("All decks", "Tất cả deck"), attr: { value: "all" } });
    [...decks].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "vi"))
      .forEach(deck => deckSelect.createEl("option", { text: String(deck), attr: { value: String(deck) } }));
    deckSelect.onchange = () => { this.deck = deckSelect.value; this.renderList(); };

    const gradeSelect = toolbar.createEl("select", { cls: "pdl-day-rating", attr: { "aria-label": L("Filter by rating", "Lọc theo đánh giá") } });
    gradeSelect.createEl("option", { text: L("All ratings", "Tất cả đánh giá"), attr: { value: "all" } });
    [1, 2, 3, 4].forEach(grade => gradeSelect.createEl("option", { text: GRADE_NAMES[grade], attr: { value: String(grade) } }));
    gradeSelect.onchange = () => { this.grade = gradeSelect.value; this.renderList(); };

    this.listEl = root.createDiv({ cls: "pdl-day-list" });
    this.renderList();
  }

  renderList() {
    if (!this.listEl) return;
    this.listEl.empty();
    const query = this.query.trim().toLowerCase();
    const filtered = this.rows.filter(({ card, entries }) => {
      if (this.deck !== "all" && String(card.file?.path || card.deckTitle) !== this.deck) return false;
      if (this.grade !== "all" && !entries.some(entry => String(entry.grade) === this.grade)) return false;
      if (!query) return true;
      return [card.question, card.answer, card.deckTitle, ...(card.tags || [])]
        .join(" ").toLowerCase().includes(query);
    });
    if (!filtered.length) {
      this.listEl.createDiv({ cls: "pdl-day-empty", text: L("No matching cards.", "Không có thẻ phù hợp.") });
      return;
    }

    const timeFormat = new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit" });
    filtered.forEach(({ card, entries }) => {
      const row = this.listEl.createDiv({ cls: "pdl-day-row", attr: { role: "button", tabindex: "0" } });
      const openDetail = () => new FlashcardDetailModal(this.app, this.plugin, card).open();
      row.onclick = openDetail;
      row.onkeydown = event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetail();
        }
      };
      const type = card.type === "multiple-choice" ? "mcq" : card.type === "cloze" ? "cloze" : "basic";
      const badge = row.createSpan({
        cls: `pdl-day-type is-${type}`,
        text: type === "mcq" ? "MCQ" : type === "cloze" ? "CLOZE" : "Q&A"
      });
      badge.setAttr("title", card.type || "basic");

      const copy = row.createDiv({ cls: "pdl-day-copy" });
      const question = card.type === "cloze" ? parseCloze(card.question).hiddenPrompt : card.question;
      copy.createEl("strong", { text: question });
      if (card.answer) copy.createEl("p", { text: card.answer });
      if (card.tags?.length) {
        const tags = copy.createDiv({ cls: "pdl-day-tags" });
        card.tags.slice(0, 6).forEach(tag => tags.createSpan({ text: `#${tag}` }));
      }

      const meta = row.createDiv({ cls: "pdl-day-meta" });
      meta.createSpan({ cls: "pdl-day-deck-name", text: card.deckTitle || card.file?.basename || "" });
      meta.createSpan({ cls: "pdl-day-times", text: entries.map(entry => timeFormat.format(new Date(entry.at))).join(" · ") });
      const rate = meta.createDiv({ cls: "pdl-day-rated" });
      entries.forEach(entry => rate.createSpan({
        cls: `pdl-day-grade is-grade-${entry.grade}`,
        text: GRADE_NAMES[entry.grade] || String(entry.grade)
      }));
    });
  }
}

class FlashcardDetailModal extends Modal {
  constructor(app, plugin, card) {
    super(app);
    this.plugin = plugin;
    this.card = card;
  }

  onOpen() {
    this.modalEl.addClass("pdl-card-detail-modal");
    const root = this.contentEl;
    const card = this.card;
    const type = card.type === "multiple-choice" ? "mcq" : card.type === "cloze" ? "cloze" : "basic";
    const head = root.createDiv({ cls: "pdl-card-detail-head" });
    const title = head.createDiv();
    title.createSpan({ cls: "pdl-edit-kicker", text: L("CARD DETAILS", "CHI TIẾT THẺ") });
    title.createEl("h2", { text: L("Card details", "Chi tiết thẻ") });
    head.createSpan({
      cls: `pdl-day-type is-${type}`,
      text: type === "mcq" ? "MCQ" : type === "cloze" ? "CLOZE" : "Q&A"
    });

    const questionBlock = root.createDiv({ cls: "pdl-card-detail-block" });
    questionBlock.createSpan({ cls: "pdl-card-detail-label", text: L("QUESTION", "CÂU HỎI") });
    questionBlock.createEl("p", {
      cls: "pdl-card-detail-question",
      text: card.type === "cloze" ? parseCloze(card.question).hiddenPrompt : card.question
    });
    if (card.type === "multiple-choice" && Array.isArray(card.choices) && card.choices.length) {
      const choices = questionBlock.createDiv({ cls: "pdl-card-detail-choices" });
      card.choices.forEach((choice, index) => {
        const isCorrect = choice === card.answer;
        const item = choices.createDiv({ cls: `pdl-card-detail-choice${isCorrect ? " is-correct" : ""}` });
        item.createSpan({ text: String.fromCharCode(65 + index) });
        item.createEl("strong", { text: choice });
      });
    }

    const answerBlock = root.createDiv({ cls: "pdl-card-detail-block" });
    answerBlock.createSpan({ cls: "pdl-card-detail-label", text: L("ANSWER", "ĐÁP ÁN") });
    answerBlock.createEl("p", { cls: "pdl-card-detail-answer", text: card.answer || "—" });

    if (card.explanation) {
      const explanation = root.createDiv({ cls: "pdl-card-detail-block" });
      explanation.createSpan({ cls: "pdl-card-detail-label", text: L("EXPLANATION", "GIẢI THÍCH") });
      explanation.createEl("p", { cls: "pdl-card-detail-explanation", text: card.explanation });
    }

    if (card.tags?.length) {
      const tags = root.createDiv({ cls: "pdl-card-detail-tags" });
      card.tags.forEach(tag => tags.createSpan({ text: `#${tag}` }));
    }

    const reviews = (this.plugin.settings.reviews || []).filter(review => review.cardId === card.id);
    const schedule = this.plugin.settings.schedule?.[card.id];
    const meta = root.createDiv({ cls: "pdl-card-detail-meta" });
    const addMeta = (label, value) => {
      const item = meta.createDiv();
      item.createSpan({ text: label });
      item.createEl("strong", { text: value });
    };
    addMeta(L("Deck", "Deck"), card.deckTitle || card.file?.basename || "—");
    addMeta(L("Source", "Nguồn"), card.sourcePath || card.file?.path || "—");
    addMeta(L("Reviews", "Lượt ôn"), String(reviews.length));
    addMeta(L("Last reviewed", "Ôn gần nhất"), schedule?.lastReviewed
      ? new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(schedule.lastReviewed))
      : "—");
    addMeta(L("Due", "Đến hạn"), schedule?.due
      ? new Intl.DateTimeFormat(locale(), { dateStyle: "medium" }).format(new Date(schedule.due))
      : "—");
    addMeta(L("Interval", "Khoảng cách"), schedule?.interval ? L(`${schedule.interval} days`, `${schedule.interval} ngày`) : "—");

    const footer = root.createDiv({ cls: "pdl-card-detail-footer" });
    footer.createSpan({ cls: "pdl-card-detail-viewonly", text: L("View only — no editing here.", "Chỉ xem — không chỉnh sửa ở đây.") });
    const close = footer.createEl("button", { cls: "mod-cta", text: L("Close", "Đóng") });
    close.onclick = () => this.close();
  }
}

export { FlashcardDayModal, FlashcardDetailModal };
