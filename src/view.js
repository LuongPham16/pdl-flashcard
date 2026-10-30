/** The review dashboard: library, review session, heatmap and summary. */
import { ItemView, Notice, setIcon, MarkdownRenderer } from "obsidian";
import { VIEW_TYPE } from "./constants.js";
import { dateKey, formatCount, nfcText, truncateLabel } from "./utils.js";
import { L, locale } from "./i18n.js";
import {
  formatRichInline,
  formatRichText,
  formatRichCodeAware,
  parseCloze,
  wireCodeToggles,
  speakText
} from "./formatting.js";
import { FlashcardCustomStudyModal } from "./modals/study.js";
import { FlashcardExportImportModal } from "./modals/import-export.js";
import { FlashcardStatisticsModal } from "./modals/statistics.js";
import { FlashcardManagerModal } from "./modals/manager.js";
import { FlashcardStudioModal } from "./modals/studio.js";

/**
 * Georgia has no Vietnamese glyphs on Windows. Set the reading font inline too so
 * the card is correct even when Obsidian still has an older styles.css in memory.
 */
const READING_FONT = '"Times New Roman", Georgia, serif';

function applyReadingFont(container) {
  if (!container || typeof container.querySelectorAll !== "function") return;
  const apply = element => {
    if (!element || !element.style) return;
    element.style.fontFamily = READING_FONT;
    element.style.fontKerning = "none";
  };
  apply(container);
  container.querySelectorAll("*").forEach(element => {
    if (/^(CODE|PRE|KBD)$/.test(element.tagName)) return;
    if (element.closest?.(".pdl-code, .pdl-inline-code, .katex")) return;
    apply(element);
  });
}

export class PDLFlashcardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.cards = [];
    this.filtered = [];
    this.session = [];
    this.index = 0;
    this.revealed = false;
    this.grades = [];
    this.selectedChoice = null;
    this.showQuestionMode = false;
    this.deckPage = 0;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "PDL Flashcard"; }
  getIcon() { return "brain-circuit"; }

  /**
   * Renders card text through Obsidian's own Markdown renderer so embeds, images,
   * LaTeX and wikilinks all work exactly as they do in a note. Falls back to the
   * plugin's lightweight formatter when no MarkdownRenderer is available.
   *
   * `inline` keeps a single run of text (questions, cloze statements); `shortAsCode`
   * keeps the plugin's "a bare command becomes code" behaviour for answers.
   */
  async renderCardText(container, raw, options = {}) {
    const source = nfcText(raw);
    if (!source.trim()) { container.empty(); return; }
    let markdown;
    if (options.cloze) {
      // Accept either the raw card statement ({{c1::term}}) or an already-parsed
      // cloze view ([...] / <mark>), then swap the markers for placeholders so the
      // Markdown pass cannot mangle them.
      let clozeText = source;
      if (/\{\{|==|\[\.\.\.\]|<mark/.test(source)) {
        clozeText = options.revealed ? parseCloze(source).fullAnswer : parseCloze(source).hiddenPrompt;
      }
      markdown = clozeText
        // Cloze markers cannot survive a Markdown pass, so swap them for ASCII
        // placeholders (word characters only, so the token regex stays simple).
        .replace(/<mark class="pdl-cloze-target">([\s\S]*?)<\/mark>/g, (_, word) => `PDLCLOZE${String(word).replace(/[^\p{L}\p{N}_]/gu, "")}PDLEND`)
        .replace(/\[\.\.\.\]/g, "PDLBLANK");
    } else if (options.inline) {
      // Collapse newlines so the text stays one visual run inside a heading.
      markdown = source.replace(/\r\n?/g, "\n").split("\n").filter(Boolean).join(" ").trim();
    } else if (options.shortAsCode) {
      const html = formatRichCodeAware(source);
      container.innerHTML = html;
      container.addClass("pdl-rich");
      container.addClass("markdown-rendered");
      wireCodeToggles(container);
      applyReadingFont(container);
      return;
    } else {
      markdown = source;
    }

    try {
      if (typeof MarkdownRenderer?.render !== "function") throw new Error("no renderer");
      container.empty();
      container.addClass("pdl-rich");
      container.addClass("markdown-rendered");
      await MarkdownRenderer.render(this.app, markdown, container, options.sourcePath || "", this);
      if (options.inline) container.addClass("is-inline-rich");
      if (options.cloze) this.restoreClozeMarkup(container);
      wireCodeToggles(container);
      applyReadingFont(container);
    } catch (_) {
      const html = options.inline || options.cloze ? formatRichInline(source) : formatRichText(source, options);
      if (!html) return;
      container.innerHTML = html;
      container.addClass("pdl-rich");
      if (!options.inline) container.addClass("markdown-rendered");
      wireCodeToggles(container);
      applyReadingFont(container);
    }
  }

  /**
   * Rebuild cloze blanks/highlights inside rendered Markdown output. Done as a
   * string pass over the generated HTML so it is independent of DOM traversal.
   */
  restoreClozeMarkup(container) {
    const html = container.innerHTML;
    if (!/PDL(?:CLOZE|BLANK)/.test(html)) return;
    const encodeText = value => value
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    container.innerHTML = html.replace(/PDLCLOZE([\p{L}\p{N}_]+)PDLEND|PDLBLANK/gu, (match, word) => {
      if (word === undefined) return `<span class="pdl-cloze-blank">[...]</span>`;
      return `<mark class="pdl-cloze-target">${encodeText(word)}</mark>`;
    });
  }

  async onOpen() {
    this.containerEl.addClass("pdl-flashcard-host");
    this.keyHandler = event => {
      if (!this.session.length && !this.undoStack?.length) return;
      // Never hijack typing inside a modal or an input that is part of the view.
      const target = event.target;
      const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ""));
      const undoCombo = (event.ctrlKey || event.metaKey) && !event.shiftKey && String(event.key).toLowerCase() === "z";
      if (undoCombo && this.undoStack?.length) { event.preventDefault(); void this.undoLastGrade(); return; }
      if (typing || !this.session.length) return;
      const current = this.session[this.index];
      if (event.key === " " && !this.revealed && current?.type !== "multiple-choice") { event.preventDefault(); this.reveal(); }
      if (this.revealed && ["1","2","3","4"].includes(event.key)) { event.preventDefault(); this.submitGrade(Number(event.key)); }
    };
    this.registerDomEvent(document, "keydown", this.keyHandler);
    await this.refresh();
  }

  async refresh() {
    const content = this.containerEl.children[1];
    content.empty();
    content.createDiv({ cls: "pdl-loading", text: L("Mapping your flashcard library…", "Đang quét thư viện flashcard…") });
    this.cards = await this.plugin.getCards();
    this.filtered = this.cards;
    this.renderDashboard();
  }

  getStats() {
    const now = Date.now();
    const scheduled = Object.values(this.plugin.settings.schedule);
    const available = this.cards.filter(card => this.plugin.isCardAvailable(card, now));
    const due = available.filter(card => !this.plugin.settings.schedule[card.id] || this.plugin.settings.schedule[card.id].due <= now).length;
    const suspended = this.cards.length - available.length;
    const mature = scheduled.filter(item => item.interval >= 21 && !item.suspended).length;
    const todayReviews = this.plugin.settings.reviews.filter(item => dateKey(item.at) === dateKey()).length;
    const days = new Set(this.plugin.settings.streakDates);
    let streak = 0, cursor = new Date();
    while (days.has(dateKey(cursor.getTime()))) { streak++; cursor.setDate(cursor.getDate() - 1); }
    return { due, mature, todayReviews, streak, suspended };
  }

  renderDashboard() {
    this.session = [];
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("pdl-flashcard");
    const stats = this.getStats();
    const masthead = root.createDiv({ cls: "pdl-masthead" });
    const brand = masthead.createDiv({ cls: "pdl-brand" });
    brand.createSpan({ cls: "pdl-brand-mark", text: "PDL" });
    brand.createSpan({ text: L("MEMORY PRESS", "BẢN TIN HỌC TẬP") });
    masthead.createSpan({ cls: "pdl-edition", text: `${new Intl.DateTimeFormat(locale(), { weekday:"long", day:"2-digit", month:"2-digit" }).format(new Date())} · ${L("DAILY EDITION", "BẢN HÔM NAY")}` });

    const statGrid = root.createDiv({ cls: "pdl-stat-grid" });
    const statCells = [[L("Due", "Đến hạn"), stats.due, "clock-3"], [L("Today", "Hôm nay"), stats.todayReviews, "check-circle-2"], [L("Mature", "Thành thạo"), stats.mature, "shield-check"], [L("Day streak", "Chuỗi ngày"), stats.streak, "flame"]];
    if (stats.suspended) statCells.push([L("Suspended", "Tạm dừng"), stats.suspended, "pause-circle"]);
    statCells.forEach(([label,value,icon], index) => {
      const box = statGrid.createDiv({ cls: `pdl-stat pdl-stat-${index + 1}` });
      const glyph = box.createSpan({ cls: "pdl-stat-icon" }); setIcon(glyph, icon);
      const info = box.createDiv({ cls: "pdl-stat-info" });
      info.createEl("strong", { cls: "pdl-stat-value", text: formatCount(value, value >= 10000), attr: { title: formatCount(value) } });
      info.createSpan({ cls: "pdl-stat-label", text: label });
    });

    const panel = root.createDiv({ cls: "pdl-library" });
    const panelHead = panel.createDiv({ cls: "pdl-panel-head" });
    const heading = panelHead.createDiv();
    heading.createEl("h3", { text: L("Flashcard Library", "Thư viện flashcard") });
    heading.createEl("p", { text: L(`${formatCount(this.cards.length)} questions curated in ${this.plugin.settings.outputFolder}`, `${formatCount(this.cards.length)} câu hỏi trong ${this.plugin.settings.outputFolder}`) });
    const tools = panelHead.createDiv({ cls: "pdl-library-tools" });

    const customStudy = tools.createEl("button", { cls: "pdl-custom-study", text: L("Custom Study", "Ôn tùy chọn") });
    setIcon(customStudy.createSpan(), "flame");
    customStudy.onclick = () => new FlashcardCustomStudyModal(this.app, this.plugin, this).open();

    const impExp = tools.createEl("button", { cls: "pdl-imp-exp", text: L("Import/Export", "Nhập/Xuất") });
    setIcon(impExp.createSpan(), "arrow-up-right-from-square");
    impExp.onclick = () => new FlashcardExportImportModal(this.app, this.plugin).open();

    const statistics = tools.createEl("button", { cls: "pdl-open-stats", text: L("Statistics", "Thống kê") });
    setIcon(statistics.createSpan(), "chart-no-axes-combined");
    statistics.onclick = () => new FlashcardStatisticsModal(this.app, this.plugin).open();

    const manage = tools.createEl("button", { cls: "pdl-manage-cards", text: L("Manage cards", "Quản lý thẻ") });
    setIcon(manage.createSpan(), "table-properties");
    manage.onclick = () => new FlashcardManagerModal(this.app, this.plugin).open();

    const create = tools.createEl("button", { cls: "pdl-create-deck", text: L("Create deck", "Tạo deck") });
    setIcon(create.createSpan(), "plus");
    create.onclick = () => new FlashcardStudioModal(this.app, this.plugin).open();

    const search = tools.createEl("input", { placeholder: L("Search decks, tags or questions…", "Tìm deck, tag hoặc câu hỏi…"), attr: { type: "search" } });
    search.setAttr("aria-label", L("Search flashcards", "Tìm flashcard"));
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      this.filtered = this.cards.filter(card => {
        const textStr = `${card.heading} ${card.file.path} ${(card.tags || []).join(" ")}`.toLowerCase();
        return textStr.includes(q);
      });
      this.deckPage = 0;
      this.renderRows(list);
    };
    const list = panel.createDiv({ cls: "pdl-topic-list" });
    this.renderRows(list);
    this.renderHeatmap(root);
  }

  renderHeatmap(root) {
    const validIds = new Set(this.cards.map(card => card.id));
    const reviews = (this.plugin.settings.reviews || []).filter(review => validIds.has(review.cardId));
    const counts = new Map(); reviews.forEach(review => { const key = dateKey(review.at); counts.set(key, (counts.get(key) || 0) + 1); });
    const today = new Date(); today.setHours(0,0,0,0); const end = new Date(today); end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end); start.setDate(start.getDate() - 181);
    const days = []; for (let i=0;i<182;i++) { const date=new Date(start); date.setDate(start.getDate()+i); const key=dateKey(date.getTime()); days.push({ date, key, count:counts.get(key)||0, future:date>today }); }
    const total = days.reduce((sum,day)=>sum+day.count,0);
    const active = days.filter(day=>day.count>0).length;
    const section = root.createDiv({ cls:"pdl-dashboard-heatmap" });
    const head = section.createDiv({ cls:"pdl-heatmap-head" }); const copy=head.createDiv(); copy.createEl("h3",{text:L("Review Consistency", "Mức độ đều đặn")}); copy.createEl("p",{text:L(`${formatCount(total)} reviews across ${active} active days · last 26 weeks`, `${formatCount(total)} lượt ôn trong ${active} ngày · 26 tuần qua`)});
    const palettes = ["blue", "green", "orange", "purple"];
    const paletteNames = {
      blue: L("Blue", "Xanh dương"),
      green: L("Green", "Xanh lá"),
      orange: L("Orange", "Cam"),
      purple: L("Purple", "Tím")
    };
    let palette = palettes.includes(this.plugin.settings.heatmapPalette) ? this.plugin.settings.heatmapPalette : "blue";
    section.addClass(`pdl-heatmap-palette-${palette}`);
    const legend=head.createDiv({cls:"pdl-heatmap-legend",attr:{"aria-label":L("Activity intensity legend", "Chú giải mức độ hoạt động"), role:"button", tabindex:"0"}});
    legend.createSpan({text:L("Less", "Ít")}); [0,1,2,3,4].forEach(level=>legend.createSpan({cls:`pdl-heatmap-swatch level-${level}`})); legend.createSpan({text:L("More", "Nhiều")});
    const shapes = ["square", "rounded", "circle", "diamond", "hexagon"];
    const shapeNames = {
      square: L("Square", "Vuông"),
      rounded: L("Rounded", "Bo góc"),
      circle: L("Circle", "Tròn"),
      diamond: L("Diamond", "Kim cương"),
      hexagon: L("Hexagon", "Lục giác")
    };
    let shape = shapes.includes(this.plugin.settings.heatmapShape) ? this.plugin.settings.heatmapShape : "square";
    section.addClass(`pdl-heatmap-shape-${shape}`);
    const shapeToggle = legend.createSpan({ cls: "pdl-heatmap-shape-toggle", attr: { role: "button", tabindex: "0" } });
    const shapePreview = shapeToggle.createSpan({ cls: `pdl-heatmap-shape-preview is-${shape}` });
    const syncLegend = () => {
      const title = L(`Heatmap color: ${paletteNames[palette]}. Click to change.`, `Màu heatmap: ${paletteNames[palette]}. Bấm để đổi.`);
      legend.setAttr("title", title);
      legend.setAttr("aria-label", title);
      const shapeTitle = L(`Heatmap cell shape: ${shapeNames[shape]}. Click to change.`, `Hình ô heatmap: ${shapeNames[shape]}. Bấm để đổi.`);
      shapeToggle.setAttr("title", shapeTitle);
      shapeToggle.setAttr("aria-label", shapeTitle);
    };
    syncLegend();
    const cyclePalette = async () => {
      section.removeClass(`pdl-heatmap-palette-${palette}`);
      palette = palettes[(palettes.indexOf(palette) + 1) % palettes.length];
      section.addClass(`pdl-heatmap-palette-${palette}`);
      this.plugin.settings.heatmapPalette = palette;
      syncLegend();
      await this.plugin.saveData(this.plugin.settings);
    };
    const cycleShape = async () => {
      section.removeClass(`pdl-heatmap-shape-${shape}`);
      shapePreview.removeClass(`is-${shape}`);
      shape = shapes[(shapes.indexOf(shape) + 1) % shapes.length];
      section.addClass(`pdl-heatmap-shape-${shape}`);
      shapePreview.addClass(`is-${shape}`);
      this.plugin.settings.heatmapShape = shape;
      syncLegend();
      await this.plugin.saveData(this.plugin.settings);
    };
    legend.onclick = () => cyclePalette();
    legend.onkeydown = event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void cyclePalette();
      }
    };
    shapeToggle.onclick = event => {
      event.stopPropagation();
      return cycleShape();
    };
    shapeToggle.onkeydown = event => {
      event.stopPropagation();
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        return cycleShape();
      }
    };
    const body=section.createDiv({cls:"pdl-heatmap-body"}); const labels=body.createDiv({cls:"pdl-heatmap-weekdays"});
    const weekdayLabels = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale(), { weekday: "short" }).format(new Date(2024, 0, 7 + index)));
    weekdayLabels.forEach((label,index)=>labels.createSpan({text:index%2?label:""}));
    const grid=body.createDiv({cls:"pdl-heatmap-grid",attr:{role:"grid","aria-label":L("Review activity for the last 26 weeks", "Hoạt động ôn tập 26 tuần qua")}});
    days.forEach(day=>{const level=day.future?0:day.count===0?0:day.count===1?1:day.count<=4?2:day.count<=9?3:4;const dateLabel=new Intl.DateTimeFormat(locale(),{weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(day.date);const label=L(`${dateLabel}: ${day.count} ${day.count===1?"review":"reviews"}`, `${dateLabel}: ${day.count} lượt ôn`);grid.createSpan({cls:`pdl-heatmap-cell level-${level}${day.future?" is-future":""}`,attr:{role:"gridcell",tabindex:day.future?"-1":"0","aria-label":label,title:label}});});
  }

  renderRows(list) {
    list.empty();
    const grouped = new Map();
    for (const card of this.filtered) {
      const deck = card.file.path;
      if (!grouped.has(deck)) grouped.set(deck, []);
      grouped.get(deck).push(card);
    }
    const entries = [...grouped.entries()].sort((a, b) => {
      const dueA = a[1].filter(card => !this.plugin.settings.schedule[card.id] || this.plugin.settings.schedule[card.id].due <= Date.now()).length;
      const dueB = b[1].filter(card => !this.plugin.settings.schedule[card.id] || this.plugin.settings.schedule[card.id].due <= Date.now()).length;
      return dueB - dueA || a[1][0].deckTitle.localeCompare(b[1][0].deckTitle, locale());
    });
    const pageSize = Math.max(1, Number(this.plugin.settings.decksPerPage) || 5);
    const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
    this.deckPage = Math.min(this.deckPage, pageCount - 1);
    const visible = entries.slice(this.deckPage * pageSize, (this.deckPage + 1) * pageSize);
    for (const [deckPath, cards] of visible) {
      const row = list.createDiv({ cls: "pdl-topic-row", attr: { tabindex: "0", role: "button" } });
      const icon = row.createSpan({ cls: "pdl-topic-icon" }); setIcon(icon, "folder-open");
      const copy = row.createDiv({ cls: "pdl-topic-copy" });
      copy.createEl("strong", { text: cards[0].deckTitle || cards[0].file.basename });
      copy.createSpan({ text: L(`${formatCount(cards.length, cards.length >= 10000)} questions · source: ${cards[0].sourceFile ? cards[0].sourceFile.basename : cards[0].sourcePath || "unknown"}`, `${formatCount(cards.length, cards.length >= 10000)} câu hỏi · nguồn: ${cards[0].sourceFile ? cards[0].sourceFile.basename : cards[0].sourcePath || "không rõ"}`) });
      const due = cards.filter(c => !this.plugin.settings.schedule[c.id] || this.plugin.settings.schedule[c.id].due <= Date.now()).length;
      row.createSpan({ cls: "pdl-due-pill", text: due ? L(`${formatCount(due, due >= 10000)} due`, `${formatCount(due, due >= 10000)} đến hạn`) : L("Up to date", "Đã ôn hết"), attr: { title: due ? L(`${formatCount(due)} cards due`, `${formatCount(due)} thẻ đến hạn`) : L("No cards due", "Không có thẻ đến hạn") } });
      const go = () => this.startSession(cards);
      row.onclick = go; row.onkeydown = e => { if (e.key === "Enter" || e.key === " ") go(); };
    }
    if (!entries.length) {
      const empty = list.createDiv({ cls: "pdl-empty" });
      empty.createEl("strong", { text: L("No flashcard decks yet", "Chưa có deck flashcard nào") });
      empty.createEl("p", { text: L("Choose “Create deck” to write cards manually or generate a draft with AI.", "Chọn “Tạo deck” để tự viết thẻ hoặc tạo bản nháp bằng AI.") });
    } else if (pageCount > 1) {
      const pager = list.createDiv({ cls: "pdl-deck-pager" });
      pager.createSpan({ text: L(`${formatCount(entries.length)} decks · ${pageSize} per page`, `${formatCount(entries.length)} deck · ${pageSize} mỗi trang`) });
      const controls = pager.createDiv({ cls: "pdl-pager-controls" });
      const goTo = value => {
        const page = Math.max(1, Math.min(pageCount, Math.floor(Number(value) || 1)));
        this.deckPage = page - 1;
        this.renderRows(list);
      };
      const addStep = (text, label, disabled, target) => {
        const button = controls.createEl("button", { cls: "pdl-pager-step", text, attr: { "aria-label": label, title: label } });
        button.disabled = disabled;
        button.onclick = () => goTo(target);
        return button;
      };
      addStep("«", L("First page", "Trang đầu"), this.deckPage === 0, 1);
      addStep("‹", L("Previous page", "Trang trước"), this.deckPage === 0, this.deckPage);
      controls.createSpan({ cls: "pdl-page-label", text: L("Page", "Trang") });
      const jump = controls.createEl("input", {
        cls: "pdl-page-input",
        attr: {
          type: "number", min: "1", max: String(pageCount), value: String(this.deckPage + 1),
          "aria-label": L("Go to page", "Đi đến trang")
        }
      });
      jump.onchange = () => goTo(jump.value);
      jump.onkeydown = event => {
        if (event.key === "Enter") { event.preventDefault(); goTo(jump.value); }
      };
      controls.createSpan({ cls: "pdl-page-total", text: `/ ${pageCount}` });
      addStep("›", L("Next page", "Trang sau"), this.deckPage >= pageCount - 1, this.deckPage + 2);
      addStep("»", L("Last page", "Trang cuối"), this.deckPage >= pageCount - 1, pageCount);
    }
  }

  startSession(pool = this.cards, forceAll = false) {
    const now = Date.now();
    // Suspended and buried cards stay out of every queue, including cram sessions.
    const available = pool.filter(card => this.plugin.isCardAvailable(card, now));
    const skipped = pool.length - available.length;
    let selected = [];
    if (forceAll) {
      selected = [...available];
    } else {
      const sorted = [...available].sort((a,b) => {
        const sa = this.plugin.settings.schedule[a.id], sb = this.plugin.settings.schedule[b.id];
        return (sa ? sa.due : 0) - (sb ? sb.due : 0);
      });
      const due = sorted.filter(card => !this.plugin.settings.schedule[card.id] || this.plugin.settings.schedule[card.id].due <= now);
      selected = due.slice(0, this.plugin.settings.sessionSize);
      if (!selected.length) selected = sorted.slice(0, this.plugin.settings.sessionSize);
    }
    if (!selected.length) {
      new Notice(skipped
        ? L("No flashcards are available for this session (suspended or buried cards are excluded).", "Không có flashcard nào cho phiên này (thẻ tạm dừng hoặc bị ẩn đã được loại).")
        : L("No flashcards are available for this session.", "Không có flashcard nào cho phiên này."));
      return;
    }
    this.session = selected;
    this.index = 0; this.revealed = false; this.grades = []; this.selectedChoice = null; this.showQuestionMode = false;
    this.undoStack = [];
    this.requeueCounts = new Map();
    this.renderReview();
  }

  renderReview() {
    if (this.index >= this.session.length) { this.renderSummary(); return; }
    const card = this.session[this.index];
    const root = this.containerEl.children[1]; root.empty(); root.addClass("pdl-flashcard");
    const bar = root.createDiv({ cls: "pdl-review-bar" });
    const back = bar.createEl("button", { cls: "pdl-icon-button", attr: { "aria-label": L("Exit review", "Thoát ôn tập") } }); setIcon(back, "x"); back.onclick = () => this.renderDashboard();
    // Undo only makes sense once at least one card in this session was graded.
    const undo = bar.createEl("button", { cls: "pdl-icon-button pdl-undo-button", attr: { "aria-label": L("Undo last answer", "Hoàn tác câu trả lời trước"), title: L("Undo last answer (Ctrl+Z)", "Hoàn tác câu trả lời trước (Ctrl+Z)") } });
    setIcon(undo, "undo-2");
    undo.disabled = !this.undoStack.length;
    undo.onclick = () => void this.undoLastGrade();
    bar.createSpan({ cls: "pdl-folio", text: L(`CARD ${String(this.index + 1).padStart(2,"0")} / ${String(this.session.length).padStart(2,"0")}`, `THẺ ${String(this.index + 1).padStart(2,"0")} / ${String(this.session.length).padStart(2,"0")}`) });
    const progress = bar.createDiv({ cls: "pdl-progress" }); progress.createDiv({ cls: "pdl-progress-fill", attr: { style: `width:${(this.index / this.session.length) * 100}%` } });
    // A long note name used to stretch (and then crush) the review bar. The button
    // now keeps a fixed label and moves the real name into the tooltip.
    const sourceName = card.sourceFile
      ? card.sourceFile.basename
      : (card.deckTitle || card.file?.basename || L("Vault", "Vault"));
    const source = bar.createEl("button", {
      cls: "pdl-source-button",
      attr: { title: sourceName, "aria-label": L(`Open ${sourceName}`, `Mở ${sourceName}`) }
    });
    source.createSpan({ cls: "pdl-source-button-label", text: card.sourceFile ? L("Open note", "Mở note") : L("Open deck", "Mở deck") });
    setIcon(source.createSpan({ cls: "pdl-source-button-icon" }), "external-link");
    source.onclick = () => card.sourceFile ? this.app.workspace.getLeaf("tab").openFile(card.sourceFile) : this.app.workspace.getLeaf("tab").openFile(card.file);

    const stage = root.createDiv({ cls: "pdl-review-stage" });
    const chapter = stage.createDiv({ cls: "pdl-review-chapter" });
    chapter.createSpan({ text: card.type === "cloze" ? L("CLOZE RECALL", "ÔN CLOZE") : L("RECALL PROMPT", "GỢI NHỚ") });
    const folderName = card.file.parent ? card.file.parent.name : L("Vault", "Vault");
    chapter.createEl("strong", { text: truncateLabel(folderName, 32), attr: { title: folderName } });
    
    const cardEl = stage.createDiv({ cls: "pdl-review-card" });

    // Top Card Header Container
    const cardHeader = cardEl.createDiv({ cls: "pdl-card-header" });
    const isShowingQuestion = !this.revealed || this.showQuestionMode;
    const labelText = !this.revealed ? L("RECALL BEFORE REVEALING", "NHỚ TRƯỚC KHI MỞ ĐÁP ÁN") : (isShowingQuestion ? L("QUESTION VIEW", "XEM CÂU HỎI") : L("SOURCE ANSWER", "ĐÁP ÁN"));
    
    // Label + TTS button group
    const labelBox = cardHeader.createDiv({ cls: "pdl-card-label-box" });
    if (this.revealed) labelBox.addClass("is-answer");
    labelBox.createSpan({ cls: "pdl-card-label", text: labelText });

    const ttsBtn = labelBox.createEl("button", { cls: "pdl-tts-button", attr: { "aria-label": L("Read aloud", "Đọc to"), title: L("Read aloud (TTS)", "Đọc to (TTS)") } });
    setIcon(ttsBtn, "volume-2");
    ttsBtn.onclick = (e) => {
      e.stopPropagation();
      let speakContent;
      if (card.type === "cloze") {
        const cloze = parseCloze(card.question);
        // Never speak the hidden answer before reveal: use the masked statement.
        speakContent = this.revealed
          ? cloze.fullAnswer
          : cloze.hiddenPrompt.replace(/\[[^\]]*\]/g, ` ${L("blank", "chỗ trống")} `);
      } else if (card.type === "multiple-choice" && this.revealed) {
        const choices = (card.choices || []).filter(Boolean)
          .map((choice, index) => `${String.fromCharCode(65 + index)}. ${choice}`)
          .join(". ");
        speakContent = `${card.question}. ${L("Choices", "Các lựa chọn")}: ${choices}. ${L("Correct answer", "Đáp án đúng")}: ${card.answer}`;
      } else {
        speakContent = this.revealed ? `${card.question}. ${card.answer}` : card.question;
      }
      speakText(speakContent, {
        voice: this.plugin.settings.ttsVoice,
        rate: this.plugin.settings.ttsRate
      });
    };

    // Suspend / bury act on the card and immediately move the session on to the next one.
    const skipCard = () => {
      this.revealed = false; this.selectedChoice = null; this.showQuestionMode = false;
      this.index++;
      this.renderReview();
    };
    const suspendBtn = labelBox.createEl("button", { cls: "pdl-tts-button pdl-suspend-button", attr: { "aria-label": L("Suspend this card", "Tạm dừng thẻ này"), title: L("Suspend this card (hide from reviews)", "Tạm dừng thẻ này (ẩn khỏi các phiên ôn)") } });
    setIcon(suspendBtn, "pause-circle");
    suspendBtn.onclick = async (e) => {
      e.stopPropagation();
      await this.plugin.setSuspended(card, true);
      new Notice(L(`Card suspended: "${truncateLabel(card.question)}".`, `Đã tạm dừng thẻ: "${truncateLabel(card.question)}".`), 2500);
      skipCard();
    };
    const buryBtn = labelBox.createEl("button", { cls: "pdl-tts-button pdl-bury-button", attr: { "aria-label": L("Bury until tomorrow", "Ẩn đến mai"), title: L("Bury until tomorrow", "Ẩn đến mai") } });
    setIcon(buryBtn, "eye-off");
    buryBtn.onclick = async (e) => {
      e.stopPropagation();
      await this.plugin.buryCard(card);
      new Notice(L(`Card buried until tomorrow: "${truncateLabel(card.question)}".`, `Đã ẩn thẻ đến mai: "${truncateLabel(card.question)}".`), 2500);
      skipCard();
    };
    
    // Toggle View button when revealed
    if (this.revealed) {
      const toggleBtn = cardHeader.createEl("button", {
        cls: "pdl-toggle-view",
        text: isShowingQuestion ? L("→ Show answer", "→ Xem đáp án") : L("← Show question", "← Xem câu hỏi")
      });
      toggleBtn.onclick = (e) => {
        e.stopPropagation();
        this.showQuestionMode = !this.showQuestionMode;
        this.renderReview();
      };
    }

    if (isShowingQuestion) {
      // --- QUESTION VIEW MODE ---
      const qBox = cardEl.createDiv({ cls: "pdl-question-view" });
      const qHeading = qBox.createEl("h2", { cls: "pdl-question-text" });
      const cardSourcePath = card.sourcePath || (card.file ? card.file.path : "");
      if (card.type === "cloze") {
        // Before reveal the blanks stay hidden; afterwards the question view shows
        // the terms highlighted so the whole statement can be read back.
        this.renderCardText(qHeading, card.question, { inline: true, cloze: true, revealed: this.revealed, sourcePath: cardSourcePath });
      } else {
        this.renderCardText(qHeading, card.question, { inline: true, sourcePath: cardSourcePath });
      }

      if (card.tags && card.tags.length > 0) {
        const tagsBox = qBox.createDiv({ cls: "pdl-card-tags" });
        card.tags.forEach(t => tagsBox.createSpan({ cls: "pdl-tag-badge", text: `#${t}` }));
      }

      const answer = qBox.createDiv({ cls: "pdl-answer markdown-rendered" });
      if (card.type === "multiple-choice") {
        this.renderChoices(answer, card);
      } else if (card.type === "cloze" && !this.revealed) {
        this.renderClozeInputs(answer, card);
      } else if (!this.revealed) {
        answer.addClass("is-freeform");
        answer.createEl("p", { cls: "pdl-prompt", text: L("Say it aloud, write it down, or reconstruct the answer in your mind.", "Hãy nói to, viết ra, hoặc tự dựng lại câu trả lời trong đầu.") });
        const reveal = answer.createEl("button", { cls: "pdl-reveal", text: L("Reveal answer", "Hiện đáp án") });
        reveal.onclick = () => this.reveal();
        answer.createEl("kbd", { cls: "pdl-reveal-hint", text: L("Space", "Space") });
      }

      if (this.revealed) {
        const backToAns = qBox.createEl("button", { cls: "pdl-reveal pdl-back-to-answer", text: L("Back to answer & rating →", "Quay lại đáp án & Đánh giá →") });
        backToAns.onclick = () => {
          this.showQuestionMode = false;
          this.renderReview();
        };
      }
    } else {
      // --- ANSWER VIEW MODE ---
      const answerBox = cardEl.createDiv({ cls: "pdl-answer-view markdown-rendered" });

      const isMcq = card.type === "multiple-choice" && this.selectedChoice !== null;
      const isRight = isMcq ? this.selectedChoice === card.answer : null;
      // The result banner is only meaningful for a picked MCQ answer. For a basic
      // or cloze card it duplicated the "ĐÁP ÁN CHÍNH XÁC" label below.
      if (isMcq) {
        const result = answerBox.createDiv({ cls: `pdl-card-result${isRight ? " is-correct" : " is-wrong"}` });
        result.createSpan({ cls: "pdl-card-result-status", text: isRight ? L("CORRECT", "CHÍNH XÁC") : L("NOT QUITE", "CHƯA ĐÚNG") });
        const mcqSummary = result.createDiv({ cls: "pdl-mcq-summary" });
        const appendRow = (label, value, kind) => {
          const row = mcqSummary.createDiv({ cls: "pdl-mcq-row" });
          row.createSpan({ cls: "pdl-mcq-label", text: label });
          row.createSpan({ cls: `pdl-mcq-value is-${kind}`, text: String(value ?? "") });
        };
        appendRow(L("Your choice", "Lựa chọn của bạn"), this.selectedChoice, isRight ? "correct" : "wrong");
        if (!isRight) appendRow(L("Correct answer", "Đáp án đúng"), card.answer, "correct");
      }

      const answerText = card.type === "cloze" ? parseCloze(card.question).answers.join(", ") : card.answer;

      const mainAnsEl = answerBox.createDiv({ cls: "pdl-main-answer-text" });

      // Answer section
      const ansSection = mainAnsEl.createDiv({ cls: "pdl-answer-section" });
      ansSection.createEl("div", { cls: "pdl-section-label", text: L("CORRECT ANSWER", "ĐÁP ÁN CHÍNH XÁC") });
      const ansBody = ansSection.createDiv({ cls: "pdl-section-body" });
      this.renderCardText(ansBody, answerText, { sourcePath: card.sourcePath || (card.file ? card.file.path : "") });

      // Explanation section
      if (card.explanation) {
        const expSection = mainAnsEl.createDiv({ cls: "pdl-explanation-section" });
        expSection.createEl("div", { cls: "pdl-section-label", text: L("DETAILED EXPLANATION", "GIẢI THÍCH CHI TIẾT") });
        const expBody = expSection.createDiv({ cls: "pdl-section-body" });
        this.renderCardText(expBody, card.explanation, { sourcePath: card.sourcePath || (card.file ? card.file.path : "") });
      }
    }

    if (this.revealed) {
      this.renderRatings(stage, card);
    }
  }

  reveal() { 
    this.revealed = true; 
    this.showQuestionMode = false;
    this.renderReview(); 
  }

  /**
   * Cloze cards: type each missing term instead of only pressing "reveal".
   * One input per deletion; Enter checks, all-correct reveals the answer.
   */
  renderClozeInputs(container, card) {
    const answers = parseCloze(card.question).answers;
    if (!answers.length) {
      container.addClass("is-freeform");
      container.createEl("p", { cls: "pdl-prompt", text: L("Type the missing word, then reveal the answer.", "Hãy nhập từ còn thiếu, rồi mở đáp án.") });
      const reveal = container.createEl("button", { cls: "pdl-reveal", text: L("Reveal answer", "Hiện đáp án") });
      reveal.onclick = () => this.reveal();
      return;
    }

    container.addClass("pdl-cloze-answer");
    container.createEl("p", { cls: "pdl-cloze-prompt", text: L("Type the missing word(s):", "Nhập từ còn thiếu:") });
    const fields = container.createDiv({ cls: "pdl-cloze-fields" });
    const inputs = answers.map((answer, index) => {
      const field = fields.createDiv({ cls: "pdl-cloze-field" });
      field.createSpan({ cls: "pdl-cloze-index", text: String(index + 1) });
      const input = field.createEl("input", {
        cls: "pdl-cloze-input",
        attr: {
          type: "text",
          autocomplete: "off",
          spellcheck: "false",
          placeholder: L("Type the missing word…", "Nhập từ còn thiếu…"),
          "aria-label": L(`Blank ${index + 1}`, `Chỗ trống ${index + 1}`)
        }
      });
      input.oninput = () => {
        input.removeClass("is-correct");
        input.removeClass("is-wrong");
      };
      input.onkeydown = event => {
        if (event.key === "Enter") { event.preventDefault(); check(); }
      };
      return input;
    });

    const hints = container.createDiv({ cls: "pdl-cloze-hints" });
    hints.createSpan({ cls: "pdl-cloze-hints-label", text: L("Click a letter to reveal a hint:", "Bấm một chữ để mở gợi ý:") });
    answers.forEach((answer, answerIndex) => {
      const row = hints.createDiv({ cls: "pdl-cloze-hint-row" });
      if (answers.length > 1) row.createSpan({ cls: "pdl-cloze-hint-index", text: String(answerIndex + 1) });
      const letters = row.createDiv({ cls: "pdl-cloze-letters" });
      Array.from(answer.normalize("NFC")).forEach((character, characterIndex) => {
        if (/\s/.test(character)) { letters.createSpan({ cls: "pdl-cloze-hint-space" }); return; }
        if (!/[\p{L}\p{N}]/u.test(character)) { letters.createSpan({ cls: "pdl-cloze-hint-punct", text: character }); return; }
        const tile = letters.createSpan({
          cls: "pdl-cloze-hint-letter",
          text: "•",
          attr: {
            role: "button",
            tabindex: "0",
            title: L("Click to reveal this letter", "Bấm để mở chữ này"),
            "aria-label": L(`Reveal letter ${characterIndex + 1} of blank ${answerIndex + 1}`, `Mở chữ ${characterIndex + 1} của chỗ trống ${answerIndex + 1}`)
          }
        });
        const reveal = () => {
          tile.setText(character);
          tile.addClass("is-revealed");
          tile.setAttr("aria-label", character);
        };
        tile.onclick = reveal;
        tile.onkeydown = event => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); reveal(); }
        };
      });
    });

    const feedback = container.createDiv({ cls: "pdl-cloze-feedback" });
    const normalize = value => String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
    const check = () => {
      const values = inputs.map(input => input.value);
      if (values.some(value => !value.trim())) {
        feedback.setText(L("Fill every blank first.", "Hãy điền đủ các chỗ trống."));
        feedback.removeClass("is-correct");
        feedback.addClass("is-wrong");
        return;
      }
      let allRight = true;
      inputs.forEach((input, index) => {
        const right = normalize(values[index]) === normalize(answers[index]);
        input.toggleClass("is-correct", right);
        input.toggleClass("is-wrong", !right);
        if (!right) allRight = false;
      });
      if (allRight) {
        feedback.setText(L("Correct!", "Chính xác!"));
        feedback.addClass("is-correct");
        feedback.removeClass("is-wrong");
        this.reveal();
      } else {
        feedback.setText(L("Not quite — try again.", "Chưa đúng — thử lại."));
        feedback.addClass("is-wrong");
        feedback.removeClass("is-correct");
        inputs.find((_, index) => normalize(inputs[index].value) !== normalize(answers[index]))?.focus();
      }
    };

    const actions = container.createDiv({ cls: "pdl-cloze-actions" });
    const checkButton = actions.createEl("button", { cls: "pdl-reveal", text: L("Check answer", "Kiểm tra") });
    checkButton.onclick = check;
    const revealButton = actions.createEl("button", { cls: "pdl-cloze-reveal", text: L("Reveal answer", "Hiện đáp án") });
    revealButton.onclick = () => this.reveal();
    inputs[0]?.focus?.();
  }

  renderChoices(container, card) {
    const choices = container.createDiv({ cls: "pdl-choices" });
    (card.choices || []).forEach((choice, index) => {
      const isCorrect = choice === card.answer;
      const selected = choice === this.selectedChoice;
      const button = choices.createEl("button", { cls: `pdl-choice${this.revealed && isCorrect ? " is-correct" : ""}${this.revealed && selected && !isCorrect ? " is-wrong" : ""}` });
      button.createSpan({ cls: "pdl-choice-key", text: String.fromCharCode(65 + index) });
      const textSpan = button.createSpan({ cls: "pdl-choice-text" });
      this.renderCardText(textSpan, choice, { inline: true });
      button.disabled = this.revealed;
      button.onclick = () => { 
        this.selectedChoice = choice; 
        this.revealed = true; 
        this.showQuestionMode = false;
        this.renderReview(); 
      };
    });
  }

  /** Mirror the scheduling formula in review.js to preview the next interval. */
  previewInterval(previous, grade) {
    const maxDays = Number(this.plugin.settings.maxIntervalDays) || 36500;
    let iv;
    if (grade === 1) iv = 10 / 1440;                                  // 10 min
    else if (grade === 2) iv = Math.max(1, previous.interval * 1.35 || 1);
    else if (grade === 3) iv = Math.max(2, previous.interval * 2.4  || 2);
    else                  iv = Math.max(4, previous.interval * 3.6  || 4);
    return Math.min(iv, maxDays);
  }

  /** Format an interval (in days) as a human-readable string. */
  formatInterval(iv) {
    if (iv < 1) {
      const mins = Math.round(iv * 1440);
      return L(`${mins} min`, `${mins} phút`);
    }
    const days = Math.round(iv);
    return L(`${days} day${days !== 1 ? "s" : ""}`, `${days} ngày`);
  }

  renderRatings(stage, card) {
    const hint = stage.createEl("p", { cls: "pdl-rate-hint", text: L("Rate what you recalled—not how familiar the answer looks", "Đánh giá mức độ nhớ được—không phải mức quen mắt của đáp án") });
    hint.setAttr("aria-live", "polite");
    const ratings = stage.createDiv({ cls: "pdl-ratings" });
    const previous = this.plugin.settings.schedule[card.id] || { interval: 0 };
    [[1,L("Again","Lại")],[2,L("Hard","Khó")],[3,L("Good","Tốt")],[4,L("Easy","Dễ")]].forEach(([grade, label]) => {
      const iv  = this.previewInterval(previous, grade);
      const sub = this.formatInterval(iv);
      const button = ratings.createEl("button", { cls: `pdl-rate pdl-rate-${grade}` });
      button.createEl("kbd", { text: String(grade) }); button.createEl("strong", { text: label }); button.createSpan({ text: sub });
      button.onclick = () => this.submitGrade(grade);
    });
  }

  async submitGrade(grade) {
    const card = this.session[this.index];
    const previous = this.plugin.settings.schedule[card.id];
    // Snapshot everything the grade is about to mutate so it can be rolled back.
    this.undoStack.push({
      index: this.index,
      grade,
      gradesLength: this.grades.length,
      reviewsLength: this.plugin.settings.reviews.length,
      streak: [...this.plugin.settings.streakDates],
      cardId: card.id,
      schedule: previous ? { ...previous } : null,
      requeued: false
    });
    if (this.undoStack.length > 30) this.undoStack.shift();
    await this.plugin.rate(card, grade);
    this.grades.push(grade);
    // Anki-style relearning: a forgotten card comes back once more in this session.
    if (grade === 1 && this.plugin.settings.requeueForgotten !== false) {
      const count = this.requeueCounts.get(card.id) || 0;
      const limit = Number(this.plugin.settings.requeueLimit ?? 2);
      if (count < limit) {
        this.requeueCounts.set(card.id, count + 1);
        this.session.push(card);
        this.undoStack[this.undoStack.length - 1].requeued = true;
        new Notice(L(`"${truncateLabel(card.question)}" will come back later in this session.`, `"${truncateLabel(card.question)}" sẽ quay lại trong phiên này.`), 1800);
      }
    }
    this.index++;
    this.revealed = false;
    this.selectedChoice = null;
    this.showQuestionMode = false;
    this.renderReview();
  }

  /** Reverts the most recent grade and puts the user back on that card. */
  async undoLastGrade() {
    const entry = this.undoStack.pop();
    if (!entry) { new Notice(L("There is nothing left to undo.", "Không còn thao tác nào để hoàn tác.")); return; }
    const schedule = this.plugin.settings.schedule;
    if (entry.schedule) schedule[entry.cardId] = entry.schedule;
    else delete schedule[entry.cardId];
    this.plugin.settings.reviews = this.plugin.settings.reviews.slice(0, entry.reviewsLength);
    this.plugin.settings.streakDates = entry.streak;
    await this.plugin.saveData(this.plugin.settings);
    // Drop the card that was re-queued by the very grade being undone.
    if (entry.requeued && this.session.length > entry.index + 1) this.session.splice(this.session.length - 1, 1);
    this.grades = this.grades.slice(0, entry.gradesLength);
    const card = this.session[entry.index];
    const count = this.requeueCounts.get(entry.cardId) || 0;
    if (entry.requeued && count > 0) this.requeueCounts.set(entry.cardId, count - 1);
    this.index = entry.index;
    this.revealed = false;
    this.selectedChoice = null;
    this.showQuestionMode = false;
    new Notice(L(`Undone: "${truncateLabel(card ? card.question : "")}".`, `Đã hoàn tác: "${truncateLabel(card ? card.question : "")}".`), 1800);
    this.renderReview();
  }

  renderSummary() {
    const root = this.containerEl.children[1]; root.empty(); root.addClass("pdl-flashcard");
    const box = root.createDiv({ cls: "pdl-summary" });
    const icon = box.createSpan({ cls: "pdl-summary-icon" }); setIcon(icon, "sparkles");
    box.createEl("h2", { text: L("Review complete", "Hoàn thành phiên ôn") });
    const remembered = this.grades.filter(g => g >= 3).length;
    box.createEl("p", { text: L(`You recalled ${remembered} of ${this.grades.length} cards. Forgotten and difficult cards will return sooner.`, `Bạn nhớ ${remembered}/${this.grades.length} thẻ. Thẻ quên và thẻ khó sẽ quay lại sớm hơn.`) });
    const actions = box.createDiv({ cls: "pdl-summary-actions" });
    if (this.undoStack?.length) {
      const undo = actions.createEl("button", { text: L("Undo last answer", "Hoàn tác câu trả lời trước") });
      undo.onclick = () => void this.undoLastGrade();
    }
    const home = actions.createEl("button", { text: L("Back to overview", "Về tổng quan") }); home.onclick = () => this.renderDashboard();
    const again = actions.createEl("button", { cls: "mod-cta", text: L("Start another session", "Bắt đầu phiên mới") }); again.onclick = () => this.startSession();
  }
}
