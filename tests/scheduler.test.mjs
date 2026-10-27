/**
 * Spaced-repetition behaviour: grade curves, leech detection, suspend/bury and
 * the review log. These exercise the scheduler mixin through the built bundle.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { installDom, loadBundle, makePlugin } from "./helpers/harness.js";

installDom();

const { PluginClass, stub } = loadBundle();

const DAY = 86400000;
const card = (id = "c1", question = "Question?") => ({ id, question, answer: "Answer" });

test("Again resets the card to a ten minute step and counts a lapse", async () => {
  const plugin = makePlugin(PluginClass, stub);
  const target = card();
  await plugin.rate(target, 1);
  const entry = plugin.settings.schedule.c1;
  assert.equal(entry.interval, 10 / 1440);
  assert.equal(entry.reps, 1);
  assert.equal(entry.lapses, 1);
  assert.equal(entry.lastGrade, 1);
  assert.ok(entry.due > Date.now() + 9 * 60000, "due roughly ten minutes out");
  assert.ok(entry.due < Date.now() + 11 * 60000);
});

test("Hard, Good and Easy grow from zero with distinct first steps", async () => {
  const plugin = makePlugin(PluginClass, stub);
  for (const [grade, expected] of [[2, 1], [3, 2], [4, 4]]) {
    const target = card(`g${grade}`);
    await plugin.rate(target, grade);
    assert.equal(plugin.settings.schedule[`g${grade}`].interval, expected, `grade ${grade} first interval`);
  }
});

test("later grades multiply the previous interval", async () => {
  const plugin = makePlugin(PluginClass, stub);
  for (const [grade, factor] of [[2, 1.35], [3, 2.4], [4, 3.6]]) {
    const id = `m${grade}`;
    plugin.settings.schedule[id] = { interval: 10, reps: 3, lapses: 0, due: Date.now() - 1 };
    await plugin.rate(card(id), grade);
    assert.equal(plugin.settings.schedule[id].interval, Math.max(1, 10 * factor), `grade ${grade} grows by ${factor}x`);
    assert.equal(plugin.settings.schedule[id].reps, 4);
  }
});

test("maxIntervalDays caps every grade", async () => {
  const plugin = makePlugin(PluginClass, stub, { settings: { maxIntervalDays: 10 } });
  const target = card("cap");
  for (let i = 0; i < 12; i++) await plugin.rate(target, 4);
  assert.equal(plugin.settings.schedule.cap.interval, 10, "interval never exceeds the configured ceiling");
});

test("review log is capped and the daily streak is recorded once", async () => {
  const plugin = makePlugin(PluginClass, stub);
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  plugin.settings.reviews = Array.from({ length: 4000 }, (_, i) => ({ cardId: `old${i}`, grade: 3, at: 1 }));
  plugin.settings.streakDates = [key];
  await plugin.rate(card("fresh"), 3);
  assert.equal(plugin.settings.reviews.length, 4000, "oldest review rolled off");
  assert.equal(plugin.settings.reviews.at(-1).cardId, "fresh");
  assert.deepEqual(plugin.settings.streakDates, [key], "today is not duplicated");
});

test("leechThreshold 0 disables auto-suspension", async () => {
  const plugin = makePlugin(PluginClass, stub, { settings: { leechThreshold: 0 } });
  const target = card("never-leech");
  for (let i = 0; i < 20; i++) await plugin.rate(target, 1);
  assert.equal(plugin.settings.schedule["never-leech"].lapses, 20);
  assert.equal(plugin.settings.schedule["never-leech"].suspended, false);
  assert.equal(plugin.isCardAvailable(target), true);
});

test("a card is suspended on the Nth lapse and stays suspended", async () => {
  stub.notices.length = 0;
  const plugin = makePlugin(PluginClass, stub, { settings: { leechThreshold: 3 } });
  const target = card("leech", "A badly written card");
  await plugin.rate(target, 1);
  await plugin.rate(target, 1);
  assert.equal(plugin.settings.schedule.leech.suspended, false, "below threshold");
  await plugin.rate(target, 1);
  assert.equal(plugin.settings.schedule.leech.suspended, true, "suspended on the third lapse");
  assert.ok(stub.notices.some(note => note.includes("leech") || note.includes("tạm dừng")), "user is told why");
  await plugin.rate(target, 1);
  assert.equal(plugin.settings.schedule.leech.suspended, true);
  assert.equal(plugin.isCardAvailable(target), false);
});

test("grading preserves suspend and bury state", async () => {
  const plugin = makePlugin(PluginClass, stub);
  const target = card("keep");
  await plugin.setSuspended(target, true);
  await plugin.buryCard(target);
  await plugin.rate(target, 3);
  assert.equal(plugin.settings.schedule.keep.suspended, true);
  assert.ok(plugin.settings.schedule.keep.buriedUntil > Date.now());
});

test("bury hides a card until the next local midnight", async () => {
  const plugin = makePlugin(PluginClass, stub);
  const target = card("b1");
  await plugin.buryCard(target);
  const entry = plugin.settings.schedule.b1;
  assert.equal(plugin.isCardAvailable(target), false);
  assert.equal(plugin.isCardAvailable(target, entry.buriedUntil - 1), false);
  assert.equal(plugin.isCardAvailable(target, entry.buriedUntil + 1), true);
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  assert.equal(entry.buriedUntil, tomorrow.getTime(), "hidden exactly until tomorrow");
});

test("suspend then unsuspend restores availability without losing schedule", async () => {
  const plugin = makePlugin(PluginClass, stub);
  const target = card("toggle");
  plugin.settings.schedule.toggle = { interval: 5, reps: 2, lapses: 1, due: Date.now() + 5 * DAY, suspended: false };
  await plugin.setSuspended(target, true);
  assert.equal(plugin.isCardAvailable(target), false);
  await plugin.setSuspended(target, false);
  assert.equal(plugin.isCardAvailable(target), true);
  assert.equal(plugin.settings.schedule.toggle.interval, 5, "schedule survives the toggle");
  assert.equal(plugin.settings.schedule.toggle.lapses, 1);
});

test("cards with no schedule are available", () => {
  const plugin = makePlugin(PluginClass, stub);
  assert.equal(plugin.isCardAvailable(card("unknown")), true);
});
