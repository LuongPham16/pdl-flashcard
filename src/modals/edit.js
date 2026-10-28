/** Single-card edit and delete dialogs. */
import { Modal, Notice, setIcon, MarkdownRenderer } from "obsidian";
import {
  parseCloze,
  formatRichInline,
  formatRichText,
  formatRichCodeAware,
  wireCodeToggles
} from "../formatting.js";
import { normalizeCardText } from "../utils.js";
import { L } from "../i18n.js";

class FlashcardEditModal extends Modal {
  constructor(app, plugin, card, onSaved) {
    super(app);
    this.plugin = plugin;
    this.card = card;
    this.onSaved = onSaved;
    this.values = {
      type: card.type || "basic",
      question: card.question || "",
      answer: card.answer || "",
      explanation: card.explanation || "",
      choices: [...(card.choices || ["", "", "", ""])],
      tags: (card.tags || []).join(", ")
    };
    while (this.values.choices.length < 4) this.values.choices.push("");
  }

  onOpen() { this.modalEl.addClass("pdl-edit-modal"); this.render(); }
  field(root, labelText, key, compact = false) {
    const label = root.createEl("label", { cls: "pdl-editor-field" });
    label.createSpan({ text: labelText });
    const input = label.createEl("textarea", { cls: compact ? "is-compact" : "" });
    input.value = this.values[key] || "";
    input.oninput = () => this.values[key] = input.value;
  }

  render() {
    const root = this.contentEl; root.empty(); root.createSpan({ cls: "pdl-edit-kicker", text: L("EDIT FLASHCARD", "SỬA FLASHCARD") }); root.createEl("h2", { text: L("Refine this card", "Chỉnh sửa thẻ này") }); root.createEl("p", { cls: "pdl-edit-context", text: `${this.card.deckTitle} · ${this.card.sourcePath || L("Missing source", "Thiếu note nguồn")}` });
    const type = root.createEl("select", { cls: "pdl-edit-type" });
    [
      ["basic", L("Question and answer", "Hỏi và đáp")],
      ["cloze", L("Cloze deletion (use {{c1::word}} or ==word==)", "Điền khuyết (dùng {{c1::word}} hoặc ==word==)")],
      ["multiple-choice", L("Four-choice question", "Câu hỏi bốn lựa chọn")]
    ].forEach(([value,label]) => type.createEl("option", { text: label, attr: { value } }));
    type.value = this.values.type;
    type.onchange = () => { this.values.type = type.value; this.render(); };

    this.field(root, this.values.type === "cloze" ? L("Statement with {{c1::hidden text}} or ==hidden text==", "Câu với {{c1::chữ ẩn}} hoặc ==chữ ẩn==") : L("Question", "Câu hỏi"), "question");
    
    if (this.values.type === "multiple-choice") {
      const grid = root.createDiv({ cls: "pdl-choice-editor" });
      for (let i=0;i<4;i++) {
        const label=grid.createEl("label"); label.createSpan({ text:L(`Choice ${String.fromCharCode(65+i)}`, `Lựa chọn ${String.fromCharCode(65+i)}`) });
        const input=label.createEl("input"); input.value=this.values.choices[i]; input.oninput=()=>this.values.choices[i]=input.value;
      }
    }

    if (this.values.type !== "cloze") {
      this.field(root, this.values.type === "multiple-choice" ? L("Correct answer", "Đáp án đúng") : L("Answer", "Đáp án"), "answer");
    }
    this.field(root, L("Tags (comma separated, e.g. devops, eng)", "Tags (phân cách bằng dấu phẩy, ví dụ devops, eng)"), "tags", true);
    this.field(root, L("Explanation (optional)", "Giải thích (không bắt buộc)"), "explanation", true);

    const footer = root.createDiv({ cls: "pdl-edit-footer" }); const cancel = footer.createEl("button", { text: L("Cancel", "Hủy") }); cancel.onclick=()=>this.close(); const save=footer.createEl("button", { cls:"mod-cta", text:L("Save changes", "Lưu thay đổi") });
    save.onclick=async()=>{
      const v=this.values;
      if(!v.question.trim()){new Notice(L("Question or statement is required.", "Cần nhập câu hỏi hoặc câu."));return;}
      if(v.type !== "cloze" && !v.answer.trim()){new Notice(L("Answer is required.", "Cần nhập đáp án."));return;}
      if(v.type==="multiple-choice"&&(v.choices.filter(choice=>choice.trim()).length!==4||!v.choices.map(choice=>choice.trim()).includes(v.answer.trim()))){new Notice(L("Use four choices and make the answer exactly match one of them.", "Cần đủ bốn lựa chọn và đáp án phải trùng khớp một lựa chọn."));return;}
      
      save.disabled=true;
      try{
        const tagsArray = typeof v.tags === "string" ? v.tags.split(",").map(t => t.trim()).filter(Boolean) : (v.tags || []);
        const computedAnswer = v.type === "cloze" ? parseCloze(v.question.trim()).answers.join(", ") : v.answer.trim();
        await this.plugin.updateCard(this.card,{
          type: v.type,
          question: v.question.trim(),
          answer: computedAnswer,
          explanation: v.explanation.trim(),
          choices: v.type==="multiple-choice"?v.choices.map(choice=>choice.trim()):undefined,
          tags: tagsArray
        });
        new Notice(L("Flashcard updated.", "Đã cập nhật flashcard."));
        await this.onSaved();
        this.close();
      }catch(error){new Notice(error.message||String(error));save.disabled=false;}
    };
  }
}

class DeleteFlashcardModal extends Modal {
  constructor(app, plugin, card, onDeleted) { super(app); this.plugin=plugin; this.card=card; this.onDeleted=onDeleted; }
  onOpen(){this.modalEl.addClass("pdl-delete-modal");const root=this.contentEl;const icon=root.createSpan({cls:"pdl-delete-icon"});setIcon(icon,"trash-2");root.createEl("h2",{text:L("Delete this flashcard?", "Xóa flashcard này?")});root.createEl("p",{text:this.card.question});root.createEl("small",{text:L("This removes the card from its deck and clears its review history. The source note is not changed.", "Thẻ sẽ bị xóa khỏi deck và xóa lịch sử ôn. Note nguồn không bị thay đổi.")});const actions=root.createDiv({cls:"pdl-delete-actions"});const cancel=actions.createEl("button",{text:L("Keep card", "Giữ thẻ")});cancel.onclick=()=>this.close();const remove=actions.createEl("button",{cls:"mod-warning",text:L("Delete permanently", "Xóa vĩnh viễn")});remove.onclick=async()=>{remove.disabled=true;try{await this.plugin.deleteCard(this.card);new Notice(L("Flashcard deleted.", "Đã xóa flashcard."));await this.onDeleted();this.close();}catch(error){new Notice(error.message||String(error));remove.disabled=false;}};}
}


export { FlashcardEditModal, DeleteFlashcardModal };
