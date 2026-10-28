/** Spaced repetition: grading, leech detection, suspend, bury and availability. */
import { Notice } from "obsidian";
import { DAY } from "./constants.js";
import { dateKey, truncateLabel } from "./utils.js";
import { L } from "./i18n.js";

/** Mixed into PDLFlashcardPlugin in plugin.js. */
export class ReviewMethods {
  async rate(card, grade) {
    const now = Date.now();
    const previous = this.settings.schedule[card.id] || { interval: 0, reps: 0, lapses: 0 };
    let interval;
    if (grade === 1) interval = 10 / 1440;
    else if (grade === 2) interval = Math.max(1, previous.interval * 1.35 || 1);
    else if (grade === 3) interval = Math.max(2, previous.interval * 2.4 || 2);
    else interval = Math.max(4, previous.interval * 3.6 || 4);
    // A very long interval is rarely useful; keep it inside a sane ceiling.
    interval = Math.min(interval, Number(this.settings.maxIntervalDays) || 36500);
    const lapses = previous.lapses + (grade === 1 ? 1 : 0);
    this.settings.schedule[card.id] = {
      interval, due: now + interval * DAY, reps: previous.reps + 1,
      lapses, lastGrade: grade, lastReviewed: now,
      suspended: previous.suspended === true,
      buriedUntil: previous.buriedUntil || 0
    };
    this.settings.reviews.push({ cardId: card.id, grade, at: now });
    this.settings.reviews = this.settings.reviews.slice(-4000);
    const today = dateKey(now);
    if (!this.settings.streakDates.includes(today)) this.settings.streakDates.push(today);
    this.settings.streakDates = this.settings.streakDates.slice(-730);
    await this.saveData(this.settings);
    // Leech handling: a card failed this often is probably badly written, so stop
    // grinding on it and surface it for rewriting instead (Anki does the same).
    // 0 is a meaningful value (disable leech detection); only a missing setting
    // falls back to the Anki-like default of 8.
    const threshold = this.settings.leechThreshold == null ? 8 : Number(this.settings.leechThreshold);
    const entry = this.settings.schedule[card.id];
    if (grade === 1 && threshold > 0 && lapses > 0 && lapses % threshold === 0 && !entry.suspended) {
      entry.suspended = true;
      await this.saveData(this.settings);
      new Notice(L(`"${truncateLabel(card.question)}" was suspended after ${lapses} lapses (leech). Rewrite this card.`, `"${truncateLabel(card.question)}" đã bị tạm dừng sau ${lapses} lần quên (leech). Nên viết lại thẻ này.`), 6000);
    }
  }

  /** Suspend / unsuspend a card so it leaves (or rejoins) every review queue. */
  async setSuspended(card, suspended) {
    const id = card.id;
    const entry = this.settings.schedule[id] || { interval: 0, reps: 0, lapses: 0, due: Date.now() };
    this.settings.schedule[id] = { ...entry, suspended: suspended === true };
    await this.saveData(this.settings);
    const view = this.getView(); if (view) await view.refresh();
  }

  /** Hide a card until tomorrow so the same idea is not asked twice in one day. */
  async buryCard(card) {
    const id = card.id;
    const tomorrow = new Date(); tomorrow.setHours(0, 0, 0, 0); tomorrow.setDate(tomorrow.getDate() + 1);
    const entry = this.settings.schedule[id] || { interval: 0, reps: 0, lapses: 0, due: Date.now() };
    this.settings.schedule[id] = { ...entry, buriedUntil: tomorrow.getTime() };
    await this.saveData(this.settings);
  }

  /** True when a card must not appear in a review session right now. */
  isCardAvailable(card, now = Date.now()) {
    const entry = this.settings.schedule[card.id];
    if (!entry) return true;
    if (entry.suspended) return false;
    if (entry.buriedUntil && entry.buriedUntil > now) return false;
    return true;
  }
}
