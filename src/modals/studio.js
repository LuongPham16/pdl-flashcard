/** Flashcard Studio: manual drafting and AI generation. */
import { Modal, Notice, setIcon, MarkdownRenderer } from "obsidian";
import { parseCloze, wireCodeToggles } from "../formatting.js";
import { normalizeCardText, truncateLabel } from "../utils.js";
import { DEFAULT_AI_PROMPTS } from "../constants.js";
import { L } from "../i18n.js";
import { ImagePickerModal, insertImageEmbed } from "./image-picker.js";
import { FlashcardBatchModal } from "./batch.js";

class FlashcardStudioModal extends Modal {
  constructor(app, plugin, sourceFile = null, options = {}) {
    super(app); this.plugin = plugin; this.sourcePath = sourceFile?.path || "";
    this.selectedText = String(options.selectedText || "").trim();
    this.autoGenerate = options.autoGenerate === true;
    this.initialCounts = options.counts || null;
    this.initialPromptId = options.promptId || "";
    this.cards = [{ type: "basic", question: "", answer: "", explanation: "", tags: [], choices: ["", "", "", ""] }];
    /** Deck already linked to this source note; when set, saving appends instead of creating. */
    this.targetDeckFile = null;
    this.deckScanStarted = false;
  }

  onOpen() {
    this.isOpen = true;
    this.modalEl.addClass("pdl-studio-modal");
    this.modalEl.addClass("pdl-flashcard");
    this.render();
  }

  onClose() { this.isOpen = false; this.contentEl.empty(); }

  /**
   * Resolve whether this source note already owns a deck. The scan only runs once:
   * later renders (after an AI draft) reuse the result instead of hitting the vault
   * again, and the UI is patched in place so live DOM references stay valid.
   */
  startDeckScan() {
    if (this.deckScanStarted) { this.syncDeckState(); return; }
    this.deckScanStarted = true;
    if (!this.sourcePath) { this.syncDeckState(); return; }
    const source = this.app.vault.getAbstractFileByPath(this.sourcePath);
    if (!source) { this.syncDeckState(); return; }
    void this.plugin.findDeckFileForSource(this.sourcePath).then(file => {
      this.targetDeckFile = file;
      this.syncDeckState();
    }).catch(() => this.syncDeckState());
  }

  /** Footer label that never grows with a long deck name; the full name stays in the tooltip. */
  deckActionLabel(file) {
    return L(`Add to ${truncateLabel(file.basename, 28)}`, `Thêm vào ${truncateLabel(file.basename, 28)}`);
  }

  /** Patch the selection banner and the footer button to the resolved deck state. */
  syncDeckState() {
    if (!this.isOpen) return;
    const panel = this.selectionPanelEl;
    if (panel) {
      panel.toggleClass("is-append", !!this.targetDeckFile);
      const badgeLabel = panel.querySelector(".pdl-selection-badge-label");
      if (badgeLabel) badgeLabel.setText(this.targetDeckFile ? L("APPEND TO THE EXISTING DECK", "BỔ SUNG VÀO DECK ĐÃ CÓ") : L("NEW DECK FOR THIS NOTE", "DECK MỚI CHO NOTE NÀY"));
      const target = panel.querySelector(".pdl-selection-target");
      if (target) {
        target.setText(this.targetDeckFile ? this.targetDeckFile.basename : "");
        target.toggleClass("is-hidden", !this.targetDeckFile);
      }
    }
    if (this.saveButtonEl) {
      this.saveButtonEl.setText(this.targetDeckFile
        ? this.deckActionLabel(this.targetDeckFile)
        : L(`Save to ${this.plugin.settings.outputFolder}`, `Lưu vào ${this.plugin.settings.outputFolder}`));
      if (this.targetDeckFile) this.saveButtonEl.setAttr("title", L(`Add to ${this.targetDeckFile.basename}`, `Thêm vào ${this.targetDeckFile.basename}`));
    }
  }

  getSourceFiles() {
    return this.app.vault.getMarkdownFiles()
      .filter(file => this.plugin.isConfiguredSource(file))
      .sort((a, b) => a.path.localeCompare(b.path, "vi"));
  }

  render() {
    const root = this.contentEl; root.empty();
    const header = root.createDiv({ cls: "pdl-studio-head" });
    const headerCopy = header.createDiv({ cls: "pdl-studio-head-copy" });
    headerCopy.createSpan({ text: L("FLASHCARD STUDIO", "XƯỞNG FLASHCARD") });
    headerCopy.createEl("h2", { text: L("Build a flashcard deck", "Tạo bộ flashcard") });
    headerCopy.createEl("p", { text: L("Turn one source note into an editable set of questions, then save only what is worth remembering.", "Chuyển một note nguồn thành bộ câu hỏi có thể chỉnh sửa, rồi chỉ lưu những gì đáng nhớ.") });
    const draftTotal = header.createDiv({ cls: "pdl-studio-total" });
    draftTotal.createEl("strong", { text: String(this.cards.length) });
    draftTotal.createSpan({ text: this.cards.length === 1 ? "CARD\nIN DRAFT" : "CARDS\nIN DRAFT" });

    const sourceRow = root.createDiv({ cls: "pdl-studio-source" });
    const batchRow = root.createDiv({ cls: "pdl-batch-row" });
    const batchButton = batchRow.createEl("button", { cls: "pdl-batch-open", text: L("Create decks from a folder", "Tạo deck từ folder") });
    setIcon(batchButton.createSpan(), "folder-tree");
    batchButton.onclick = () => new FlashcardBatchModal(this.app, this.plugin).open();
    const sourceLabel = sourceRow.createDiv({ cls: "pdl-studio-source-label" });
    const sourceIcon = sourceLabel.createSpan(); setIcon(sourceIcon, "file-text");
    const sourceCopy = sourceLabel.createDiv(); sourceCopy.createEl("strong", { text: L("Source note", "Note nguồn") }); sourceCopy.createSpan({ text: L("The original note stays unchanged", "Note gốc không bị thay đổi") });
    // Custom searchable dropdown — debounced + batched for performance
    const sourceFiles = this.getSourceFiles();
    const dropWrapper = sourceRow.createDiv({ cls: 'pdl-source-picker' });

    // Show selected note as a styled badge when one is chosen
    const dropSelected = dropWrapper.createDiv({ cls: 'pdl-source-picker__selected' + (this.sourcePath ? '' : ' is-hidden') });
    const dropSelectedName = dropSelected.createSpan({ cls: 'pdl-source-picker__selected-name' });
    const dropSelectedClear = dropSelected.createSpan({ cls: 'pdl-source-picker__selected-clear', text: '✕' });
    if (this.sourcePath) {
      const bn = this.sourcePath.split('/').pop().replace(/\.md$/, '');
      dropSelectedName.textContent = bn;
    }

    const dropTrigger = dropWrapper.createDiv({ cls: 'pdl-source-picker__trigger' + (this.sourcePath ? ' is-hidden' : '') });
    dropTrigger.createSpan({ cls: 'pdl-source-picker__trigger-text', text: L('— Choose a note —', '— Chọn một note —') });
    dropTrigger.createSpan({ cls: 'pdl-source-picker__trigger-icon', text: '▾' });

    const dropPanel = dropWrapper.createDiv({ cls: 'pdl-source-picker__panel' });

    const dropSearch = dropPanel.createEl('input', {
      cls: 'pdl-source-picker__search',
      attr: { type: 'text', placeholder: L('Search notes…', 'Tìm note…'), autocomplete: 'off', spellcheck: 'false' }
    });
    const dropCount = dropPanel.createDiv({ cls: 'pdl-source-picker__count' });
    const dropList = dropPanel.createDiv({ cls: 'pdl-source-picker__list' });

    let activeIndex = -1;
    let lastMatches = [];
    let debounceTimer = null;

    const highlightText = (text, query) => {
      if (!query) return document.createTextNode(text);
      const idx = text.toLowerCase().indexOf(query.toLowerCase());
      if (idx < 0) return document.createTextNode(text);
      const span = document.createDocumentFragment();
      span.appendChild(document.createTextNode(text.slice(0, idx)));
      const mark = document.createElement('mark');
      mark.className = 'pdl-source-picker__mark';
      mark.textContent = text.slice(idx, idx + query.length);
      span.appendChild(mark);
      span.appendChild(document.createTextNode(text.slice(idx + query.length)));
      return span;
    };

    const setActive = (idx) => {
      const items = dropList.querySelectorAll('.pdl-source-picker__item');
      items.forEach((el, i) => el.classList.toggle('is-active', i === idx));
      if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
      activeIndex = idx;
    };

    const renderDropItems = (filter) => {
      dropList.empty();
      activeIndex = -1;
      const q = (filter || '').toLowerCase().trim();
      lastMatches = q
        ? sourceFiles.filter(f => f.path.toLowerCase().includes(q))
        : sourceFiles;
      const shown = lastMatches.slice(0, 40);
      dropCount.textContent = lastMatches.length > 40
        ? L(`Showing 40 of ${lastMatches.length} notes — type to filter`, `Hiển thị 40/${lastMatches.length} note — gõ để lọc`)
        : L(`${lastMatches.length} notes`, `${lastMatches.length} note`);

      if (!shown.length) {
        dropList.createDiv({ cls: 'pdl-source-picker__empty', text: L('No notes found', 'Không tìm thấy note') });
        return;
      }

      // Use DocumentFragment for batch insertion — prevents layout thrashing
      const frag = document.createDocumentFragment();
      for (const file of shown) {
        const item = document.createElement('div');
        item.className = 'pdl-source-picker__item';
        const name = file.basename || file.path.split('/').pop().replace(/\.md$/, '');
        const folder = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '';
        const nameEl = document.createElement('span');
        nameEl.className = 'pdl-source-picker__item-name';
        nameEl.appendChild(highlightText(name, filter));
        item.appendChild(nameEl);
        if (folder) {
          const pathEl = document.createElement('span');
          pathEl.className = 'pdl-source-picker__item-path';
          pathEl.textContent = folder;
          item.appendChild(pathEl);
        }
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectFile(file);
        });
        frag.appendChild(item);
      }
      dropList.appendChild(frag);
    };

    const openPanel = () => {
      dropPanel.addClass('is-open');
      dropSearch.value = '';
      renderDropItems('');
      window.requestAnimationFrame(() => dropSearch.focus());
    };

    const closePanel = () => {
      dropPanel.removeClass('is-open');
      dropSearch.value = '';
      activeIndex = -1;
    };

    const selectFile = (file) => {
      this.sourcePath = file.path;
      const bn = file.path.split('/').pop().replace(/\.md$/, '');
      dropSelectedName.textContent = bn;
      dropSelected.classList.remove('is-hidden');
      dropTrigger.classList.add('is-hidden');
      closePanel();
    };

    dropTrigger.addEventListener('click', openPanel);

    dropSelectedClear.addEventListener('click', (e) => {
      e.stopPropagation();
      this.sourcePath = '';
      dropSelected.classList.add('is-hidden');
      dropTrigger.classList.remove('is-hidden');
    });

    dropSearch.addEventListener('input', () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => renderDropItems(dropSearch.value), 120);
    });

    dropSearch.addEventListener('keydown', (e) => {
      const items = dropList.querySelectorAll('.pdl-source-picker__item');
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIndex + 1, items.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIndex - 1, 0)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && lastMatches[activeIndex]) selectFile(lastMatches[activeIndex]);
      }
      else if (e.key === 'Escape') closePanel();
    });

    // Close when clicking outside
    document.addEventListener('mousedown', (e) => {
      if (!dropWrapper.contains(e.target)) closePanel();
    }, { capture: true });

    if (this.selectedText) this.renderSelectionPanel(root);

    const ai = root.createDiv({ cls: "pdl-ai-builder" });
    const aiCopy = ai.createDiv({ cls: "pdl-ai-copy" });
    const aiIcon = aiCopy.createSpan(); setIcon(aiIcon, "sparkles");
    const aiText = aiCopy.createDiv();
    aiText.createEl("strong", { text: L("Generate an AI draft", "Tạo bản nháp bằng AI") });
    aiText.createEl("p", { text: this.selectedText ? L("AI reads only the highlighted passage, not the whole note.", "AI chỉ đọc đoạn được bôi đen, không đọc toàn bộ note.") : L("AI reads only the selected note. You remain in control of every card.", "AI chỉ đọc note đã chọn. Bạn vẫn kiểm soát từng thẻ.") });
    aiText.createEl("p", { cls: "pdl-ai-tag-rule", text: L("Tags: AI may reuse existing tags only; new tags are ignored.", "Tags: AI chỉ được dùng lại tag đã có; tag mới sẽ bị bỏ qua.") });

    const counts = ai.createDiv({ cls: "pdl-ai-counts" });
    const settings = this.plugin.settings;
    const countDefaults = this.initialCounts || {
      basic: Number(settings.defaultBasicCount ?? 4),
      mcq: Number(settings.defaultMcqCount ?? 3),
      cloze: Number(settings.defaultClozeCount ?? 3)
    };

    counts.createEl("label", { text: L("Q&A", "Hỏi đáp") });
    const basicCount = counts.createEl("input", { attr: { type: "number", min: "0", max: "30", value: String(countDefaults.basic ?? 4) } });

    counts.createEl("label", { text: "MCQ" });
    const mcqCount = counts.createEl("input", { attr: { type: "number", min: "0", max: "30", value: String(countDefaults.mcq ?? 3) } });

    counts.createEl("label", { text: L("Cloze", "Điền khuyết") });
    const clozeCount = counts.createEl("input", { attr: { type: "number", min: "0", max: "30", value: String(countDefaults.cloze ?? 3) } });

    const promptSelect = counts.createEl("select", { cls: "pdl-ai-prompt-select", attr: { title: L("Select AI Prompt Preset", "Chọn prompt AI") } });
    const prompts = this.plugin.settings.aiPrompts || DEFAULT_AI_PROMPTS;
    prompts.forEach(p => {
      promptSelect.createEl("option", { text: p.name, attr: { value: p.id } });
    });
    promptSelect.value = this.initialPromptId || this.plugin.settings.selectedPromptId || "default";
    promptSelect.onchange = async () => {
      this.plugin.settings.selectedPromptId = promptSelect.value;
      await this.plugin.saveData(this.plugin.settings);
    };

    const reverseToggle = counts.createEl("label", { cls: "pdl-reverse-toggle", attr: { title: L("Create reverse cards", "Tạo thẻ 2 chiều") } });
    const reverseCheck = reverseToggle.createEl("input", { attr: { type: "checkbox" } });
    reverseCheck.checked = this.plugin.settings.defaultReverseCards === true;
    reverseToggle.createSpan({ text: L("Create reverse cards", "Tạo thẻ 2 chiều") });

    const generate = counts.createEl("button", { cls: "mod-cta", text: L("Generate with AI", "Tạo bằng AI") });
    this.runAIGeneration = options => this.generateDraft(options);
    generate.onclick = () => this.runAIGeneration({
      generate,
      source: this.sourcePath ? this.app.vault.getAbstractFileByPath(this.sourcePath) : null,
      counts: {
        basic: Number(basicCount.value) || 0,
        mcq: Number(mcqCount.value) || 0,
        cloze: Number(clozeCount.value) || 0
      },
      promptId: promptSelect.value,
      reverse: reverseCheck.checked
    });

    if (this.autoGenerate) {
      this.autoGenerate = false;
      const autoOptions = {
        generate,
        counts: { basic: Number(basicCount.value) || 0, mcq: Number(mcqCount.value) || 0, cloze: Number(clozeCount.value) || 0 },
        promptId: promptSelect.value,
        reverse: reverseCheck.checked
      };
      // Give the modal a frame to paint, then let the deck scan settle before firing.
      window.setTimeout(() => this.startDeckScan(), 150);
      window.setTimeout(() => { void this.generateDraft({ ...autoOptions, source: this.sourcePath ? this.app.vault.getAbstractFileByPath(this.sourcePath) : null }); }, 300);
    }

    const editorHead = root.createDiv({ cls: "pdl-editor-head" });
    const editorTitle = editorHead.createDiv(); editorTitle.createSpan({ text: L("DRAFT WORKSPACE", "BẢN NHÁP") }); editorTitle.createEl("h3", { text: L("Questions", "Câu hỏi") });
    const add = editorHead.createEl("button", { cls: "pdl-studio-add" }); const addIcon = add.createSpan(); setIcon(addIcon, "plus"); add.createSpan({ text: L("Add question", "Thêm câu hỏi") });
    add.onclick = () => { this.cards.push({ type: "basic", question: "", answer: "", explanation: "", tags: [], choices: ["", "", "", ""] }); this.render(); };
    const list = root.createDiv({ cls: "pdl-card-editors" });
    this.cards.forEach((card, index) => this.renderCardEditor(list, card, index));

    const footer = root.createDiv({ cls: "pdl-studio-footer" });
    const footerNote = footer.createDiv(); footerNote.createEl("strong", { text: L("Ready when you are", "Sẵn sàng khi bạn muốn") }); footerNote.createSpan({ text: L("Incomplete cards are skipped automatically.", "Thẻ chưa hoàn chỉnh sẽ tự động bị bỏ qua.") });
    const footerActions = footer.createDiv();
    const cancel = footerActions.createEl("button", { text: L("Cancel", "Hủy") }); cancel.onclick = () => this.close();
    const saveLabel = this.targetDeckFile ? this.deckActionLabel(this.targetDeckFile) : L(`Save to ${this.plugin.settings.outputFolder}`, `Lưu vào ${this.plugin.settings.outputFolder}`);
    const save = footerActions.createEl("button", { cls: "mod-cta", text: saveLabel });
    this.saveButtonEl = save;
    save.onclick = async () => {
      if (!this.sourcePath) { new Notice(L("Choose a source note first.", "Hãy chọn một note nguồn trước.")); return; }
      const valid = this.cards.filter(card => {
        if (card.type === "cloze") return card.question.trim().length > 0;
        return card.question.trim() && card.answer.trim();
      });
      const broken = valid.find(card => card.type === "multiple-choice" && (card.choices.filter(Boolean).length !== 4 || !card.choices.includes(card.answer)));
      if (!valid.length) { new Notice(L("Add at least one complete question and answer.", "Hãy thêm ít nhất một câu hỏi và đáp án hoàn chỉnh.")); return; }
      if (broken) { new Notice(L("Every multiple-choice card needs exactly four choices, and its answer must exactly match one choice.", "Mỗi câu trắc nghiệm cần đúng bốn lựa chọn và đáp án phải trùng khớp một lựa chọn.")); return; }
      const source = this.app.vault.getAbstractFileByPath(this.sourcePath);
      if (!source) { new Notice(L("The source note could not be found.", "Không tìm thấy note nguồn.")); return; }
      save.disabled = true;
      try {
        // A deck already linked to this note means "supplement", not "duplicate".
        const existingDeck = this.targetDeckFile || await this.plugin.findDeckFileForSource(this.sourcePath);
        if (existingDeck) {
          const result = await this.plugin.appendCardsToDeck(existingDeck, valid);
          new Notice(L(`Added ${result.added} flashcards to ${existingDeck.basename}.`, `Đã thêm ${result.added} flashcard vào ${existingDeck.basename}.`));
        } else {
          await this.plugin.createDeck(source, valid, this.selectedText ? "ai-selection" : "manual-or-ai-reviewed");
        }
        this.close();
      } catch (error) { new Notice(L(`Could not save: ${error.message || error}`, `Không thể lưu: ${error.message || error}`)); save.disabled = false; }
    };

    this.startDeckScan();
  }

  /** Highlighted-passage banner: shows exactly what the AI will read. */
  renderSelectionPanel(root) {
    const box = root.createDiv({ cls: "pdl-selection-panel" });
    if (this.targetDeckFile) box.addClass("is-append");
    const head = box.createDiv({ cls: "pdl-selection-head" });
    const badge = head.createSpan({ cls: "pdl-selection-badge" });
    const badgeIcon = badge.createSpan(); setIcon(badgeIcon, "highlighter");
    badge.createSpan({ cls: "pdl-selection-badge-label", text: this.targetDeckFile ? L("APPEND TO THE EXISTING DECK", "BỔ SUNG VÀO DECK ĐÃ CÓ") : L("NEW DECK FOR THIS NOTE", "DECK MỚI CHO NOTE NÀY") });
    head.createEl("strong", { text: L(`${this.selectedText.length} characters selected`, `${this.selectedText.length} ký tự được bôi đen`) });
    head.createSpan({ cls: `pdl-selection-target${this.targetDeckFile ? "" : " is-hidden"}`, text: this.targetDeckFile ? this.targetDeckFile.basename : "" });
    const preview = box.createEl("blockquote", { cls: "pdl-selection-text" });
    preview.setText(this.selectedText.length > 900 ? `${this.selectedText.slice(0, 900)}…` : this.selectedText);
    this.selectionPanelEl = box;
  }

  /**
   * Single AI generation path shared by the manual button and the auto-run that
   * follows the right-click action. Cards produced here are only a draft: the user
   * still reviews and saves them through the normal studio footer.
   */
  async generateDraft(options = {}) {
    const { generate, source, counts: countsPayload, promptId, reverse } = options;
    if (!this.sourcePath) { new Notice(L("Choose a source note first.", "Hãy chọn một note nguồn trước.")); return; }
    if (!source) { new Notice(L("The source note could not be found.", "Không tìm thấy note nguồn.")); return; }
    if (generate) { generate.disabled = true; generate.setText(this.selectedText ? L("AI is reading the selection…", "AI đang đọc đoạn được chọn…") : L("AI is reading the note…", "AI đang đọc note…")); }
    try {
      const generated = this.selectedText
        ? await this.plugin.generateWithAIText(source, this.selectedText, countsPayload, promptId)
        : await this.plugin.generateWithAI(source, countsPayload, promptId);
      if (!generated.length) throw new Error(L("AI did not generate any questions.", "AI không tạo được câu hỏi nào."));

      const parsedCards = generated.map(card => {
        const type = card.type === "multiple-choice" ? "multiple-choice" : card.type === "cloze" ? "cloze" : "basic";
        const choices = Array.isArray(card.choices) ? [...card.choices].slice(0, 4) : ["", "", "", ""];
        while (choices.length < 4) choices.push("");
        return {
          type,
          question: normalizeCardText(card.question || ""),
          answer: normalizeCardText(card.answer || (type === "cloze" ? parseCloze(card.question || "").answers.join(", ") : "")),
          explanation: normalizeCardText(card.explanation || ""),
          tags: Array.isArray(card.tags) ? card.tags.map(tag => normalizeCardText(tag)).filter(Boolean) : [],
          choices: choices.map(choice => normalizeCardText(choice))
        };
      });

      this.cards = [];
      parsedCards.forEach(card => {
        this.cards.push(card);
        if (reverse && card.type === "basic") {
          this.cards.push({
            ...card,
            question: card.answer,
            answer: card.question,
            explanation: (card.explanation ? card.explanation + "\n\n" : "") + L("*(Reverse card)*", "*(Thẻ đảo chiều)*")
          });
        }
      });

      this.render();
      new Notice(L(`AI generated ${this.cards.length} questions. Review them before saving.`, `AI đã tạo ${this.cards.length} câu hỏi. Hãy xem lại trước khi lưu.`));
    } catch (error) {
      new Notice(error.message || String(error));
      if (generate && generate.isConnected) { generate.disabled = false; generate.setText(L("Generate with AI", "Tạo bằng AI")); }
    }
  }

  renderCardEditor(parent, card, index) {
    const box = parent.createDiv({ cls: "pdl-card-editor" });
    const top = box.createDiv({ cls: "pdl-card-editor-top" });
    top.createEl("strong", { text: L(`Question ${String(index + 1).padStart(2, "0")}`, `Câu hỏi ${String(index + 1).padStart(2, "0")}`) });
    const type = top.createEl("select");
    type.createEl("option", { text: L("Question and answer", "Hỏi và đáp"), attr: { value: "basic" } });
    type.createEl("option", { text: L("Cloze deletion", "Điền khuyết"), attr: { value: "cloze" } });
    type.createEl("option", { text: L("Four-choice question", "Câu hỏi bốn lựa chọn"), attr: { value: "multiple-choice" } });
    type.value = card.type; type.onchange = () => { card.type = type.value; this.render(); };
    const remove = top.createEl("button", { cls: "pdl-remove-card", attr: { "aria-label": L(`Delete question ${index + 1}`, `Xóa câu hỏi ${index + 1}`) } }); setIcon(remove, "trash-2");
    remove.onclick = () => { this.cards.splice(index, 1); this.render(); };

    const preview = box.createDiv({ cls: "pdl-card-preview" });
    const updatePreview = () => { void this.renderDraftPreview(preview, card); };

    this.addTextarea(box, card.type === "cloze" ? L("Statement with {{c1::hidden text}} or ==hidden text==", "Câu với {{c1::chữ ẩn}} hoặc ==chữ ẩn==") : L("Question", "Câu hỏi"), card.question, value => { card.question = value; updatePreview(); });
    if (card.type === "multiple-choice") {
      const grid = box.createDiv({ cls: "pdl-choice-editor" });
      for (let i = 0; i < 4; i++) {
        const label = grid.createEl("label"); label.createSpan({ text: L(`Choice ${String.fromCharCode(65 + i)}`, `Lựa chọn ${String.fromCharCode(65 + i)}`) });
        const input = label.createEl("input", { attr: { type: "text" } }); input.value = card.choices[i] || "";
        input.oninput = () => { card.choices[i] = input.value; updatePreview(); };
      }
    }
    if (card.type !== "cloze") {
      this.addTextarea(box, card.type === "multiple-choice" ? L("Correct answer (must exactly match one choice)", "Đáp án đúng (phải trùng khớp một lựa chọn)") : L("Answer", "Đáp án"), card.answer, value => { card.answer = value; updatePreview(); });
    }
    this.addTextarea(box, L("Tags (comma separated, e.g. biology, exam)", "Tags (phân cách bằng dấu phẩy, ví dụ devops, eng)"), (card.tags || []).join(", "), value => {
      card.tags = value.split(",").map(t => t.trim()).filter(Boolean);
      updatePreview();
    }, true, false);
    this.addTextarea(box, L("Explanation (optional)", "Giải thích (không bắt buộc)"), card.explanation || "", value => { card.explanation = value; updatePreview(); }, true);

    updatePreview();
  }

  /** Live preview of how the drafted card will look, so code is visible before saving. */
  async renderDraftPreview(preview, card) {
    preview.empty();
    preview.createDiv({ cls: "pdl-card-preview-label", text: L("Preview", "Xem trước") });
    const body = preview.createDiv({ cls: "pdl-card-preview-body" });
    const render = async (el, text) => {
      el.empty();
      try {
        await MarkdownRenderer.render(this.app, String(text || ""), el, "", this);
      } catch (_) {
        el.setText(String(text || ""));
      }
    };

    const question = async box => {
      const el = box.createEl("h4", { cls: "pdl-question-text" });
      await render(el, card.question || "");
    };
    const explanation = async box => {
      if (!card.explanation) return;
      box.createDiv({ cls: "pdl-section-label", text: L("DETAILED EXPLANATION", "GIẢI THÍCH CHI TIẾT") });
      const el = box.createDiv({ cls: "pdl-section-body pdl-rich markdown-rendered" });
      await render(el, card.explanation);
    };

    if (card.type === "multiple-choice") {
      await question(body);
      const choices = body.createDiv({ cls: "pdl-choices" });
      for (let choiceIndex = 0; choiceIndex < (card.choices || []).length; choiceIndex++) {
        const choice = card.choices[choiceIndex];
        if (!String(choice || "").trim()) continue;
        const row = choices.createEl("button", { cls: "pdl-choice" });
        row.disabled = true;
        row.createSpan({ cls: "pdl-choice-key", text: String.fromCharCode(65 + choiceIndex) });
        const text = row.createSpan({ cls: "pdl-choice-text" });
        await render(text, choice);
        if (String(choice).trim() === String(card.answer || "").trim()) row.addClass("is-correct");
      }
      await explanation(body);
      wireCodeToggles(preview);
      return;
    }

    await question(body);
    const answerText = card.type === "cloze" ? parseCloze(card.question || "").answers.join(", ") : (card.answer || "");
    if (!String(answerText).trim() && !card.explanation) {
      wireCodeToggles(preview);
      return;
    }
    body.createDiv({ cls: "pdl-section-label", text: L("CORRECT ANSWER", "ĐÁP ÁN CHÍNH XÁC") });
    if (String(answerText).trim()) {
      const answerBody = body.createDiv({ cls: "pdl-section-body pdl-rich markdown-rendered" });
      await render(answerBody, answerText);
    }
    await explanation(body);
    wireCodeToggles(preview);
  }

  addTextarea(parent, labelText, value, onChange, compact = false, allowImage = true) {
    const label = parent.createEl("label", { cls: "pdl-editor-field" });
    const head = label.createDiv({ cls: "pdl-field-head" });
    head.createSpan({ text: labelText });
    if (allowImage) {
      const insert = head.createEl("button", {
        cls: "pdl-insert-image",
        text: L("Image", "Ảnh"),
        attr: { type: "button", title: L("Insert an image into this field", "Chèn ảnh vào ô này") }
      });
      insert.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        new ImagePickerModal(this.app, this.plugin, path => {
          insertImageEmbed(field, path);
          onChange(field.value);
        }).open();
      };
    }
    const field = label.createEl("textarea", { cls: compact ? "is-compact" : "" });
    field.value = value || "";
    field.oninput = () => onChange(field.value);
  }
}

/**
 * Landing dialog for the right-click "generate flashcards from selection" action.
 * It confirms which passage was captured, whether a new deck will be created or an
 * existing one extended, and the draft size before handing over to the studio.
 */

export { FlashcardStudioModal };
