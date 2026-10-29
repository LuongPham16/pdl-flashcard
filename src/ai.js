/** AI integration: prompt assembly and provider request layer. */
import { requestUrl } from "obsidian";
import { DEFAULT_AI_PROMPTS } from "./constants.js";
import { cleanAndParseJSON, normalizeCardText } from "./utils.js";
import { L } from "./i18n.js";

/** Normalize every generated card before it reaches a draft or a deck. */
function normalizeGeneratedCards(cards, allowedTags = null) {
  return (Array.isArray(cards) ? cards : []).map(card => {
    const next = { ...card };
    for (const key of ["question", "answer", "explanation"]) {
      if (typeof next[key] === "string") next[key] = normalizeCardText(next[key]);
    }
    if (Array.isArray(next.choices)) next.choices = next.choices.map(choice => normalizeCardText(choice));
    if (Array.isArray(next.tags)) {
      const tags = next.tags.map(tag => normalizeCardText(tag).trim()).filter(Boolean);
      if (allowedTags) {
        const seen = new Set();
        next.tags = tags
          .map(tag => allowedTags.get(tag.replace(/^#/, "").toLowerCase()))
          .filter(tag => {
            if (!tag) return false;
            const key = tag.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
      } else {
        next.tags = tags;
      }
    }
    return next;
  });
}

function tagKey(tag) {
  return normalizeCardText(tag).replace(/^#/, "").trim().toLowerCase();
}

/** Mixed into PDLFlashcardPlugin in plugin.js. */
export class AiMethods {
  async generateWithAI(sourceFile, counts, promptId = "default", content = null) {
    if (!sourceFile) throw new Error(L("Choose a source note first.", "Hãy chọn một note nguồn trước."));
    const noteContent = typeof content === "string" ? content : await this.app.vault.cachedRead(sourceFile);
    return this.requestAICards(noteContent, counts, promptId);
  }

  /**
   * Generate cards from a plain text excerpt. This is the path used by the

  /**
   * Generate cards from a plain text excerpt. This is the path used by the
   * right-click "generate flashcard from selection" action, where only the
   * highlighted passage is sent to the model instead of a whole note.
   */
  async generateWithAIText(sourceFile, selectedText, counts, promptId = "default") {
    const selection = String(selectedText || "").trim();
    if (!selection) throw new Error(L("Select the text you want to turn into flashcards first.", "Hãy chọn đoạn văn bạn muốn chuyển thành flashcard trước."));
    const intent = `The STUDY MATERIAL below is an excerpt the user highlighted inside the note "${sourceFile?.basename || "untitled"}".
- Create cards for the highlighted excerpt only. Never use outside knowledge and never invent facts that are absent from it.
- Write in the same language as the excerpt.
- If the excerpt is too short for the requested counts, return fewer cards instead of padding with filler.`;
    return this.requestAICards(selection, counts, promptId, intent);
  }

  /** Tags already created by the user; AI may reuse these names only. */
  async getExistingTags() {
    const tags = new Map();
    try {
      const cards = await this.getCards();
      for (const card of cards) {
        for (const raw of card.tags || []) {
          const value = normalizeCardText(raw).trim();
          const key = tagKey(value);
          if (key && !tags.has(key)) tags.set(key, value);
        }
      }
    } catch (_) { /* tag validation is best-effort; generation still proceeds */ }
    return tags;
  }

  async requestAICards(content, counts, promptId = "default", extraInstruction = "") {
    const aiConfig = this.settings.ai;
    const provider = aiConfig.provider || "openai";
    const apiKey = aiConfig.apiKeys?.[provider] || aiConfig.apiKey;
    const endpoint = aiConfig.endpoints?.[provider] || aiConfig.endpoint;
    const model = aiConfig.models?.[provider] || aiConfig.model;

    if (!apiKey) throw new Error(L(`Please configure the API key for ${provider} in Settings → PDL Flashcard.`, `Hãy cấu hình API key cho ${provider} trong Cài đặt → PDL Flashcard.`));

    // Find selected prompt preset template
    const prompts = this.settings.aiPrompts || DEFAULT_AI_PROMPTS;
    const selectedPreset = prompts.find(p => p.id === promptId) || prompts[0] || DEFAULT_AI_PROMPTS[0];
    let templateStr = selectedPreset.template;

    // Replace placeholders in prompt template
    const promptText = templateStr
      .replace(/\{basicCount\}/g, String(counts.basic || 0))
      .replace(/\{mcqCount\}/g, String(counts.mcq || 0))
      .replace(/\{clozeCount\}/g, String(counts.cloze || 0));

    const existingTags = await this.getExistingTags();
    const allowedTags = [...existingTags.values()];
    const tagRule = allowedTags.length
      ? `ALLOWED TAGS (use only these exact names; if none fit a card, return an empty tags array; never invent a new tag): ${allowedTags.map(tag => `"${tag}"`).join(", ")}`
      : "ALLOWED TAGS: none. Return an empty tags array for every card; never invent a tag.";

    const extra = extraInstruction ? `${extraInstruction}\n\n` : "";
    const fullPrompt = `${extra}${promptText}\n\n${tagRule}\n\nNOTE CONTENT:\n${String(content || "").slice(0, 50000)}`;

    let response;
    if (provider === "gemini") {
      const actualModel = model || "gemini-3.8-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${apiKey}`;
      response = await requestUrl({
        url,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          systemInstruction: { parts: [{ text: "You are an expert active-recall flashcard designer. Return valid JSON format ONLY with shape {\"cards\":[...]}." }] },
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json"
          }
        })
      });
      
      const content = response.json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) throw new Error(L("The Gemini API response did not contain valid content.", "Phản hồi API Gemini không có nội dung hợp lệ."));
      const parsed = cleanAndParseJSON(content);
      return normalizeGeneratedCards(parsed.cards, existingTags);

    } else if (provider === "claude") {
      const actualEndpoint = endpoint || "https://api.anthropic.com/v1/messages";
      const actualModel = model || "claude-sonnet-5-5";
      response = await requestUrl({
        url: actualEndpoint,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: actualModel,
          max_tokens: 4096,
          system: "You are an expert active-recall flashcard designer. You MUST return valid JSON format ONLY.",
          messages: [{ role: "user", content: fullPrompt }]
        })
      });

      const content = response.json?.content?.[0]?.text;
      if (!content) throw new Error(L("The Claude API response did not contain valid content.", "Phản hồi API Claude không có nội dung hợp lệ."));
      const parsed = cleanAndParseJSON(content);
      return normalizeGeneratedCards(parsed.cards, existingTags);

    } else {
      const actualEndpoint = endpoint || "https://api.openai.com/v1/chat/completions";
      const actualModel = model || "gpt-6-luna";
      response = await requestUrl({
        url: actualEndpoint,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: actualModel,
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "You are an expert active-recall flashcard designer. You MUST return valid JSON format ONLY." },
            { role: "user", content: fullPrompt }
          ]
        })
      });

      const content = response.json?.choices?.[0]?.message?.content;
      if (!content) throw new Error(L("The AI response did not contain valid content.", "Phản hồi AI không có nội dung hợp lệ."));
      const parsed = cleanAndParseJSON(content);
      return normalizeGeneratedCards(parsed.cards, existingTags);
    }
  }
}
