/** Shared constants used across the plugin. */

const VIEW_TYPE = "pdl-flashcard-view";
const DAY = 86400000;

/**
 * Shared output rules. Applied to every built-in AI preset so generated cards
 * keep a consistent typography: plain spaces only, no stray indentation that
 * would look like a code block, and every command wrapped in a code fence so
 * the review UI can render it as real code instead of prose.
 */
const AI_FORMAT_RULES = `Output formatting rules (important):
- Write plain text with single spaces. Do not use non-breaking spaces, tabs, zero-width characters, or multiple consecutive spaces outside code.
- Do not add leading indentation to normal sentences; unindented text renders as prose, indented text renders as code.
- Wrap any command, config key, file path, function name, or short code fragment in single backticks, for example: run \`docker ps\` to list containers.
- If an answer contains a command, script, config file, YAML/JSON, or more than one line of code, put it in a fenced code block with a language tag, using JSON escaped newlines (\\n) inside the JSON string.
- Put the full runnable command in the fenced block and keep surrounding explanation in normal prose.
- Never rely on your own indentation or line wrapping for structure; keep sequences explicit.`;

const DEFAULT_AI_PROMPTS = [
  {
    id: "default",
    name: "Default (Any Subject & Audience)",
    template: `Create active-recall flashcards from the note below. The note may cover any subject: science, history, language, business, law, health, arts, personal knowledge, or technical work. Write in the same language as the note. Return valid JSON format ONLY with shape {"cards":[...]}.

Audience & domain:
- Infer the subject and the likely audience/difficulty from the note. Do not assume the reader is a software developer or that the topic is technical.
- Use the note's own terminology, examples and level of detail. Do not add outside facts or invent examples.
- If the note is technical, keep technical precision. If it is general, explain in plain language for an interested adult learner.
- Avoid unexplained acronyms and jargon that the note does not define.

Card rules:
- Create {basicCount} basic cards with type="basic", question, answer, explanation, tags (array of string keywords).
- Create {mcqCount} multiple-choice cards with type="multiple-choice", question, exactly four string choices, answer matching one choice, explanation, tags.
- Create {clozeCount} cloze deletion cards with type="cloze", question containing {{c1::key term}} or ==key term==, answer containing the key term, explanation, tags.
- Test active recall and conceptual understanding, not trivia or yes/no questions. One idea per card; avoid vague or overly broad questions.

${AI_FORMAT_RULES}`
  },
  {
    id: "language",
    name: "Language Learning (Vocabulary & Grammar Cloze)",
    template: `Create language-learning flashcards from the note below focusing on vocabulary, phrase definitions, and grammar usage. Return valid JSON ONLY with shape {"cards":[...]}.
- Create {basicCount} basic Q&A cards for word/phrase definition.
- Create {mcqCount} multiple-choice cards for vocabulary choice.
- Create {clozeCount} cloze deletion cards using {{c1::target word}} in an example sentence.

${AI_FORMAT_RULES}`
  }
];

/** Old shipped defaults; migrated forward on load so they never keep hitting retired models. */
const LEGACY_DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
  deepseek: "deepseek-chat",
  claude: "claude-3-5-sonnet-20241022"
};

const DEFAULTS = {
  schemaVersion: 3,
  language: "en",
  decksPerPage: 5,
  defaultBasicCount: 4,
  defaultMcqCount: 3,
  defaultClozeCount: 3,
  defaultReverseCards: false,
  heatmapPalette: "blue",
  heatmapShape: "rounded-rectangle",
  ttsVoice: "",
  ttsRate: 1,
  outputFolder: "06 - Flashcards",
  sourceFolders: ["00 - Inbox", "02 - Projects", "03 - Area", "04 - Journal", "05 - Tasks", "99 - Archive"],
  excludedFolders: ["99 - Archive/Templates", "99 - Archive/PDL-Templates", "_agent", "Decks Templates", "Canvas decks"],
  sessionSize: 12,
  minAnswerLength: 36,
  requeueForgotten: true,
  requeueLimit: 2,
  leechThreshold: 8,
  maxIntervalDays: 36500,
  schedule: {},
  reviews: [],
  streakDates: [],
  aiPrompts: DEFAULT_AI_PROMPTS,
  selectedPromptId: "default",
  ai: {
    provider: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-6-luna",
    apiKey: "",
    apiKeys: {
      openai: "",
      gemini: "",
      deepseek: "",
      claude: "",
      custom: ""
    },
    endpoints: {
      openai: "https://api.openai.com/v1/chat/completions",
      gemini: "",
      deepseek: "https://api.deepseek.com/chat/completions",
      claude: "https://api.anthropic.com/v1/messages",
      custom: ""
    },
    models: {
      openai: "gpt-6-luna",
      gemini: "gemini-3.8-flash",
      deepseek: "deepseek-flash",
      claude: "claude-sonnet-5-5",
      custom: ""
    }
  }
};

export {
  VIEW_TYPE,
  DAY,
  AI_FORMAT_RULES,
  DEFAULT_AI_PROMPTS,
  LEGACY_DEFAULT_MODELS,
  DEFAULTS
};
