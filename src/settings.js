/** Settings UI. */
import { PluginSettingTab, Setting, Notice, normalizePath } from "obsidian";
import { DEFAULT_AI_PROMPTS } from "./constants.js";

export class PDLFlashcardSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this; containerEl.empty();
    containerEl.createEl("h2", { text: "PDL Flashcard Settings" });
    new Setting(containerEl).setName("Flashcard folder").setDesc("Stores deck notes linked to their source notes.").addText(text => text
      .setValue(this.plugin.settings.outputFolder)
      .onChange(async value => { this.plugin.settings.outputFolder = normalizePath(value.trim() || "06 - Flashcards"); await this.plugin.ensureOutputFolder(); await this.plugin.saveData(this.plugin.settings); }));
    new Setting(containerEl).setName("Source folders").setDesc("Comma-separated. The plugin only reads Markdown source notes.").addTextArea(text => text
      .setValue(this.plugin.settings.sourceFolders.join(", "))
      .onChange(async value => { this.plugin.settings.sourceFolders = value.split(",").map(v => v.trim()).filter(Boolean); await this.plugin.saveData(this.plugin.settings); }));
    new Setting(containerEl).setName("Cards per session").setDesc("8–20 cards keeps a review session focused and manageable.").addSlider(slider => slider
      .setLimits(5, 30, 1).setDynamicTooltip().setValue(this.plugin.settings.sessionSize)
      .onChange(async value => { this.plugin.settings.sessionSize = value; await this.plugin.saveData(this.plugin.settings); }));

    containerEl.createEl("h3", { text: "Review behaviour" });
    new Setting(containerEl)
      .setName("Re-show forgotten cards in the same session")
      .setDesc("A card answered \"Again\" is queued once more at the end of the session, like Anki's relearning step.")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.requeueForgotten !== false)
        .onChange(async value => { this.plugin.settings.requeueForgotten = value; await this.plugin.saveData(this.plugin.settings); }));
    new Setting(containerEl)
      .setName("Re-show limit per card")
      .setDesc("How many times one forgotten card may come back within a single session. 0 disables re-showing.")
      .addSlider(slider => slider
        .setLimits(0, 5, 1).setDynamicTooltip().setValue(Number(this.plugin.settings.requeueLimit ?? 2))
        .onChange(async value => { this.plugin.settings.requeueLimit = value; await this.plugin.saveData(this.plugin.settings); }));
    new Setting(containerEl)
      .setName("Leech threshold")
      .setDesc("Auto-suspend a card after this many lapses so it can be rewritten. 0 disables leech detection.")
      .addSlider(slider => slider
        .setLimits(0, 20, 1).setDynamicTooltip().setValue(Number(this.plugin.settings.leechThreshold ?? 8))
        .onChange(async value => { this.plugin.settings.leechThreshold = value; await this.plugin.saveData(this.plugin.settings); }));
    new Setting(containerEl)
      .setName("Maximum interval (days)")
      .setDesc("No card is scheduled further out than this.")
      .addText(text => text
        .setPlaceholder("36500")
        .setValue(String(this.plugin.settings.maxIntervalDays ?? 36500))
        .onChange(async value => {
          const days = Math.max(1, Math.floor(Number(value) || 36500));
          this.plugin.settings.maxIntervalDays = days;
          await this.plugin.saveData(this.plugin.settings);
        }));

    containerEl.createEl("h3", { text: "AI Settings" });
    containerEl.createEl("p", { text: "Configure AI models and API keys for generating flashcards." });

    const ai = this.plugin.settings.ai;
    new Setting(containerEl)
      .setName("AI Provider")
      .setDesc("Select the AI provider to use.")
      .addDropdown(dropdown => dropdown
        .addOption("openai", "OpenAI")
        .addOption("gemini", "Gemini (Google)")
        .addOption("deepseek", "DeepSeek")
        .addOption("claude", "Claude (Anthropic)")
        .addOption("custom", "Custom (OpenAI-compatible)")
        .setValue(ai.provider || "openai")
        .onChange(async value => {
          ai.provider = value;
          await this.plugin.saveData(this.plugin.settings);
          this.display();
        }));

    const provider = ai.provider || "openai";

    const keySetting = new Setting(containerEl)
      .setName("API Key")
      .setDesc(`Enter your API key for ${provider === "openai" ? "OpenAI" : provider === "gemini" ? "Gemini" : provider === "deepseek" ? "DeepSeek" : provider === "claude" ? "Claude" : "your custom provider"}.`);
    
    keySetting.addText(text => {
      text.inputEl.type = "password";
      let placeholder = "sk-...";
      if (provider === "gemini") placeholder = "AIzaSy...";
      text.setPlaceholder(placeholder)
        .setValue(ai.apiKeys[provider] || "")
        .onChange(async value => {
          ai.apiKeys[provider] = value.trim();
          if (provider === "openai") ai.apiKey = value.trim();
          await this.plugin.saveData(this.plugin.settings);
        });
    });

    new Setting(containerEl)
      .setName("Model")
      .setDesc("The model name to request.")
      .addText(text => {
        let placeholder = "gpt-4o-mini";
        if (provider === "gemini") placeholder = "gemini-2.5-flash";
        else if (provider === "deepseek") placeholder = "deepseek-chat";
        else if (provider === "claude") placeholder = "claude-3-5-sonnet-20241022";
        
        text.setPlaceholder(placeholder)
          .setValue(ai.models[provider] || "")
          .onChange(async value => {
            ai.models[provider] = value.trim();
            if (provider === "openai") ai.model = value.trim();
            await this.plugin.saveData(this.plugin.settings);
          });
      });

    if (provider !== "gemini") {
      new Setting(containerEl)
        .setName("API Endpoint")
        .setDesc("The base URL for API requests.")
        .addText(text => {
          let placeholder = "https://api.openai.com/v1/chat/completions";
          if (provider === "deepseek") placeholder = "https://api.deepseek.com/chat/completions";
          else if (provider === "claude") placeholder = "https://api.anthropic.com/v1/messages";
          
          text.setPlaceholder(placeholder)
            .setValue(ai.endpoints[provider] || "")
            .onChange(async value => {
              ai.endpoints[provider] = value.trim();
              if (provider === "openai") ai.endpoint = value.trim();
              await this.plugin.saveData(this.plugin.settings);
            });
        });
    }

    // AI Custom Prompts Management
    containerEl.createEl("h3", { text: "AI Custom Prompts" });
    containerEl.createEl("p", { text: "Create and customize AI prompt presets for flashcard generation. Use {basicCount}, {mcqCount}, and {clozeCount} as placeholders." });

    const prompts = this.plugin.settings.aiPrompts || DEFAULT_AI_PROMPTS;

    prompts.forEach((promptItem, idx) => {
      const pBox = containerEl.createDiv({ cls: "pdl-prompt-setting-box" });
      new Setting(pBox)
        .setName(`Preset ${idx + 1}: ${promptItem.name}`)
        .setDesc(promptItem.id === "default" ? "Default System Prompt" : `Preset ID: ${promptItem.id}`)
        .addExtraButton(btn => {
          btn.setIcon("trash")
            .setTooltip("Delete this prompt preset")
            .onClick(async () => {
              if (prompts.length <= 1) {
                new Notice("You must keep at least one prompt preset.");
                return;
              }
              this.plugin.settings.aiPrompts.splice(idx, 1);
              if (this.plugin.settings.selectedPromptId === promptItem.id) {
                this.plugin.settings.selectedPromptId = this.plugin.settings.aiPrompts[0].id;
              }
              await this.plugin.saveData(this.plugin.settings);
              this.display();
            });
        });

      new Setting(pBox)
        .setName("Preset Name")
        .addText(text => text
          .setValue(promptItem.name)
          .onChange(async val => {
            promptItem.name = val.trim() || `Preset ${idx + 1}`;
            await this.plugin.saveData(this.plugin.settings);
          }));

      new Setting(pBox)
        .setName("Prompt Template")
        .addTextArea(text => text
          .setValue(promptItem.template)
          .onChange(async val => {
            promptItem.template = val;
            await this.plugin.saveData(this.plugin.settings);
          }));
    });

    new Setting(containerEl)
      .setName("Add New Prompt Preset")
      .setDesc("Create a new prompt template with custom instructions.")
      .addButton(btn => btn
        .setButtonText("Add Prompt Preset")
        .setCta()
        .onClick(async () => {
          const newId = `custom_${Date.now()}`;
          this.plugin.settings.aiPrompts.push({
            id: newId,
            name: "New Prompt Preset",
            template: `Create flashcards from the note below.\n- {basicCount} Q&A cards (type="basic", question, answer, explanation, tags)\n- {mcqCount} MCQ cards (type="multiple-choice", question, 4 choices, answer, explanation, tags)\n- {clozeCount} Cloze cards (type="cloze", question with {{c1::hidden text}}, answer, explanation, tags)`
          });
          await this.plugin.saveData(this.plugin.settings);
          this.display();
        }));
  }}
