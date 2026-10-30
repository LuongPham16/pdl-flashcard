/** Settings UI – tabbed: General | AI */
import { PluginSettingTab, Setting, Notice, normalizePath, requestUrl } from "obsidian";
import { DEFAULT_AI_PROMPTS } from "./constants.js";
import { setLanguage, L } from "./i18n.js";

/* ─── Model lists per provider (fallback when API fetch fails) ─── */
const KNOWN_MODELS = {
  openai:   ["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra", "gpt-5.4-mini", "gpt-4.1-mini"],
  gemini:   ["gemini-3.8-flash", "gemini-4-argon", "gemini-3.6-flash", "gemini-3.5-flash-lite"],
  deepseek: ["deepseek-flash", "deepseek-v4-pro"],
  claude:   ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-fable-5-1"],
  custom:   [],
};

/** Use Obsidian's requestUrl so settings requests follow the same CORS rules as AI calls. */
async function requestJson(url, options = {}) {
  const response = await requestUrl({ url, ...options, throw: false });
  if (response.status >= 400) {
    const detail = response.json?.error?.message || response.json?.error || response.text || `HTTP ${response.status}`;
    throw new Error(String(detail).slice(0, 400));
  }
  return response.json || {};
}

/* ─── Fetch available models from provider API ─── */
async function fetchModels(provider, apiKey, endpoint) {
  try {
    if (provider === "openai" || provider === "custom" || provider === "deepseek") {
      const base = endpoint
        ? endpoint.replace(/\/chat\/completions.*$/, "")
        : provider === "deepseek"
          ? "https://api.deepseek.com"
          : "https://api.openai.com/v1";
      const url = base.replace(/\/$/, "") + "/models";
      const json = await requestJson(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      const ids = (json.data || []).map(m => m.id).filter(Boolean).sort();
      return ids.length ? ids : KNOWN_MODELS[provider] || [];
    }
    if (provider === "gemini") {
      const json = await requestJson(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {}
      );
      const ids = (json.models || [])
        .map(m => m.name?.replace("models/", ""))
        .filter(id => id && id.startsWith("gemini"))
        .sort();
      return ids.length ? ids : KNOWN_MODELS.gemini;
    }
    // Claude: no public models list endpoint – return static list
    return KNOWN_MODELS[provider] || [];
  } catch {
    return KNOWN_MODELS[provider] || [];
  }
}

/* ─── Test connection ─── */
async function testConnection(provider, apiKey, endpoint, model) {
  if (!apiKey) throw new Error(L("API key is empty.", "API key trống."));
  const testModel = model || (KNOWN_MODELS[provider]?.[0] ?? "gpt-6-luna");

  if (provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${testModel}:generateContent?key=${apiKey}`;
    await requestJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 1 } })
    });
    return;
  }
  if (provider === "claude") {
    const url = endpoint || "https://api.anthropic.com/v1/messages";
    await requestJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: testModel, max_tokens: 1, messages: [{ role: "user", content: "hi" }] })
    });
    return;
  }
  // openai / deepseek / custom
  const url = endpoint || (provider === "deepseek"
    ? "https://api.deepseek.com/chat/completions"
    : "https://api.openai.com/v1/chat/completions");
  await requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: testModel, max_tokens: 1, messages: [{ role: "user", content: "hi" }] })
  });
}

/* ═══════════════════════════════════════════════════════════════ */
export class PDLFlashcardSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; this._tab = "general"; }

  refreshView() {
    const view = this.plugin.getView();
    if (!view) return;
    if (view.session?.length) view.renderReview();
    else view.renderDashboard();
  }

  display() {
    const { containerEl } = this; containerEl.empty();

    /* ── Tab bar ── */
    const tabBar = containerEl.createDiv({ cls: "pdl-settings-tabs" });
    const tabs = [
      { id: "general",  label: L("General",  "Chung")        },
      { id: "ai",       label: L("AI",       "AI")            },
      { id: "feedback", label: L("Feedback", "Phản hồi") + " 💬" },
    ];
    tabs.forEach(({ id, label }) => {
      const btn = tabBar.createEl("button", { text: label, cls: "pdl-settings-tab" + (this._tab === id ? " is-active" : "") });
      btn.onclick = () => { this._tab = id; this.display(); };
    });

    /* ── Tab content ── */
    const panel = containerEl.createDiv({ cls: "pdl-settings-panel" });
    if (this._tab === "general")  this._renderGeneral(panel);
    else if (this._tab === "ai")   this._renderAI(panel);
    else                           this._renderFeedback(panel);
  }

  /* ─────────────────── GENERAL TAB ─────────────────── */
  _renderGeneral(el) {
    const heading = text => new Setting(el).setName(text).setHeading();
    heading(L("Appearance", "Giao diện"));
    new Setting(el)
      .setName(L("Language", "Ngôn ngữ"))
      .setDesc(L("Language used for buttons, dialogs and notices.", "Ngôn ngữ dùng cho nút, hộp thoại và thông báo."))
      .addDropdown(d => d
        .addOption("en", "English")
        .addOption("vi", "Tiếng Việt")
        .setValue(this.plugin.settings.language || "en")
        .onChange(async v => {
          this.plugin.settings.language = v;
          setLanguage(v);
          await this.plugin.saveData(this.plugin.settings);
          this.display(); this.refreshView();
        }));
    new Setting(el)
      .setName(L("Decks per page", "Số deck mỗi trang"))
      .setDesc(L("How many decks are listed on one page of the library. Default: 5.", "Số deck hiển thị trên một trang thư viện. Mặc định: 5."))
      .addSlider(s => s.setLimits(1, 50, 1).setDynamicTooltip()
        .setValue(Math.max(1, Number(this.plugin.settings.decksPerPage) || 5))
        .onChange(async v => {
          this.plugin.settings.decksPerPage = Math.max(1, Number(v) || 5);
          await this.plugin.saveData(this.plugin.settings);
          const view = this.plugin.getView();
          if (view && !view.session?.length) view.renderDashboard();
        }));

    heading(L("Library", "Thư viện"));
    new Setting(el).setName(L("Flashcard folder", "Thư mục flashcard")).setDesc(L("Stores deck notes linked to their source notes.", "Nơi lưu các note deck, liên kết với note nguồn.")).addText(t => t
      .setValue(this.plugin.settings.outputFolder)
      .onChange(async v => { this.plugin.settings.outputFolder = normalizePath(v.trim() || "06 - Flashcards"); await this.plugin.ensureOutputFolder(); await this.plugin.saveData(this.plugin.settings); }));
    new Setting(el).setName(L("Source folders", "Thư mục nguồn")).setDesc(L("Comma-separated. The plugin only reads Markdown source notes.", "Phân cách bằng dấy phẩy. Plugin chỉ đọc note Markdown nguồn.")).addTextArea(t => t
      .setValue(this.plugin.settings.sourceFolders.join(", "))
      .onChange(async v => { this.plugin.settings.sourceFolders = v.split(",").map(x => x.trim()).filter(Boolean); await this.plugin.saveData(this.plugin.settings); }));
    heading(L("Cards per flashcard type", "Số thẻ theo loại flashcard"));
    el.createEl("p", { text: L("Default counts when you open the AI builder or the selection dialog.", "Số lượng mặc định khi mở AI builder hoặc dialog tạo từ đoạn bôi đen.") });
    const countSetting = (name, description, key, fallback) => new Setting(el)
      .setName(name)
      .setDesc(description)
      .addSlider(s => s.setLimits(0, 30, 1).setDynamicTooltip()
        .setValue(Math.max(0, Number(this.plugin.settings[key] ?? fallback)))
        .onChange(async v => { this.plugin.settings[key] = Math.max(0, Number(v) || 0); await this.plugin.saveData(this.plugin.settings); }));
    countSetting(L("Q&A cards", "Thẻ hỏi đáp"), L("Default number of basic cards.", "Số thẻ hỏi đáp mặc định."), "defaultBasicCount", 4);
    countSetting(L("Multiple-choice cards", "Thẻ trắc nghiệm"), L("Default number of MCQ cards.", "Số thẻ trắc nghiệm mặc định."), "defaultMcqCount", 3);
    countSetting(L("Cloze cards", "Thẻ điền khuyết"), L("Default number of cloze cards.", "Số thẻ điền khuyết mặc định."), "defaultClozeCount", 3);
    new Setting(el)
      .setName(L("Create reverse cards by default", "Mặc định tạo thẻ 2 chiều"))
      .setDesc(L("Start the AI builder with the reverse-card option enabled.", "Bật sẵn tùy chọn thẻ 2 chiều khi mở AI builder."))
      .addToggle(t => t.setValue(this.plugin.settings.defaultReverseCards === true)
        .onChange(async v => { this.plugin.settings.defaultReverseCards = v; await this.plugin.saveData(this.plugin.settings); }));

    heading(L("Read aloud (TTS)", "Đọc to (TTS)"));
    const speech = "speechSynthesis" in window ? window.speechSynthesis : null;
    const voices = speech && typeof speech.getVoices === "function" ? speech.getVoices() || [] : [];
    new Setting(el)
      .setName(L("Voice", "Giọng đọc"))
      .setDesc(voices.length
        ? L("Pick a system voice. Blank uses a voice that matches the card language.", "Chọn giọng hệ thống. Để trống sẽ dùng giọng khớp ngôn ngữ của thẻ.")
        : L("No system voices were reported yet. Refresh after installing a speech pack in your OS.", "Chưa thấy giọng hệ thống. Bấm làm mới sau khi cài gói giọng nói trong hệ điều hành."))
      .addDropdown(dropdown => {
        dropdown.addOption("", L("Auto — match the card language", "Tự động — khớp ngôn ngữ của thẻ"));
        const seen = new Set();
        voices.forEach(voice => {
          const value = voice.voiceURI || voice.name;
          if (!value || seen.has(value)) return;
          seen.add(value);
          dropdown.addOption(value, `${voice.name} (${voice.lang || "?"})`);
        });
        const saved = this.plugin.settings.ttsVoice || "";
        if (saved && !seen.has(saved)) dropdown.addOption(saved, `${saved} (${L("not installed", "chưa cài")})`);
        dropdown.setValue(saved);
        dropdown.onChange(async value => {
          this.plugin.settings.ttsVoice = value;
          await this.plugin.saveData(this.plugin.settings);
        });
      });
    new Setting(el)
      .setName(L("Reading speed", "Tốc độ đọc"))
      .setDesc(L("0.5×–2×. Applies to the next Read aloud click.", "0.5×–2×. Áp dụng cho lần bấm Đọc to tiếp theo."))
      .addSlider(slider => slider.setLimits(0.5, 2, 0.1).setDynamicTooltip()
        .setValue(Math.max(0.5, Math.min(2, Number(this.plugin.settings.ttsRate) || 1)))
        .onChange(async value => {
          this.plugin.settings.ttsRate = Math.max(0.5, Math.min(2, Number(value) || 1));
          await this.plugin.saveData(this.plugin.settings);
        }))
      .addButton(button => button.setButtonText(L("Refresh voices", "Làm mới giọng"))
        .onClick(() => this.display()));

    heading(L("Review behaviour", "Hành vi ôn tập"));
    new Setting(el)
      .setName(L("Re-show forgotten cards in the same session", "Hiện lại thẻ đã quên trong cùng phiên"))
      .setDesc(L("A card answered \"Again\" is queued once more at the end of the session, like Anki's relearning step.", "Thẻ bị chọn \"Again\" sẽ quay lại cuối phiên, giống bước học lại của Anki."))
      .addToggle(t => t.setValue(this.plugin.settings.requeueForgotten !== false)
        .onChange(async v => { this.plugin.settings.requeueForgotten = v; await this.plugin.saveData(this.plugin.settings); }));
    new Setting(el)
      .setName(L("Re-show limit per card", "Giới hạn hiện lại mỗi thẻ"))
      .setDesc(L("How many times one forgotten card may come back within a single session. 0 disables re-showing.", "Số lần một thẻ đã quên được quay lại trong một phiên. 0 là tắt."))
      .addSlider(s => s.setLimits(0, 5, 1).setDynamicTooltip().setValue(Number(this.plugin.settings.requeueLimit ?? 2))
        .onChange(async v => { this.plugin.settings.requeueLimit = v; await this.plugin.saveData(this.plugin.settings); }));
    new Setting(el)
      .setName(L("Leech threshold", "Ngưỡng leech"))
      .setDesc(L("Auto-suspend a card after this many lapses so it can be rewritten. 0 disables leech detection.", "Tự tạm dừng thẻ sau số lần quên này để viết lại. 0 là tắt phát hiện leech."))
      .addSlider(s => s.setLimits(0, 20, 1).setDynamicTooltip().setValue(Number(this.plugin.settings.leechThreshold ?? 8))
        .onChange(async v => { this.plugin.settings.leechThreshold = v; await this.plugin.saveData(this.plugin.settings); }));
    new Setting(el)
      .setName(L("Maximum interval (days)", "Khoảng ôn tối đa (ngày)"))
      .setDesc(L("No card is scheduled further out than this.", "Không thẻ nào được lên lịch xa hơn mốc này."))
      .addText(t => t.setPlaceholder("36500").setValue(String(this.plugin.settings.maxIntervalDays ?? 36500))
        .onChange(async v => { this.plugin.settings.maxIntervalDays = Math.max(1, Math.floor(Number(v) || 36500)); await this.plugin.saveData(this.plugin.settings); }));
  }

  /* ─────────────────── AI TAB ─────────────────── */
  _renderAI(el) {
    const heading = text => new Setting(el).setName(text).setHeading();
    const ai = this.plugin.settings.ai;
    const provider = ai.provider || "openai";
    const providerLabel = { openai: "OpenAI", gemini: "Gemini", deepseek: "DeepSeek", claude: "Claude", custom: L("Custom", "Tùy chỉnh") }[provider] ?? provider;

    /* ── Provider ── */
    heading(L("AI Provider", "Nhà cung cấp AI"));
    new Setting(el)
      .setName(L("Provider", "Nhà cung cấp"))
      .setDesc(L("Select the AI provider to use.", "Chọn nhà cung cấp AI để sử dụng."))
      .addDropdown(d => d
        .addOption("openai",   "OpenAI")
        .addOption("gemini",   "Gemini (Google)")
        .addOption("deepseek", "DeepSeek")
        .addOption("claude",   "Claude (Anthropic)")
        .addOption("custom",   L("Custom (OpenAI-compatible)", "Tùy chỉnh (tương thích OpenAI)"))
        .setValue(provider)
        .onChange(async v => { ai.provider = v; await this.plugin.saveData(this.plugin.settings); this.display(); }));

    /* ── API Key + Test ── */
    heading(L("Authentication", "Xác thực"));
    const keySetting = new Setting(el)
      .setName("API Key")
      .setDesc(L(`API key for ${providerLabel}.`, `API key cho ${providerLabel}.`));

    keySetting.addText(t => {
      t.inputEl.type = "password";
      t.inputEl.setCssStyles({ width: "260px", fontFamily: "monospace" });
      t.setPlaceholder(provider === "gemini" ? "AIzaSy..." : "sk-...")
        .setValue(ai.apiKeys?.[provider] || "")
        .onChange(async v => {
          if (!ai.apiKeys) ai.apiKeys = {};
          ai.apiKeys[provider] = v.trim();
          if (provider === "openai") ai.apiKey = v.trim();
          await this.plugin.saveData(this.plugin.settings);
        });
    });

    /* status badge */
    const statusEl = el.createDiv({ cls: "pdl-conn-status" });
    const setStatus = (ok, msg) => {
      statusEl.empty();
      const icon = statusEl.createSpan({ cls: "pdl-conn-icon" });
      icon.textContent = ok === true ? "✓" : ok === false ? "✗" : "⟳";
      icon.addClass(ok === true ? "is-ok" : ok === false ? "is-error" : "is-pending");
      statusEl.createSpan({ text: " " + msg });
    };

    new Setting(el)
      .setName(L("Test connection", "Kiểm tra kết nối"))
      .setDesc(L("Verify that the API key and endpoint are working.", "Xác nhận API key và endpoint hoạt động."))
      .addButton(btn => btn
        .setButtonText(L("Test", "Kiểm tra"))
        .setCta()
        .onClick(async () => {
          const key = ai.apiKeys?.[provider] || "";
          const ep  = ai.endpoints?.[provider] || "";
          const mdl = ai.models?.[provider] || "";
          btn.setDisabled(true).setButtonText(L("Testing…", "Đang kiểm tra…"));
          setStatus(null, L("Connecting…", "Đang kết nối…"));
          try {
            await testConnection(provider, key, ep, mdl);
            setStatus(true, L("Connected successfully!", "Kết nối thành công!"));
          } catch (err) {
            setStatus(false, err.message);
          } finally {
            btn.setDisabled(false).setButtonText(L("Test", "Kiểm tra"));
          }
        }));

    /* ── Model ── */
    heading("Model");

    /* model dropdown (populated after fetch) */
    const modelRow = new Setting(el)
      .setName(L("Model", "Model"))
      .setDesc(L("Choose the model to use for flashcard generation.", "Chọn model để tạo flashcard."));

    const currentModel = ai.models?.[provider] || "";

    const buildModelDropdown = (models) => {
      modelRow.controlEl.empty();
      modelRow.addDropdown(d => {
        const set = new Set(models);
        if (currentModel && !set.has(currentModel)) d.addOption(currentModel, currentModel);
        models.forEach(m => d.addOption(m, m));
        d.setValue(ai.models?.[provider] || models[0] || "");
        d.onChange(async v => {
          if (!ai.models) ai.models = {};
          ai.models[provider] = v;
          if (provider === "openai") ai.model = v;
          await this.plugin.saveData(this.plugin.settings);
        });
      });
    };

    /* seed with known models immediately */
    buildModelDropdown(KNOWN_MODELS[provider] || [currentModel].filter(Boolean));

    /* fetch real list */
    modelRow.addButton(btn => btn
      .setButtonText(L("Fetch models", "Tải danh sách model"))
      .onClick(async () => {
        const key = ai.apiKeys?.[provider] || "";
        const ep  = ai.endpoints?.[provider] || "";
        btn.setDisabled(true).setButtonText(L("Loading…", "Đang tải…"));
        try {
          const models = await fetchModels(provider, key, ep);
          buildModelDropdown(models);
          new Notice(L(`Loaded ${models.length} models.`, `Đã tải ${models.length} model.`), 2500);
        } catch {
          new Notice(L("Could not fetch model list.", "Không thể tải danh sách model."), 3000);
        } finally {
          btn.setDisabled(false).setButtonText(L("Fetch models", "Tải danh sách model"));
        }
      }));

    /* manual override text */
    new Setting(el)
      .setName(L("Or type model name manually", "Hoặc nhập tên model thủ công"))
      .setDesc(L("Overrides the dropdown above.", "Ghi đè lựa chọn ở trên."))
      .addText(t => {
        t.inputEl.setCssStyles({ width: "220px" });
        t.setPlaceholder(KNOWN_MODELS[provider]?.[0] || "")
          .setValue(ai.models?.[provider] || "")
          .onChange(async v => {
            if (!ai.models) ai.models = {};
            ai.models[provider] = v.trim();
            if (provider === "openai") ai.model = v.trim();
            await this.plugin.saveData(this.plugin.settings);
          });
      });

    /* ── Endpoint (not Gemini) ── */
    if (provider !== "gemini") {
      heading("API Endpoint");
      new Setting(el)
        .setName(L("Base URL", "URL gốc"))
        .setDesc(L("Leave blank to use the default for this provider.", "Để trống để dùng mặc định của nhà cung cấp."))
        .addText(t => {
          const placeholders = {
            openai:   "https://api.openai.com/v1/chat/completions",
            deepseek: "https://api.deepseek.com/chat/completions",
            claude:   "https://api.anthropic.com/v1/messages",
            custom:   "https://your-host/v1/chat/completions",
          };
          t.inputEl.setCssStyles({ width: "340px" });
          t.setPlaceholder(placeholders[provider] || "")
            .setValue(ai.endpoints?.[provider] || "")
            .onChange(async v => {
              if (!ai.endpoints) ai.endpoints = {};
              ai.endpoints[provider] = v.trim();
              if (provider === "openai") ai.endpoint = v.trim();
              await this.plugin.saveData(this.plugin.settings);
            });
        });
    }

    /* ── Custom Prompts ── */
    heading(L("Custom Prompts", "Prompt tùy chỉnh"));
    el.createEl("p", { text: L("Use {basicCount}, {mcqCount}, {clozeCount} as placeholders.", "Dùng {basicCount}, {mcqCount}, {clozeCount} làm biến."), cls: "setting-item-description" });

    const prompts = this.plugin.settings.aiPrompts || DEFAULT_AI_PROMPTS;
    prompts.forEach((promptItem, idx) => {
      const pBox = el.createDiv({ cls: "pdl-prompt-setting-box" });
      new Setting(pBox)
        .setName(L(`Preset ${idx + 1}: ${promptItem.name}`, `Preset ${idx + 1}: ${promptItem.name}`))
        .setDesc(promptItem.id === "default" ? L("Default System Prompt", "Prompt hệ thống mặc định") : L(`Preset ID: ${promptItem.id}`, `ID preset: ${promptItem.id}`))
        .addExtraButton(btn => btn.setIcon("trash").setTooltip(L("Delete", "Xóa")).onClick(async () => {
          if (prompts.length <= 1) { new Notice(L("You must keep at least one prompt preset.", "Phải giữ lại ít nhất một preset.")); return; }
          this.plugin.settings.aiPrompts.splice(idx, 1);
          if (this.plugin.settings.selectedPromptId === promptItem.id)
            this.plugin.settings.selectedPromptId = this.plugin.settings.aiPrompts[0].id;
          await this.plugin.saveData(this.plugin.settings); this.display();
        }));
      new Setting(pBox).setName(L("Preset Name", "Tên preset")).addText(t => t.setValue(promptItem.name).onChange(async v => { promptItem.name = v.trim() || L(`Preset ${idx + 1}`, `Preset ${idx + 1}`); await this.plugin.saveData(this.plugin.settings); }));
      new Setting(pBox).setName(L("Prompt Template", "Mẫu prompt")).addTextArea(t => t.setValue(promptItem.template).onChange(async v => { promptItem.template = v; await this.plugin.saveData(this.plugin.settings); }));
    });

    new Setting(el)
      .setName(L("Add New Prompt Preset", "Thêm preset mới"))
      .setDesc(L("Create a new prompt template with custom instructions.", "Tạo mẫu prompt mới với hướng dẫn riêng."))
      .addButton(btn => btn.setButtonText(L("Add Preset", "Thêm preset")).setCta().onClick(async () => {
        const newId = `custom_${Date.now()}`;
        this.plugin.settings.aiPrompts.push({
          id: newId, name: L("New Prompt Preset", "Preset mới"),
          template: `Create flashcards from the note below.\n- {basicCount} Q&A cards (type="basic", question, answer, explanation, tags)\n- {mcqCount} MCQ cards (type="multiple-choice", question, 4 choices, answer, explanation, tags)\n- {clozeCount} Cloze cards (type="cloze", question with {{c1::hidden text}}, answer, explanation, tags)`,
        });
        await this.plugin.saveData(this.plugin.settings); this.display();
      }));
  }

  /* ─────────────────── FEEDBACK TAB ─────────────────── */
  _renderFeedback(el) {
    const GMAIL = "luongpham162k@gmail.com";

    /* Hero banner */
    const hero = el.createDiv({ cls: "pdl-fb-hero" });
    hero.createDiv({ cls: "pdl-fb-emoji", text: "💌" });
    const heroTitle = new Setting(hero).setName(L("Send feedback to the developer", "Gửi phản hồi cho tác giả")).setHeading();
    heroTitle.settingEl?.addClass("pdl-fb-title");
    hero.createEl("p", {
      text: L(
        "Your feedback helps improve PDL Flashcard. Bug reports, feature ideas, and general thoughts are all welcome!",
        "Phản hồi của bạn giúp PDL Flashcard ngày càng tốt hơn. Báo lỗi, đề xuất tính năng hay ý kiến chung đều được hoan nghênh!"
      ),
      cls: "pdl-fb-desc",
    });

    /* Form card */
    const card = el.createDiv({ cls: "pdl-fb-card" });

    /* Type selector */
    card.createEl("label", { text: L("Type", "Loại phản hồi"), cls: "pdl-fb-label" });
    const typeWrap = card.createDiv({ cls: "pdl-fb-types" });
    const types = [
      { id: "bug",     icon: "🐛", label: L("Bug report",   "Báo lỗi")       },
      { id: "feature", icon: "✨", label: L("Feature idea", "Đề xuất tính năng") },
      { id: "other",   icon: "💬", label: L("Other",        "Khác")             },
    ];
    let selectedType = "bug";
    const typeBtns = {};
    types.forEach(({ id, icon, label }) => {
      const btn = typeWrap.createEl("button", { cls: "pdl-fb-type-btn" + (id === selectedType ? " is-active" : "") });
      btn.createSpan({ text: icon, cls: "pdl-fb-type-icon" });
      btn.createSpan({ text: label });
      typeBtns[id] = btn;
      btn.onclick = () => {
        selectedType = id;
        Object.entries(typeBtns).forEach(([k, b]) => b.classList.toggle("is-active", k === id));
      };
    });

    /* Subject */
    card.createEl("label", { text: L("Subject", "Tiêu đề"), cls: "pdl-fb-label" });
    const subjectInput = card.createEl("input", { cls: "pdl-fb-input", attr: { type: "text", placeholder: L("Briefly describe your feedback…", "Mô tả ngắn gọn phản hồi của bạn…") } });

    /* Message */
    card.createEl("label", { text: L("Message", "Nội dung"), cls: "pdl-fb-label" });
    const msgInput = card.createEl("textarea", { cls: "pdl-fb-textarea", attr: { placeholder: L("Describe in detail. Include steps to reproduce if reporting a bug.", "Mô tả chi tiết. Nếu báo lỗi, hãy nêu các bước để tái hiện lỗi."), rows: "6" } });

    /* Plugin version info (auto-append) */
    const manifest = this.plugin.manifest;
    const versionLine = `\n\n---\nPlugin: PDL Flashcard v${manifest?.version ?? "?"}  |  Obsidian: ${this.app.version ?? "?"}`;

    /* Send button */
    const actions = card.createDiv({ cls: "pdl-fb-actions" });
    const sendBtn = actions.createEl("button", { cls: "pdl-fb-send", text: L("Open in mail app  ✉️", "Mở ứng dụng mail  ✉️") });
    sendBtn.onclick = () => {
      const subj = subjectInput.value.trim() || L(`[PDL Flashcard] ${selectedType}`, `[PDL Flashcard] ${selectedType}`);
      const typeLabel = types.find(t => t.id === selectedType)?.label ?? selectedType;
      const body = `[${typeLabel}]\n\n${msgInput.value.trim()}${versionLine}`;
      const mailto = `mailto:${GMAIL}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
      window.open(mailto);
    };

    /* Direct email hint */
    const hint = el.createDiv({ cls: "pdl-fb-hint" });
    hint.createSpan({ text: L("Or email directly: ", "Hoặc email trực tiếp: ") });
    const link = hint.createEl("a", { text: GMAIL, href: `mailto:${GMAIL}`, cls: "pdl-fb-email-link" });
    link.setAttr("target", "_blank");
  }
}
