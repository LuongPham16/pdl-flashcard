/** AI integration: prompt assembly and provider request layer. */
import { requestUrl } from "obsidian";
import { DEFAULT_AI_PROMPTS } from "./constants.js";
import { cleanAndParseJSON } from "./utils.js";

/** Mixed into PDLFlashcardPlugin in plugin.js. */
export class AiMethods {
  async generateWithAI(sourceFile, counts, promptId = "default", content = null) {
    if (!sourceFile) throw new Error("Choose a source note first.");
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
    if (!selection) throw new Error("Select the text you want to turn into flashcards first.");
    const intent = `The STUDY MATERIAL below is an excerpt the user highlighted inside the note "${sourceFile?.basename || "untitled"}".
- Create cards for the highlighted excerpt only. Never use outside knowledge and never invent facts that are absent from it.
- Write in the same language as the excerpt.
- If the excerpt is too short for the requested counts, return fewer cards instead of padding with filler.`;
    return this.requestAICards(selection, counts, promptId, intent);
  }

  async requestAICards(content, counts, promptId = "default", extraInstruction = "") {
    const aiConfig = this.settings.ai;
    const provider = aiConfig.provider || "openai";
    const apiKey = aiConfig.apiKeys?.[provider] || aiConfig.apiKey;
    const endpoint = aiConfig.endpoints?.[provider] || aiConfig.endpoint;
    const model = aiConfig.models?.[provider] || aiConfig.model;

    if (!apiKey) throw new Error(`Please configure the API key for ${provider} in Settings → PDL Flashcard.`);

    // Find selected prompt preset template
    const prompts = this.settings.aiPrompts || DEFAULT_AI_PROMPTS;
    const selectedPreset = prompts.find(p => p.id === promptId) || prompts[0] || DEFAULT_AI_PROMPTS[0];
    let templateStr = selectedPreset.template;

    // Replace placeholders in prompt template
    const promptText = templateStr
      .replace(/\{basicCount\}/g, String(counts.basic || 0))
      .replace(/\{mcqCount\}/g, String(counts.mcq || 0))
      .replace(/\{clozeCount\}/g, String(counts.cloze || 0));

    const extra = extraInstruction ? `${extraInstruction}\n\n` : "";
    const fullPrompt = `${extra}${promptText}\n\nNOTE CONTENT:\n${String(content || "").slice(0, 50000)}`;

    let response;
    if (provider === "gemini") {
      const actualModel = model || "gemini-2.5-flash";
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
      if (!content) throw new Error("The Gemini API response did not contain valid content.");
      const parsed = cleanAndParseJSON(content);
      return Array.isArray(parsed.cards) ? parsed.cards : [];

    } else if (provider === "claude") {
      const actualEndpoint = endpoint || "https://api.anthropic.com/v1/messages";
      const actualModel = model || "claude-3-5-sonnet-20241022";
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
      if (!content) throw new Error("The Claude API response did not contain valid content.");
      const parsed = cleanAndParseJSON(content);
      return Array.isArray(parsed.cards) ? parsed.cards : [];

    } else {
      const actualEndpoint = endpoint || "https://api.openai.com/v1/chat/completions";
      const actualModel = model || "gpt-4o-mini";
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
      if (!content) throw new Error("The AI response did not contain valid content.");
      const parsed = cleanAndParseJSON(content);
      return Array.isArray(parsed.cards) ? parsed.cards : [];
    }
  }
}
