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
    const root = this.contentEl; root.empty(); root.createSpan({ cls: "pdl-edit-kicker", text: "EDIT FLASHCARD" }); root.createEl("h2", { text: "Refine this card" }); root.createEl("p", { cls: "pdl-edit-context", text: `${this.card.deckTitle} · ${this.card.sourcePath || "Missing source"}` });
    const type = root.createEl("select", { cls: "pdl-edit-type" });
    [
      ["basic","Question and answer"],
      ["cloze","Cloze deletion (use {{c1::word}} or ==word==)"],
      ["multiple-choice","Four-choice question"]
    ].forEach(([value,label]) => type.createEl("option", { text: label, attr: { value } }));
    type.value = this.values.type;
    type.onchange = () => { this.values.type = type.value; this.render(); };

    this.field(root, this.values.type === "cloze" ? "Statement with {{c1::hidden text}} or ==hidden text==" : "Question", "question");
    
    if (this.values.type === "multiple-choice") {
      const grid = root.createDiv({ cls: "pdl-choice-editor" });
      for (let i=0;i<4;i++) {
        const label=grid.createEl("label"); label.createSpan({ text:`Choice ${String.fromCharCode(65+i)}` });
        const input=label.createEl("input"); input.value=this.values.choices[i]; input.oninput=()=>this.values.choices[i]=input.value;
      }
    }

    if (this.values.type !== "cloze") {
      this.field(root, this.values.type === "multiple-choice" ? "Correct answer" : "Answer", "answer");
    }
    this.field(root, "Tags (comma separated, e.g. devops, eng)", "tags", true);
    this.field(root, "Explanation (optional)", "explanation", true);

    const footer = root.createDiv({ cls: "pdl-edit-footer" }); const cancel = footer.createEl("button", { text: "Cancel" }); cancel.onclick=()=>this.close(); const save=footer.createEl("button", { cls:"mod-cta", text:"Save changes" });
    save.onclick=async()=>{
      const v=this.values;
      if(!v.question.trim()){new Notice("Question or statement is required.");return;}
      if(v.type !== "cloze" && !v.answer.trim()){new Notice("Answer is required.");return;}
      if(v.type==="multiple-choice"&&(v.choices.filter(choice=>choice.trim()).length!==4||!v.choices.map(choice=>choice.trim()).includes(v.answer.trim()))){new Notice("Use four choices and make the answer exactly match one of them.");return;}
      
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
        new Notice("Flashcard updated.");
        await this.onSaved();
        this.close();
      }catch(error){new Notice(error.message||String(error));save.disabled=false;}
    };
  }
}

class DeleteFlashcardModal extends Modal {
  constructor(app, plugin, card, onDeleted) { super(app); this.plugin=plugin; this.card=card; this.onDeleted=onDeleted; }
  onOpen(){this.modalEl.addClass("pdl-delete-modal");const root=this.contentEl;const icon=root.createSpan({cls:"pdl-delete-icon"});setIcon(icon,"trash-2");root.createEl("h2",{text:"Delete this flashcard?"});root.createEl("p",{text:this.card.question});root.createEl("small",{text:"This removes the card from its deck and clears its review history. The source note is not changed."});const actions=root.createDiv({cls:"pdl-delete-actions"});const cancel=actions.createEl("button",{text:"Keep card"});cancel.onclick=()=>this.close();const remove=actions.createEl("button",{cls:"mod-warning",text:"Delete permanently"});remove.onclick=async()=>{remove.disabled=true;try{await this.plugin.deleteCard(this.card);new Notice("Flashcard deleted.");await this.onDeleted();this.close();}catch(error){new Notice(error.message||String(error));remove.disabled=false;}};}
}


export { FlashcardEditModal, DeleteFlashcardModal };
