/**
 * Tiny UI localization helper.
 *
 * English is the source language and the default; `L()` keeps the Vietnamese
 * string next to the English one so a screen can be audited in one place. The
 * language is stored in settings (`en` | `vi`) and applied on load.
 */
let language = "en";

function setLanguage(value) {
  language = value === "vi" ? "vi" : "en";
}

function getLanguage() {
  return language;
}

/** Pick the English or Vietnamese variant. */
function L(english, vietnamese) {
  return language === "vi" ? vietnamese : english;
}

/** Locale used for dates and numbers. */
function locale() {
  return language === "vi" ? "vi-VN" : "en-US";
}

export { setLanguage, getLanguage, L, locale };
