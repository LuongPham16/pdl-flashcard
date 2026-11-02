/** Bulk card actions and deck creation/merge dialogs. */
import { Modal, Notice } from "obsidian";
import { L } from "../i18n.js";

class BulkTagModal extends Modal {
  constructor(app, plugin, cards, onDone) {
    super(app);
    this.plugin = plugin;
    this.cards = cards;
    this.onDone = onDone;
  }

  onOpen() {
    this.modalEl.addClass("pdl-deck-action-modal");
    const root = this.contentEl;
    root.createSpan({ cls: "pdl-edit-kicker", text: L("BULK EDIT", "SỬA HÀNG LOẠT") });
    root.createEl("h2", { text: L("Edit tags", "Sửa tag") });
    root.createEl("p", { cls: "pdl-edit-context", text: L(`${this.cards.length} selected cards will be updated.`, `${this.cards.length} thẻ được chọn sẽ được cập nhật.`) });
    const addLabel = root.createEl("label", { cls: "pdl-editor-field" });
    addLabel.createSpan({ text: L("Tags to add", "Tag cần thêm") });
    const add = addLabel.createEl("input", { attr: { type: "text", placeholder: "math, exam" } });
    const removeLabel = root.createEl("label", { cls: "pdl-editor-field" });
    removeLabel.createSpan({ text: L("Tags to remove", "Tag cần xóa") });
    const remove = removeLabel.createEl("input", { attr: { type: "text", placeholder: "old-tag" } });
    const error = root.createDiv({ cls: "pdl-form-error" });
    const footer = root.createDiv({ cls: "pdl-edit-footer" });
    const cancel = footer.createEl("button", { text: L("Cancel", "Hủy") });
    cancel.onclick = () => this.close();
    const save = footer.createEl("button", { cls: "mod-cta", text: L("Apply tags", "Áp dụng") });
    save.onclick = async () => {
      const addTags = add.value.split(",").map(value => value.trim()).filter(Boolean);
      const removeTags = remove.value.split(",").map(value => value.trim()).filter(Boolean);
      if (!addTags.length && !removeTags.length) { error.setText(L("Add or remove at least one tag.", "Hãy thêm hoặc xóa ít nhất một tag.")); return; }
      save.disabled = true;
      try {
        await this.plugin.bulkUpdateTags(this.cards, addTags, removeTags);
        this.close();
        if (this.onDone) await this.onDone();
      } catch (err) {
        error.setText(err.message || String(err));
        new Notice(err.message || String(err));
        save.disabled = false;
      }
    };
  }
}

class MoveCardsModal extends Modal {
  constructor(app, plugin, cards, onDone) {
    super(app);
    this.plugin = plugin;
    this.cards = cards;
    this.onDone = onDone;
  }

  onOpen() {
    this.modalEl.addClass("pdl-deck-action-modal");
    const root = this.contentEl;
    root.createSpan({ cls: "pdl-edit-kicker", text: L("BULK EDIT", "SỬA HÀNG LOẠT") });
    root.createEl("h2", { text: L("Move cards", "Chuyển thẻ") });
    root.createEl("p", { cls: "pdl-edit-context", text: L(`${this.cards.length} cards will move to the target deck.`, `${this.cards.length} thẻ sẽ được chuyển sang deck đích.`) });
    const label = root.createEl("label", { cls: "pdl-editor-field" });
    label.createSpan({ text: L("Target deck", "Deck đích") });
    const select = label.createEl("select");
    const decks = new Map();
    this.plugin.getCards().then(cards => {
      cards.forEach(card => decks.set(card.file.path, card.deckTitle || card.file.basename));
      const current = new Set(this.cards.map(card => card.file.path));
      [...decks.entries()].filter(([path]) => !current.has(path)).sort((a, b) => a[1].localeCompare(b[1], "vi"))
        .forEach(([path, title]) => select.createEl("option", { text: title, attr: { value: path } }));
      if (!select.options.length) select.createEl("option", { text: L("No other decks", "Không có deck khác"), attr: { value: "" } });
    });
    const error = root.createDiv({ cls: "pdl-form-error" });
    const footer = root.createDiv({ cls: "pdl-edit-footer" });
    const cancel = footer.createEl("button", { text: L("Cancel", "Hủy") });
    cancel.onclick = () => this.close();
    const save = footer.createEl("button", { cls: "mod-cta", text: L("Move", "Chuyển") });
    save.onclick = async () => {
      if (!select.value) { error.setText(L("Choose a target deck.", "Hãy chọn deck đích.")); return; }
      save.disabled = true;
      try {
        const target = this.app.vault.getAbstractFileByPath(select.value);
        await this.plugin.moveCards(this.cards, target);
        this.close();
        if (this.onDone) await this.onDone();
      } catch (err) {
        error.setText(err.message || String(err));
        save.disabled = false;
      }
    };
  }
}

class BulkDeleteModal extends Modal {
  constructor(app, plugin, cards, onDone) {
    super(app);
    this.plugin = plugin;
    this.cards = cards;
    this.onDone = onDone;
  }

  onOpen() {
    this.modalEl.addClass("pdl-deck-action-modal");
    const root = this.contentEl;
    root.createSpan({ cls: "pdl-edit-kicker", text: L("BULK DELETE", "XÓA HÀNG LOẠT") });
    root.createEl("h2", { text: L("Delete selected cards?", "Xóa các thẻ đã chọn?") });
    root.createEl("p", { cls: "pdl-edit-context", text: L(`${this.cards.length} cards and their review history will be removed. The source notes are not changed.`, `${this.cards.length} thẻ và lịch sử ôn sẽ bị xóa. Note nguồn không bị thay đổi.`) });
    const footer = root.createDiv({ cls: "pdl-edit-footer" });
    const cancel = footer.createEl("button", { text: L("Cancel", "Hủy") });
    cancel.onclick = () => this.close();
    const remove = footer.createEl("button", { cls: "mod-warning", text: L("Delete cards", "Xóa thẻ") });
    remove.onclick = async () => {
      remove.disabled = true;
      try {
        await this.plugin.bulkDeleteCards(this.cards);
        new Notice(L(`Deleted ${this.cards.length} cards.`, `Đã xóa ${this.cards.length} thẻ.`));
        this.close();
        if (this.onDone) await this.onDone();
      } catch (err) {
        new Notice(err.message || String(err));
        remove.disabled = false;
      }
    };
  }
}

class CreateDeckModal extends Modal {
  constructor(app, plugin, onDone) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
  }

  onOpen() {
    this.modalEl.addClass("pdl-deck-action-modal");
    const root = this.contentEl;
    root.createSpan({ cls: "pdl-edit-kicker", text: L("NEW DECK", "DECK MỚI") });
    root.createEl("h2", { text: L("Create an empty deck", "Tạo deck rỗng") });
    const label = root.createEl("label", { cls: "pdl-editor-field" });
    label.createSpan({ text: L("Deck name", "Tên deck") });
    const input = label.createEl("input", { attr: { type: "text", placeholder: L("My new deck", "Deck mới") } });
    const error = root.createDiv({ cls: "pdl-form-error" });
    const footer = root.createDiv({ cls: "pdl-edit-footer" });
    const cancel = footer.createEl("button", { text: L("Cancel", "Hủy") });
    cancel.onclick = () => this.close();
    const save = footer.createEl("button", { cls: "mod-cta", text: L("Create deck", "Tạo deck") });
    save.onclick = async () => {
      save.disabled = true;
      try {
        await this.plugin.createEmptyDeck(input.value);
        new Notice(L("Empty deck created.", "Đã tạo deck rỗng."));
        this.close();
        if (this.onDone) await this.onDone();
      } catch (err) {
        error.setText(err.message || String(err));
        save.disabled = false;
      }
    };
  }
}

class MergeDecksModal extends Modal {
  constructor(app, plugin, sourceFile, targetFile, onDone) {
    super(app);
    this.plugin = plugin;
    this.sourceFile = sourceFile;
    this.targetFile = targetFile;
    this.onDone = onDone;
  }

  onOpen() {
    this.modalEl.addClass("pdl-deck-action-modal");
    const root = this.contentEl;
    root.createSpan({ cls: "pdl-edit-kicker", text: L("MERGE DECKS", "GỘP DECK") });
    root.createEl("h2", { text: L("Merge decks", "Gộp deck") });
    root.createEl("p", { cls: "pdl-edit-context", text: L("Cards from the source deck move into the target deck, then the source deck is removed.", "Thẻ từ deck nguồn sẽ chuyển sang deck đích, sau đó deck nguồn bị xóa.") });
    const label = root.createEl("label", { cls: "pdl-editor-field" });
    label.createSpan({ text: L("Target deck", "Deck đích") });
    const select = label.createEl("select");
    select.createEl("option", { text: L("Choose a deck…", "Chọn deck…"), attr: { value: "" } });
    this.plugin.getCards().then(cards => {
      const decks = new Map(cards.map(card => [card.file.path, card.deckTitle || card.file.basename]));
      [...decks.entries()].filter(([path]) => path !== this.sourceFile.path).sort((a, b) => a[1].localeCompare(b[1], "vi"))
        .forEach(([path, title]) => select.createEl("option", { text: title, attr: { value: path } }));
    });
    const error = root.createDiv({ cls: "pdl-form-error" });
    const footer = root.createDiv({ cls: "pdl-edit-footer" });
    const cancel = footer.createEl("button", { text: L("Cancel", "Hủy") });
    cancel.onclick = () => this.close();
    const merge = footer.createEl("button", { cls: "mod-cta", text: L("Merge", "Gộp") });
    merge.onclick = async () => {
      const target = this.app.vault.getAbstractFileByPath(select.value);
      if (!target) { error.setText(L("Choose a target deck.", "Hãy chọn deck đích.")); return; }
      merge.disabled = true;
      try {
        await this.plugin.mergeDecks(this.sourceFile, target);
        new Notice(L("Decks merged.", "Đã gộp deck."));
        this.close();
        if (this.onDone) await this.onDone();
      } catch (err) {
        error.setText(err.message || String(err));
        merge.disabled = false;
      }
    };
  }
}

class ArchiveDecksModal extends Modal {
  constructor(app, plugin, onDone) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
  }

  async onOpen() {
    this.modalEl.addClass("pdl-deck-action-modal");
    await this.render();
  }

  async render() {
    const root = this.contentEl;
    root.empty();
    root.createSpan({ cls: "pdl-edit-kicker", text: L("ARCHIVED DECKS", "DECK ĐÃ LƯU TRỮ") });
    root.createEl("h2", { text: L("Archived decks", "Deck đã lưu trữ") });
    root.createEl("p", { cls: "pdl-edit-context", text: L("Archived decks are hidden from reviews and the dashboard. Restore one to use it again.", "Deck lưu trữ bị ẩn khỏi ôn tập và dashboard. Khôi phục để dùng lại.") });
    const decks = await this.plugin.getArchivedDecks();
    const list = root.createDiv({ cls: "pdl-archive-list" });
    if (!decks.length) {
      list.createDiv({ cls: "pdl-day-empty", text: L("No archived decks.", "Không có deck lưu trữ.") });
    } else {
      decks.forEach(({ file, title, count }) => {
        const row = list.createDiv({ cls: "pdl-archive-row" });
        const copy = row.createDiv({ cls: "pdl-archive-copy" });
        copy.createEl("strong", { text: title });
        copy.createSpan({ text: L(`${count} cards`, `${count} thẻ`) });
        const restore = row.createEl("button", { text: L("Restore", "Khôi phục") });
        restore.onclick = async () => {
          restore.disabled = true;
          await this.plugin.archiveDeck(file, false);
          await this.render();
          if (this.onDone) await this.onDone();
        };
      });
    }
    const footer = root.createDiv({ cls: "pdl-edit-footer" });
    const close = footer.createEl("button", { cls: "mod-cta", text: L("Close", "Đóng") });
    close.onclick = () => this.close();
  }
}

export { BulkTagModal, MoveCardsModal, BulkDeleteModal, CreateDeckModal, MergeDecksModal, ArchiveDecksModal };
