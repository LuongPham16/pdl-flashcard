/** Small picker used by the card editors to embed an image. */
import { Modal, Notice, normalizePath } from "obsidian";
import { L } from "../i18n.js";

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

class ImagePickerModal extends Modal {
  constructor(app, plugin, onPick) {
    super(app);
    this.plugin = plugin;
    this.onPick = onPick;
    this.query = "";
  }

  onOpen() {
    this.modalEl.addClass("pdl-image-picker-modal");
    this.render();
  }

  images() {
    return this.app.vault.getFiles()
      .filter(file => IMAGE_EXTENSIONS.test(file.path))
      .sort((a, b) => b.path.localeCompare(a.path, "vi"));
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.createSpan({ cls: "pdl-edit-kicker", text: L("INSERT IMAGE", "CHÈN ẢNH") });
    root.createEl("h2", { text: L("Pick an image", "Chọn ảnh") });
    root.createEl("p", { cls: "pdl-edit-context", text: L("Choose an image already in the vault, or upload one from this computer.", "Chọn ảnh có sẵn trong vault, hoặc tải ảnh từ máy.") });

    const search = root.createEl("input", { cls: "pdl-image-search", attr: { type: "search", placeholder: L("Search images…", "Tìm ảnh…") } });
    search.oninput = () => { this.query = search.value.trim().toLowerCase(); this.renderList(); };

    this.listEl = root.createDiv({ cls: "pdl-image-list" });
    this.renderList();

    const actions = root.createDiv({ cls: "pdl-image-actions" });
    const upload = actions.createEl("button", { cls: "mod-cta", text: L("Upload from computer", "Tải ảnh từ máy") });
    const input = actions.createEl("input", { attr: { type: "file", accept: "image/*" } });
    input.style.display = "none";
    upload.onclick = () => input.click();
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      upload.disabled = true;
      try {
        const path = await this.saveImage(file);
        this.pick(path);
      } catch (error) {
        new Notice(L(`Could not add image: ${error.message || error}`, `Không thêm được ảnh: ${error.message || error}`));
        upload.disabled = false;
      }
    };
    actions.createEl("button", { text: L("Cancel", "Hủy") }).onclick = () => this.close();
  }

  renderList() {
    if (!this.listEl) return;
    this.listEl.empty();
    const filtered = this.images().filter(file => !this.query || file.path.toLowerCase().includes(this.query));
    if (!filtered.length) {
      this.listEl.createDiv({ cls: "pdl-image-empty", text: L("No images found. Upload one below.", "Không tìm thấy ảnh. Hãy tải ảnh lên bên dưới.") });
      return;
    }
    filtered.slice(0, 200).forEach(file => {
      const row = this.listEl.createDiv({ cls: "pdl-image-item" });
      const thumb = row.createDiv({ cls: "pdl-image-thumb" });
      const resource = this.app.vault.adapter?.getResourcePath?.(file.path);
      if (resource) {
        thumb.createEl("img", { attr: { src: resource, alt: "", loading: "lazy" } });
      } else {
        thumb.createSpan({ text: "🖼" });
      }
      const copy = row.createDiv({ cls: "pdl-image-copy" });
      copy.createEl("strong", { text: file.name });
      copy.createSpan({ text: file.path });
      row.onclick = () => this.pick(file.path);
    });
  }

  async saveImage(file) {
    const folder = normalizePath(`${this.plugin.settings.outputFolder}/attachments`);
    try { await this.app.vault.createFolder(folder); } catch (_) { /* already exists */ }
    const safeName = String(file.name || "image.png").replace(/[^\w.\-]+/g, "-");
    const path = normalizePath(`${folder}/${Date.now()}-${safeName}`);
    const buffer = await file.arrayBuffer();
    await this.app.vault.createBinary(path, buffer);
    return path;
  }

  pick(path) {
    this.onPick?.(path);
    this.close();
  }
}

/** Insert a wikilink embed as its own block at the cursor of a textarea. */
function insertImageEmbed(textarea, path) {
  if (!textarea) return;
  const token = `![[${path}]]`;
  const start = typeof textarea.selectionStart === "number" ? textarea.selectionStart : textarea.value.length;
  const end = typeof textarea.selectionEnd === "number" ? textarea.selectionEnd : start;
  const value = String(textarea.value || "");
  const before = value.slice(0, start).trimEnd();
  const after = value.slice(end).trimStart();
  const prefix = before ? "\n\n" : "";
  const suffix = after ? "\n\n" : "";
  const insertion = `${prefix}${token}${suffix}`;
  textarea.value = `${before}${insertion}${after}`;
  const cursor = before.length + insertion.length;
  textarea.selectionStart = cursor;
  textarea.selectionEnd = cursor;
  textarea.dispatchEvent?.(new Event("input", { bubbles: true }));
  textarea.focus?.();
}

export { ImagePickerModal, insertImageEmbed };
