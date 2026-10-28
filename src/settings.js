/** Settings UI. */
import { PluginSettingTab, Setting, Notice, normalizePath } from "obsidian";
import { DEFAULT_AI_PROMPTS } from "./constants.js";
import { setLanguage, L } from "./i18n.js";

export class PDLFlashcardSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

  /** Re-render the open view after a language change without losing a review. */
  refreshView() {
    const view = this.plugin.getView();
    if (!view) return;
    if (view.session?.length) view.renderReview();
    else view.renderDashboard();
  }

  display() {
    const { containerEl } = this; containerEl.empty();
    containerEl.createEl("h2", { text: L("PDL Flashcard Settings", "Cài đặt PDL Flashcard") });

    containerEl.createEl("h3", { text: L("Appearance", "Giao diện") });
    new Setting(containerEl)
      .setName(L("Language", "Ngôn ngữ"))
      .setDesc(L("Language used for buttons, dialogs and notices.", "Ngôn ngữ dùng cho nút, hộp thoại và thông báo."))
      .addDropdown(dropdown => dropdown
        .addOption("en", "English")
        .addOption("vi", "Tiếng Việt")
        .setValue(this.plugin.settings.language || "en")
        .onChange(async value => {
          this.plugin.settings.language = value;
          setLanguage(value);
          await this.plugin.saveData(this.plugin.settings);
          this.display();
          this.refreshView();
        }));
    new Setting(containerEl)
      .setName(L("Decks per page", "Số deck mỗi trang"))
      .setDesc(L("How many decks are listed on one page of the library. Default: 5.", "Số deck hiển thị trên một trang thư viện. Mặc định: 5."))
      .addSlider(slider => slider
        .setLimits(1, 50, 1)
        .setDynamicTooltip()
        .setValue(Math.max(1, Number(this.plugin.settings.decksPerPage) || 5))
        .onChange(async value => {
          this.plugin.settings.decksPerPage = Math.max(1, Number(value) || 5);
          await this.plugin.saveData(this.plugin.settings);
          const view = this.plugin.getView();
          if (view && !view.session?.length) view.renderDashboard();
        }));

    containerEl.createEl("h3", { text: L("Library", "Thư viện") });
    new Setting(containerEl).setName(L("Flashcard folder", "Thư mục flashcard")).setDesc(L("Stores deck notes linked to their source notes.", "Nơi lưu các note deck, liên kết với note nguồn.")).addText(text => text
      .setValue(this.plugin.settings.outputFolder)
      .onChange(async value => { this.plugin.settings.outputFolder = normalizePath(value.trim() || "06 - Flashcards"); await this.plugin.ensureOutputFolder(); await this.plugin.saveData(this.plugin.settings); }));
    new Setting(containerEl).setName(L("Source folders", "Thư mục nguồn")).setDesc(L("Comma-separated. The plugin only reads Markdown source notes.", "Phân cách bằng dấu phẩy. Plugin chỉ đọc note Markdown nguồn.")).addTextArea(text => text
      .setValue(this.plugin.settings.sourceFolders.join(", "))
      .onChange(async value => { this.plugin.settings.sourceFolders = value.split(",").map(v => v.trim()).filter(Boolean); await this.plugin.saveData(this.plugin.settings); }));
    new Setting(containerEl).setName(L("Cards per session", "Số thẻ mỗi phiên")).setDesc(L("8–20 cards keeps a review session focused and manageable.", "8–20 thẻ giúp phiên ôn tập vừa sức và tập trung.")).addSlider(slider => slider
      .setLimits(5, 30, 1).setDynamicTooltip().setValue(this.plugin.settings.sessionSize)
      .onChange(async value => { this.plugin.settings.sessionSize = value; await this.plugin.saveData(this.plugin.settings); }));

    containerEl.createEl("h3", { text: L("Review behaviour", "Hành vi ôn tập") });
    new Setting(containerEl)
      .setName(L("Re-show forgotten cards in the same session", "Hiện lại thẻ đã quên trong cùng phiên"))
      .setDesc(L("A card answered \"Again\" is queued once more at the end of the session, like Anki's relearning step.", "Thẻ bị chọn \"Again\" sẽ quay lại cuối phiên, giống bước học lại của Anki."))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.requeueForgotten !== false)
        .onChange(async value => { this.plugin.settings.requeueForgotten = value; await this.plugin.saveData(this.plugin.settings); }));
    new Setting(containerEl)
      .setName(L("Re-show limit per card", "Giới hạn hiện lại mỗi thẻ"))
      .setDesc(L("How many times one forgotten card may come back within a single session. 0 disables re-showing.", "Số lần một thẻ đã quên được quay lại trong một phiên. 0 là tắt."))
      .addSlider(slider => slider
        .setLimits(0, 5, 1).setDynamicTooltip().setValue(Number(this.plugin.settings.requeueLimit ?? 2))
        .onChange(async value => { this.plugin.settings.requeueLimit = value; await this.plugin.saveData(this.plugin.settings); }));
    new Setting(containerEl)
      .setName(L("Leech threshold", "Ngưỡng leech"))
      .setDesc(L("Auto-suspend a card after this many lapses so it can be rewritten. 0 disables leech detection.", "Tự tạm dừng thẻ sau số lần quên này để viết lại. 0 là tắt phát hiện leech."))
      .addSlider(slider => slider
        .setLimits(0, 20, 1).setDynamicTooltip().setValue(Number(this.plugin.settings.leechThreshold ?? 8))
        .onChange(async value => { this.plugin.settings.leechThreshold = value; await this.plugin.saveData(this.plugin.settings); }));
    new Setting(containerEl)
      .setName(L("Maximum interval (days)", "Khoảng ôn tối đa (ngày)"))
      .setDesc(L("No card is scheduled further out than this.", "Không thẻ nào được lên lịch xa hơn mốc này."))
      .addText(text => text
        .setPlaceholder("36500")
        .setValue(String(this.plugin.settings.maxIntervalDays ?? 36500))
        .onChange(async value => {
          const days = Math.max(1, Math.floor(Number(value) || 36500));
          this.plugin.settings.maxIntervalDays = days;
          await this.plugin.saveData(this.plugin.settings);
        }));

    containerEl.createEl("h3", { text: L("AI Settings", "Cài đặt AI") });
    containerEl.createEl("p", { text: L("Configure AI models and API keys for generating flashcards.", "Cấu hình model và API key để tạo flashcard bằng AI.") });

    const ai = this.plugin.settings.ai;
    new Setting(containerEl)
      .setName(L("AI Provider", "Nhà cung cấp AI"))
      .setDesc(L("Select the AI provider to use.", "Chọn nhà cung cấp AI để sử dụng."))
      .addDropdown(dropdown => dropdown
        .addOption("openai", "OpenAI")
        .addOption("gemini", "Gemini (Google)")
        .addOption("deepseek", "DeepSeek")
        .addOption("claude", "Claude (Anthropic)")
        .addOption("custom", L("Custom (OpenAI-compatible)", "Tùy chỉnh (tương thích OpenAI)"))
        .setValue(ai.provider || "openai")
        .onChange(async value => {
          ai.provider = value;
          await this.plugin.saveData(this.plugin.settings);
          this.display();
        }));

    const provider = ai.provider || "openai";
    const providerName = provider === "openai" ? "OpenAI" : provider === "gemini" ? "Gemini" : provider === "deepseek" ? "DeepSeek" : provider === "claude" ? "Claude" : L("your custom provider", "nhà cung cấp tùy chỉnh");

    const keySetting = new Setting(containerEl)
      .setName(L("API Key", "API Key"))
      .setDesc(L(`Enter your API key for ${providerName}.`, `Nhập API key cho ${providerName}.`));

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
      .setName(L("Model", "Model"))
      .setDesc(L("The model name to request.", "Tên model sẽ gọi."))
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
        .setName(L("API Endpoint", "API Endpoint"))
        .setDesc(L("The base URL for API requests.", "URL gốc cho các yêu cầu API."))
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
    containerEl.createEl("h3", { text: L("AI Custom Prompts", "Prompt AI tùy chỉnh") });
    containerEl.createEl("p", { text: L("Create and customize AI prompt presets for flashcard generation. Use {basicCount}, {mcqCount}, and {clozeCount} as placeholders.", "Tạo và tùy chỉnh prompt cho việc sinh flashcard. Dùng {basicCount}, {mcqCount}, {clozeCount} làm biến.") });

    const prompts = this.plugin.settings.aiPrompts || DEFAULT_AI_PROMPTS;

    prompts.forEach((promptItem, idx) => {
      const pBox = containerEl.createDiv({ cls: "pdl-prompt-setting-box" });
      new Setting(pBox)
        .setName(L(`Preset ${idx + 1}: ${promptItem.name}`, `Preset ${idx + 1}: ${promptItem.name}`))
        .setDesc(promptItem.id === "default" ? L("Default System Prompt", "Prompt hệ thống mặc định") : L(`Preset ID: ${promptItem.id}`, `ID preset: ${promptItem.id}`))
        .addExtraButton(btn => {
          btn.setIcon("trash")
            .setTooltip(L("Delete this prompt preset", "Xóa preset này"))
            .onClick(async () => {
              if (prompts.length <= 1) {
                new Notice(L("You must keep at least one prompt preset.", "Phải giữ lại ít nhất một preset."));
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
        .setName(L("Preset Name", "Tên preset"))
        .addText(text => text
          .setValue(promptItem.name)
          .onChange(async val => {
            promptItem.name = val.trim() || L(`Preset ${idx + 1}`, `Preset ${idx + 1}`);
            await this.plugin.saveData(this.plugin.settings);
          }));

      new Setting(pBox)
        .setName(L("Prompt Template", "Mẫu prompt"))
        .addTextArea(text => text
          .setValue(promptItem.template)
          .onChange(async val => {
            promptItem.template = val;
            await this.plugin.saveData(this.plugin.settings);
          }));
    });

    new Setting(containerEl)
      .setName(L("Add New Prompt Preset", "Thêm preset mới"))
      .setDesc(L("Create a new prompt template with custom instructions.", "Tạo mẫu prompt mới với hướng dẫn riêng."))
      .addButton(btn => btn
        .setButtonText(L("Add Prompt Preset", "Thêm preset"))
        .setCta()
        .onClick(async () => {
          const newId = `custom_${Date.now()}`;
          this.plugin.settings.aiPrompts.push({
            id: newId,
            name: L("New Prompt Preset", "Preset mới"),
            template: `Create flashcards from the note below.\n- {basicCount} Q&A cards (type="basic", question, answer, explanation, tags)\n- {mcqCount} MCQ cards (type="multiple-choice", question, 4 choices, answer, explanation, tags)\n- {clozeCount} Cloze cards (type="cloze", question with {{c1::hidden text}}, answer, explanation, tags)`
          });
          await this.plugin.saveData(this.plugin.settings);
          this.display();
        }));
  }}
