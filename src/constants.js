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
    name: "Default (Active Recall & Deep Understanding)",
    template: `Create flashcards from the note below, using only information present in the note. Write questions in the same language as the source note. Return valid JSON format ONLY with shape {"cards":[...]}.
- Create {basicCount} basic cards with type="basic", question, answer, explanation, tags (array of string keywords).
- Create {mcqCount} multiple-choice cards with type="multiple-choice", question, exactly four string choices, answer matching one choice, explanation, tags.
- Create {clozeCount} cloze deletion cards with type="cloze", question containing {{c1::key term}} or ==key term==, answer containing the key term, explanation, tags.
Test active recall and conceptual understanding. Avoid vague questions.

${AI_FORMAT_RULES}`
  },
  {
    id: "technical",
    name: "Technical & DevOps (Commands & Code Cloze)",
    template: `Create technical flashcards from the note below, focusing on command line syntax, architecture concepts, code snippets, and configuration keys. Write in the same language as the source note. Return valid JSON ONLY with shape {"cards":[...]}.
- Create {basicCount} basic cards (type="basic", question, answer, explanation, tags).
- Create {mcqCount} multiple-choice cards (type="multiple-choice", question, 4 choices, answer, explanation, tags).
- Create {clozeCount} cloze deletion cards (type="cloze", question with {{c1::code or command}}, answer, explanation, tags).

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
  heatmapShape: "square",
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
