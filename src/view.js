/** The review dashboard: library, review session, heatmap and summary. */
import { ItemView, Notice, setIcon, MarkdownRenderer } from "obsidian";
import { VIEW_TYPE, DAY } from "./constants.js";
import { dateKey, formatCount, truncateLabel } from "./utils.js";
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
    this.deckPageSize = 5;
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
    const source = String(raw ?? "");
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
    } catch (_) {
      const html = options.inline || options.cloze ? formatRichInline(source) : formatRichText(source, options);
      if (!html) return;
      container.innerHTML = html;
      container.addClass("pdl-rich");
      if (!options.inline) container.addClass("markdown-rendered");
      wireCodeToggles(container);
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
    content.createDiv({ cls: "pdl-loading", text: "Mapping your flashcard library…" });
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
    brand.createSpan({ text: "MEMORY PRESS" });
    masthead.createSpan({ cls: "pdl-edition", text: `${new Intl.DateTimeFormat("en-US", { weekday:"long", day:"2-digit", month:"2-digit" }).format(new Date())} · DAILY EDITION` });

    const statGrid = root.createDiv({ cls: "pdl-stat-grid" });
    const statCells = [["Due", stats.due, "clock-3"], ["Today", stats.todayReviews, "check-circle-2"], ["Mature", stats.mature, "shield-check"], ["Day streak", stats.streak, "flame"]];
    if (stats.suspended) statCells.push(["Suspended", stats.suspended, "pause-circle"]);
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
    heading.createEl("h3", { text: "Flashcard Library" });
    heading.createEl("p", { text: `${formatCount(this.cards.length)} questions curated in ${this.plugin.settings.outputFolder}` });
    const tools = panelHead.createDiv({ cls: "pdl-library-tools" });

    const customStudy = tools.createEl("button", { cls: "pdl-custom-study", text: "Custom Study" });
    setIcon(customStudy.createSpan(), "flame");
    customStudy.onclick = () => new FlashcardCustomStudyModal(this.app, this.plugin, this).open();

    const impExp = tools.createEl("button", { cls: "pdl-imp-exp", text: "Import/Export" });
    setIcon(impExp.createSpan(), "arrow-up-right-from-square");
    impExp.onclick = () => new FlashcardExportImportModal(this.app, this.plugin).open();

    const statistics = tools.createEl("button", { cls: "pdl-open-stats", text: "Statistics" });
    setIcon(statistics.createSpan(), "chart-no-axes-combined");
    statistics.onclick = () => new FlashcardStatisticsModal(this.app, this.plugin).open();

    const manage = tools.createEl("button", { cls: "pdl-manage-cards", text: "Manage cards" });
    setIcon(manage.createSpan(), "table-properties");
    manage.onclick = () => new FlashcardManagerModal(this.app, this.plugin).open();

    const create = tools.createEl("button", { cls: "pdl-create-deck", text: "Create deck" });
    setIcon(create.createSpan(), "plus");
    create.onclick = () => new FlashcardStudioModal(this.app, this.plugin).open();

    const search = tools.createEl("input", { placeholder: "Search decks, tags or questions…", attr: { type: "search" } });
    search.setAttr("aria-label", "Search flashcards");
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
    const head = section.createDiv({ cls:"pdl-heatmap-head" }); const copy=head.createDiv(); copy.createEl("h3",{text:"Review Consistency"}); copy.createEl("p",{text:`${formatCount(total)} reviews across ${active} active days · last 26 weeks`});
    const legend=head.createDiv({cls:"pdl-heatmap-legend",attr:{"aria-label":"Activity intensity legend"}}); legend.createSpan({text:"Less"}); [0,1,2,3,4].forEach(level=>legend.createSpan({cls:`pdl-heatmap-swatch level-${level}`})); legend.createSpan({text:"More"});
    const body=section.createDiv({cls:"pdl-heatmap-body"}); const labels=body.createDiv({cls:"pdl-heatmap-weekdays"}); ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach((label,index)=>labels.createSpan({text:index%2?label:""}));
    const grid=body.createDiv({cls:"pdl-heatmap-grid",attr:{role:"grid","aria-label":"Review activity for the last 26 weeks"}});
    days.forEach(day=>{const level=day.future?0:day.count===0?0:day.count===1?1:day.count<=4?2:day.count<=9?3:4;const label=`${new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(day.date)}: ${day.count} ${day.count===1?"review":"reviews"}`;grid.createSpan({cls:`pdl-heatmap-cell level-${level}${day.future?" is-future":""}`,attr:{role:"gridcell",tabindex:day.future?"-1":"0","aria-label":label,title:label}});});
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
      return dueB - dueA || a[1][0].deckTitle.localeCompare(b[1][0].deckTitle, "en");
    });
    const pageCount = Math.max(1, Math.ceil(entries.length / this.deckPageSize));
    this.deckPage = Math.min(this.deckPage, pageCount - 1);
    const visible = entries.slice(this.deckPage * this.deckPageSize, (this.deckPage + 1) * this.deckPageSize);
    for (const [deckPath, cards] of visible) {
      const row = list.createDiv({ cls: "pdl-topic-row", attr: { tabindex: "0", role: "button" } });
      const icon = row.createSpan({ cls: "pdl-topic-icon" }); setIcon(icon, "folder-open");
      const copy = row.createDiv({ cls: "pdl-topic-copy" });
      copy.createEl("strong", { text: cards[0].deckTitle || cards[0].file.basename });
      copy.createSpan({ text: `${formatCount(cards.length, cards.length >= 10000)} questions · source: ${cards[0].sourceFile ? cards[0].sourceFile.basename : cards[0].sourcePath || "unknown"}` });
      const due = cards.filter(c => !this.plugin.settings.schedule[c.id] || this.plugin.settings.schedule[c.id].due <= Date.now()).length;
      row.createSpan({ cls: "pdl-due-pill", text: due ? `${formatCount(due, due >= 10000)} due` : "Up to date", attr: { title: due ? `${formatCount(due)} cards due` : "No cards due" } });
      const go = () => this.startSession(cards);
      row.onclick = go; row.onkeydown = e => { if (e.key === "Enter" || e.key === " ") go(); };
    }
    if (!entries.length) {
      const empty = list.createDiv({ cls: "pdl-empty" });
      empty.createEl("strong", { text: "No flashcard decks yet" });
      empty.createEl("p", { text: `Choose “Create deck” to write cards manually or generate a draft with AI.` });
    } else if (pageCount > 1) {
      const pager = list.createDiv({ cls: "pdl-deck-pager" });
      const summary = pager.createSpan({ text: `${formatCount(entries.length)} decks · Page ${this.deckPage + 1} of ${pageCount}` });
      const controls = pager.createDiv();
      const previous = controls.createEl("button", { text: "Previous" }); previous.disabled = this.deckPage === 0; previous.onclick = () => { this.deckPage--; this.renderRows(list); };
      const next = controls.createEl("button", { text: "Next" }); next.disabled = this.deckPage >= pageCount - 1; next.onclick = () => { this.deckPage++; this.renderRows(list); };
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
        ? "No flashcards are available for this session (suspended or buried cards are excluded)."
        : "No flashcards are available for this session.");
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
    const back = bar.createEl("button", { cls: "pdl-icon-button", attr: { "aria-label": "Exit review" } }); setIcon(back, "x"); back.onclick = () => this.renderDashboard();
    // Undo only makes sense once at least one card in this session was graded.
    const undo = bar.createEl("button", { cls: "pdl-icon-button pdl-undo-button", attr: { "aria-label": "Undo last answer", title: "Undo last answer (Ctrl+Z)" } });
    setIcon(undo, "undo-2");
    undo.disabled = !this.undoStack.length;
    undo.onclick = () => void this.undoLastGrade();
    bar.createSpan({ cls: "pdl-folio", text: `CARD ${String(this.index + 1).padStart(2,"0")} / ${String(this.session.length).padStart(2,"0")}` });
    const progress = bar.createDiv({ cls: "pdl-progress" }); progress.createDiv({ cls: "pdl-progress-fill", attr: { style: `width:${(this.index / this.session.length) * 100}%` } });
    const source = bar.createEl("button", { cls: "pdl-source-button", text: card.sourceFile ? card.sourceFile.basename : card.deckTitle }); setIcon(source.createSpan(), "external-link");
    source.onclick = () => card.sourceFile ? this.app.workspace.getLeaf("tab").openFile(card.sourceFile) : this.app.workspace.getLeaf("tab").openFile(card.file);

    const stage = root.createDiv({ cls: "pdl-review-stage" });
    const chapter = stage.createDiv({ cls: "pdl-review-chapter" });
    chapter.createSpan({ text: card.type === "cloze" ? "CLOZE RECALL" : "RECALL PROMPT" });
    chapter.createEl("strong", { text: card.file.parent ? card.file.parent.name : "Vault" });
    
    const cardEl = stage.createDiv({ cls: "pdl-review-card" });

    // Top Card Header Container
    const cardHeader = cardEl.createDiv({ cls: "pdl-card-header" });
    const isShowingQuestion = !this.revealed || this.showQuestionMode;
    const labelText = !this.revealed ? "RECALL BEFORE REVEALING" : (isShowingQuestion ? "QUESTION VIEW" : "SOURCE ANSWER");
    
    // Label + TTS button group
    const labelBox = cardHeader.createDiv({ cls: "pdl-card-label-box" });
    if (this.revealed) labelBox.addClass("is-answer");
    labelBox.createSpan({ cls: "pdl-card-label", text: labelText });

    const ttsBtn = labelBox.createEl("button", { cls: "pdl-tts-button", attr: { "aria-label": "Read aloud", title: "Read aloud (TTS)" } });
    setIcon(ttsBtn, "volume-2");
    ttsBtn.onclick = (e) => {
      e.stopPropagation();
      const speakContent = (card.type === "cloze" && this.revealed) ? parseCloze(card.question).answers.join(", ") : (this.revealed ? `${card.question}. ${card.answer}` : card.question);
      speakText(speakContent);
    };

    // Suspend / bury act on the card and immediately move the session on to the next one.
    const skipCard = () => {
      this.revealed = false; this.selectedChoice = null; this.showQuestionMode = false;
      this.index++;
      this.renderReview();
    };
    const suspendBtn = labelBox.createEl("button", { cls: "pdl-tts-button pdl-suspend-button", attr: { "aria-label": "Suspend this card", title: "Suspend this card (hide from reviews)" } });
    setIcon(suspendBtn, "pause-circle");
    suspendBtn.onclick = async (e) => {
      e.stopPropagation();
      await this.plugin.setSuspended(card, true);
      new Notice(`Đã tạm dừng thẻ: "${truncateLabel(card.question)}".`, 2500);
      skipCard();
    };
    const buryBtn = labelBox.createEl("button", { cls: "pdl-tts-button pdl-bury-button", attr: { "aria-label": "Bury until tomorrow", title: "Bury until tomorrow" } });
    setIcon(buryBtn, "eye-off");
    buryBtn.onclick = async (e) => {
      e.stopPropagation();
      await this.plugin.buryCard(card);
      new Notice(`Đã ẩn thẻ đến mai: "${truncateLabel(card.question)}".`, 2500);
      skipCard();
    };
    
    // Toggle View button when revealed
    if (this.revealed) {
      const toggleBtn = cardHeader.createEl("button", { 
        cls: "pdl-toggle-view", 
        text: isShowingQuestion ? "→ Xem đáp án" : "← Xem câu hỏi" 
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
      } else if (!this.revealed) {
        answer.addClass("is-freeform");
        answer.createEl("p", { cls: "pdl-prompt", text: "Say it aloud, write it down, or reconstruct the answer in your mind." });
        const reveal = answer.createEl("button", { cls: "pdl-reveal", text: "Reveal answer" });
        reveal.onclick = () => this.reveal();
        answer.createEl("kbd", { cls: "pdl-reveal-hint", text: "Space" });
      }

      if (this.revealed) {
        const backToAns = qBox.createEl("button", { cls: "pdl-reveal pdl-back-to-answer", text: "Quay lại đáp án & Đánh giá →" });
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
      const statusText = isMcq ? (isRight ? "CHÍNH XÁC" : "CHƯA ĐÚNG") : "ĐÁP ÁN CHÍNH XÁC";
      const result = answerBox.createDiv({ cls: `pdl-card-result${isMcq ? (isRight ? " is-correct" : " is-wrong") : " is-neutral"}` });
      result.createSpan({ cls: "pdl-card-result-status", text: statusText });

      if (isMcq) {
        const mcqSummary = result.createDiv({ cls: "pdl-mcq-summary" });
        if (isRight) {
          mcqSummary.innerHTML = `Lựa chọn của bạn: <strong class="pdl-text-correct">${formatRichCodeAware(this.selectedChoice)}</strong> — Chính xác!`;
        } else {
          mcqSummary.innerHTML = `Lựa chọn của bạn: <span class="pdl-text-wrong">${formatRichCodeAware(this.selectedChoice)}</span><span class="pdl-mcq-divider">|</span>Đáp án đúng: <strong class="pdl-text-correct">${formatRichCodeAware(card.answer)}</strong>`;
        }
        wireCodeToggles(mcqSummary);
      }

      const answerText = card.type === "cloze" ? parseCloze(card.question).answers.join(", ") : card.answer;

      const mainAnsEl = answerBox.createDiv({ cls: "pdl-main-answer-text" });

      // Answer section
      const ansSection = mainAnsEl.createDiv({ cls: "pdl-answer-section" });
      ansSection.createEl("div", { cls: "pdl-section-label", text: "ĐÁP ÁN CHÍNH XÁC" });
      const ansBody = ansSection.createDiv({ cls: "pdl-section-body" });
      this.renderCardText(ansBody, answerText, { sourcePath: card.sourcePath || (card.file ? card.file.path : "") });

      // Explanation section
      if (card.explanation) {
        const expSection = mainAnsEl.createDiv({ cls: "pdl-explanation-section" });
        expSection.createEl("div", { cls: "pdl-section-label", text: "GIẢI THÍCH CHI TIẾT" });
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

  renderRatings(stage, card) {
    const hint = stage.createEl("p", { cls: "pdl-rate-hint", text: "Rate what you recalled—not how familiar the answer looks" });
    hint.setAttr("aria-live", "polite");
    const ratings = stage.createDiv({ cls: "pdl-ratings" });
    [[1,"Again","10 min"],[2,"Hard","Sooner"],[3,"Good","On schedule"],[4,"Easy","Longer"]].forEach(([grade,label,sub]) => {
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
        new Notice(`"${truncateLabel(card.question)}" sẽ quay lại trong phiên này.`, 1800);
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
    if (!entry) { new Notice("Không còn thao tác nào để hoàn tác."); return; }
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
    new Notice(`Đã hoàn tác: "${truncateLabel(card ? card.question : "")}".`, 1800);
    this.renderReview();
  }

  renderSummary() {
    const root = this.containerEl.children[1]; root.empty(); root.addClass("pdl-flashcard");
    const box = root.createDiv({ cls: "pdl-summary" });
    const icon = box.createSpan({ cls: "pdl-summary-icon" }); setIcon(icon, "sparkles");
    box.createEl("h2", { text: "Review complete" });
    const remembered = this.grades.filter(g => g >= 3).length;
    box.createEl("p", { text: `You recalled ${remembered} of ${this.grades.length} cards. Forgotten and difficult cards will return sooner.` });
    const actions = box.createDiv({ cls: "pdl-summary-actions" });
    if (this.undoStack?.length) {
      const undo = actions.createEl("button", { text: "Undo last answer" });
      undo.onclick = () => void this.undoLastGrade();
    }
    const home = actions.createEl("button", { text: "Back to overview" }); home.onclick = () => this.renderDashboard();
    const again = actions.createEl("button", { cls: "mod-cta", text: "Start another session" }); again.onclick = () => this.startSession();
  }
}
