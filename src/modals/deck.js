/** Rename and delete a deck note. */
import { Modal, Notice, setIcon } from "obsidian";
import { L } from "../i18n.js";

class RenameDeckModal extends Modal {
  constructor(app, plugin, file, title, onDone) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.title = title || file.basename;
    this.onDone = onDone;
    this.saving = false;
  }

  onOpen() {
    this.modalEl.addClass("pdl-deck-action-modal");
    const root = this.contentEl;
    root.createSpan({ cls: "pdl-edit-kicker", text: L("DECK SETTINGS", "CÀI ĐẶT DECK") });
    root.createEl("h2", { text: L("Rename deck", "Đổi tên deck") });
    root.createEl("p", {
      cls: "pdl-edit-context",
      text: L("This renames the deck note and its title. Source links are preserved.", "Đổi tên note deck và tiêu đề. Liên kết nguồn được giữ nguyên.")
    });
    const label = root.createEl("label", { cls: "pdl-editor-field" });
    label.createSpan({ text: L("Deck name", "Tên deck") });
    this.input = label.createEl("input", { attr: { type: "text", value: this.title } });
    this.input.focus();
    this.input.select();
    this.error = root.createDiv({ cls: "pdl-form-error" });
    const footer = root.createDiv({ cls: "pdl-edit-footer" });
    const cancel = footer.createEl("button", { text: L("Cancel", "Hủy") });
    cancel.onclick = () => this.close();
    const save = footer.createEl("button", { cls: "mod-cta", text: L("Save name", "Lưu tên") });
    const submit = async () => {
      if (this.saving) return;
      const name = this.input.value.trim();
      if (!name) { this.error.setText(L("Enter a deck name.", "Hãy nhập tên deck.")); return; }
      this.saving = true;
      save.disabled = true;
      try {
        await this.plugin.renameDeck(this.file, name);
        this.close();
        if (this.onDone) await this.onDone();
      } catch (error) {
        this.error.setText(error.message || String(error));
        new Notice(L(`Could not rename deck: ${error.message || error}`, `Không đổi được tên deck: ${error.message || error}`));
      } finally {
        this.saving = false;
        save.disabled = false;
      }
    };
    save.onclick = submit;
    this.input.onkeydown = event => { if (event.key === "Enter") void submit(); };
  }
}

class DeleteDeckModal extends Modal {
  constructor(app, plugin, file, title, onDone) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.title = title || file.basename;
    this.onDone = onDone;
    this.deleting = false;
  }

  onOpen() {
    this.modalEl.addClass("pdl-deck-action-modal");
    const root = this.contentEl;
    root.createSpan({ cls: "pdl-edit-kicker", text: L("DECK SETTINGS", "CÀI ĐẶT DECK") });
    root.createEl("h2", { text: L("Delete deck?", "Xóa deck?") });
    root.createEl("p", {
      cls: "pdl-edit-context",
      text: L(`“${this.title}” will be moved to trash. The source note is not deleted.`, `“${this.title}” sẽ được chuyển vào thùng rác. Note nguồn không bị xóa.`)
    });
    const warning = root.createDiv({ cls: "pdl-deck-delete-warning" });
    setIcon(warning.createSpan(), "alert-triangle");
    warning.createSpan({ text: L("Schedules and review history for its cards will be removed.", "Lịch ôn và lịch sử ôn của các thẻ trong deck sẽ bị xóa.") });
    const footer = root.createDiv({ cls: "pdl-edit-footer" });
    const cancel = footer.createEl("button", { text: L("Cancel", "Hủy") });
    cancel.onclick = () => this.close();
    const remove = footer.createEl("button", { cls: "mod-warning", text: L("Delete deck", "Xóa deck") });
    remove.onclick = async () => {
      if (this.deleting) return;
      this.deleting = true;
      remove.disabled = true;
      try {
        await this.plugin.deleteDeck(this.file);
        this.close();
        if (this.onDone) await this.onDone();
      } catch (error) {
        new Notice(L(`Could not delete deck: ${error.message || error}`, `Không xóa được deck: ${error.message || error}`));
      } finally {
        this.deleting = false;
        remove.disabled = false;
      }
    };
  }
}

export { RenameDeckModal, DeleteDeckModal };
