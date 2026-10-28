/** Deck persistence: finding, reading, writing and appending flashcard notes. */
import { Notice, normalizePath } from "obsidian";
import { nfcText, normalizeCardText, truncateLabel } from "./utils.js";
import { parseCloze } from "./formatting.js";
import { L } from "./i18n.js";

/** Mixed into PDLFlashcardPlugin in plugin.js. */
export class StorageMethods {
  async getCards() {
    const cards = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const output = normalizePath(this.settings.outputFolder);
      if (!(file.path === output || file.path.startsWith(output + "/"))) continue;
      const raw = await this.app.vault.cachedRead(file);
      const match = raw.match(/```pdl-flashcards\s*\n([\s\S]*?)\n```/);
      if (!match) continue;
      try {
        const deck = JSON.parse(match[1]);
        const sourcePath = nfcText(deck.sourcePath);
        const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
        for (const item of Array.isArray(deck.cards) ? deck.cards : []) {
          // Normalize on read too: decks created before this fix may still contain
          // decomposed Vietnamese and would otherwise keep showing broken accents.
          const question = nfcText(item.question);
          const answer = nfcText(item.answer);
          if (!question && !answer) continue;
          cards.push({
            ...item,
            question,
            answer,
            explanation: nfcText(item.explanation),
            choices: Array.isArray(item.choices) ? item.choices.map(nfcText) : item.choices,
            id: item.id || `${file.path}#${cards.length}`,
            heading: question,
            file,
            sourceFile,
            sourcePath,
            deckTitle: nfcText(deck.title) || file.basename,
            tags: Array.isArray(item.tags)
              ? item.tags.map(nfcText)
              : (Array.isArray(deck.tags) ? deck.tags.map(nfcText) : [])
          });
        }
      } catch (error) { console.error("PDL Flashcard: invalid deck", file.path, error); }
    }
    return cards;
  }

  async readDeck(file) {
    const raw = await this.app.vault.cachedRead(file);
    const match = raw.match(/```pdl-flashcards\s*\n([\s\S]*?)\n```/);
    if (!match) throw new Error(L("This note does not contain a PDL flashcard deck.", "Note này không chứa deck flashcard PDL."));
    return { raw, json: match[1], deck: JSON.parse(match[1]) };
  }

  /**
   * Every deck note keeps its source note path inside the linked JSON payload, so
   * a source note maps to exactly one deck. Used by the "generate from selection"
   * action to decide between creating a deck and appending to the existing one.
   */
  async findDeckFileForSource(sourcePath) {
    if (!sourcePath) return null;
    const output = normalizePath(this.settings.outputFolder);
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!(file.path === output || file.path.startsWith(output + "/"))) continue;
      const raw = await this.app.vault.cachedRead(file);
      const match = raw.match(/```pdl-flashcards\s*\n([\s\S]*?)\n```/);
      if (!match) continue;
      try {
        const deck = JSON.parse(match[1]);
        if (deck && deck.sourcePath === sourcePath) return file;
      } catch (_) { /* a malformed deck note is simply not a match */ }
    }
    return null;
  }

  /**
   * Normalize one AI/manual/imported draft into the stored card shape. Returns null
   * when the card carries no usable content, so a partial AI response never writes an
   * empty question. A multiple-choice card whose choices arrived incomplete degrades
   * to a basic card instead of being dropped, which keeps CSV/JSON imports intact.
   */
  normalizeCard(card, id) {
    const requestedType = card.type === "multiple-choice" ? "multiple-choice" : card.type === "cloze" ? "cloze" : "basic";
    const question = normalizeCardText(card.question).trim();
    const rawAnswer = normalizeCardText(card.answer).trim();
    const answer = rawAnswer || (requestedType === "cloze" ? parseCloze(normalizeCardText(card.question)).answers.join(", ") : "");
    if (!question) return null;
    if (requestedType !== "cloze" && !answer) return null;
    let choices;
    let type = requestedType;
    if (requestedType === "multiple-choice") {
      const candidates = Array.isArray(card.choices) ? card.choices.map(value => normalizeCardText(value).trim()) : [];
      if (candidates.length === 4 && candidates.filter(Boolean).length === 4 && candidates.includes(answer)) {
        choices = candidates;
      } else {
        type = "basic";
      }
    }
    return {
      id,
      type,
      question,
      answer,
      choices,
      explanation: normalizeCardText(card.explanation).trim(),
      tags: Array.isArray(card.tags) ? card.tags.map(tag => normalizeCardText(tag).trim()).filter(Boolean) : []
    };
  }

  /**
   * Append freshly generated cards to the deck that already belongs to a source
   * note. Only the flashcard code block is rewritten, so hand-written prose in the
   * deck note stays untouched.
   */
  async appendCardsToDeck(deckFile, drafts) {
    const { raw, json, deck } = await this.readDeck(deckFile);
    const existing = Array.isArray(deck.cards) ? deck.cards : [];
    const existingIds = new Set(existing.map(card => card && card.id));
    const stamp = Date.now();
    const added = [];
    for (const draft of drafts) {
      let id = `${stamp}-${added.length + 1}`;
      while (existingIds.has(id)) id = `${id}b`;
      const card = this.normalizeCard(draft, id);
      if (!card) continue;
      added.push(card);
      existingIds.add(id);
    }
    if (!added.length) throw new Error(L("Nothing new could be added; the AI response contained no usable questions.", "Không có nội dung mới để thêm; phản hồi AI không có câu hỏi dùng được."));
    deck.cards = existing.concat(added);
    if (!deck.createdAt) deck.createdAt = new Date().toISOString();
    deck.generatedBy = deck.generatedBy ? `${deck.generatedBy}+ai-selection` : "ai-selection";
    const match = raw.match(/```pdl-flashcards\s*\n([\s\S]*?)\n```/);
    if (!match) throw new Error(L("This note does not contain a PDL flashcard deck.", "Note này không chứa deck flashcard PDL."));
    const header = raw.slice(0, match.index);
    const footer = raw.slice(match.index + match[0].length);
    const updatedHeader = /^card_count:\s*\d+/m.test(header)
      ? header.replace(/^card_count:\s*\d+/m, `card_count: ${deck.cards.length}`)
      : header;
    const updated = `${updatedHeader}\`\`\`pdl-flashcards\n${JSON.stringify(deck, null, 2)}\n\`\`\`${footer}`;
    await this.app.vault.modify(deckFile, updated);
    const view = this.getView(); if (view) await view.refresh();
    return { added: added.length, total: deck.cards.length, file: deckFile };
  }

  async writeDeck(file, raw, previousJson, deck) {
    const json = JSON.stringify(deck, null, 2);
    let updated = raw.replace(previousJson, json);
    updated = updated.replace(/(^card_count:\s*)\d+/m, `$1${Array.isArray(deck.cards) ? deck.cards.length : 0}`);
    await this.app.vault.modify(file, updated);
    const view = this.getView(); if (view) await view.refresh();
  }

  async updateCard(card, values) {
    const { raw, json, deck } = await this.readDeck(card.file);
    const index = deck.cards.findIndex(item => item.id === card.id);
    if (index < 0) throw new Error(L("The flashcard no longer exists in its deck.", "Flashcard không còn tồn tại trong deck."));
    const current = deck.cards[index];
    const merged = { ...current, ...values, id: card.id };
    const cleanType = merged.type || "basic";
    deck.cards[index] = {
      ...merged,
      type: cleanType,
      question: normalizeCardText(merged.question).trim(),
      answer: normalizeCardText(merged.answer).trim() || (cleanType === "cloze" ? parseCloze(normalizeCardText(merged.question)).answers.join(", ") : ""),
      choices: cleanType === "multiple-choice" && Array.isArray(merged.choices) ? merged.choices.map(value => normalizeCardText(value).trim()) : merged.choices,
      explanation: normalizeCardText(merged.explanation).trim(),
      tags: Array.isArray(merged.tags) ? merged.tags.map(tag => normalizeCardText(tag).trim()).filter(Boolean) : merged.tags
    };
    await this.writeDeck(card.file, raw, json, deck);
  }

  async deleteCard(card) {
    const { raw, json, deck } = await this.readDeck(card.file);
    const before = deck.cards.length;
    deck.cards = deck.cards.filter(item => item.id !== card.id);
    if (deck.cards.length === before) throw new Error(L("The flashcard no longer exists in its deck.", "Flashcard không còn tồn tại trong deck."));
    delete this.settings.schedule[card.id];
    this.settings.reviews = this.settings.reviews.filter(review => review.cardId !== card.id);
    await this.saveData(this.settings);
    await this.writeDeck(card.file, raw, json, deck);
  }

  async createDeck(sourceFile, cards, mode = "manual") {
    await this.ensureOutputFolder();
    const stamp = new Date().toISOString().slice(0, 10);
    const safe = sourceFile.basename.replace(/[\\/:*?"<>|]/g, "-").trim();
    let path = normalizePath(`${this.settings.outputFolder}/${stamp} flashcards ${safe}.md`);
    let suffix = 2;
    while (await this.app.vault.adapter.exists(path)) path = normalizePath(`${this.settings.outputFolder}/${stamp} flashcards ${safe} ${suffix++}.md`);
    const normalized = cards
      .map((card, index) => this.normalizeCard(card, `${Date.now()}-${index + 1}`))
      .filter(Boolean);
    if (!normalized.length) throw new Error(L("No complete flashcards to save.", "Không có flashcard hoàn chỉnh nào để lưu."));
    const payload = { version: 1, title: `Flashcards — ${sourceFile.basename}`, sourcePath: sourceFile.path, createdAt: new Date().toISOString(), generatedBy: mode, cards: normalized };
    const body = `---\ntype: flashcard-deck\nllm_managed: true\nsource_note: "[[${sourceFile.basename}]]"\nsource_path: "${sourceFile.path.replace(/"/g, '\\"')}"\ncard_count: ${normalized.length}\ngenerated_by: ${mode}\n---\n\n# Flashcards — ${sourceFile.basename}\n\nSource: [[${sourceFile.basename}]]\n\n> This deck is managed by PDL Flashcard. You may edit its structured JSON block when needed.\n\n\`\`\`pdl-flashcards\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
    const created = await this.app.vault.create(path, body);
    new Notice(L(`Created ${normalized.length} flashcards in ${this.settings.outputFolder}.`, `Đã tạo ${normalized.length} flashcard trong ${this.settings.outputFolder}.`));
    const view = this.getView(); if (view) await view.refresh();
    return created;
  }
}
