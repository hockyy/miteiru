import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  dueCards,
  flashKeyAction,
  formatTimeUntil,
  nextReviewText,
  reviewWording,
  type CardEntry
} from "../renderer/utils/flashcards";

const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const card = (word: string, updTime: number): CardEntry => [word, {level: 1, updTime}];

describe("dueCards", () => {
  it("keeps only cards whose time has come, most overdue first", () => {
    const cards = [card("b", NOW - DAY), card("later", NOW + 2 * DAY), card("a", NOW - 3 * DAY), card("now", NOW)];
    assert.deepEqual(dueCards(cards, NOW).map(([word]) => word), ["a", "b", "now"]);
  });

  it("is empty when nothing is due", () => {
    assert.deepEqual(dueCards([card("x", NOW + 1)], NOW), []);
  });
});

describe("formatTimeUntil", () => {
  it("speaks in days, hours and minutes", () => {
    assert.equal(formatTimeUntil(NOW + 3 * DAY, NOW), "3 days");
    assert.equal(formatTimeUntil(NOW + 2 * DAY - HOUR, NOW), "2 days");
    assert.equal(formatTimeUntil(NOW + 5 * HOUR, NOW), "5 hours");
    assert.equal(formatTimeUntil(NOW + 20 * 60 * 1000, NOW), "20 minutes");
    assert.equal(formatTimeUntil(NOW + 1000, NOW), "1 minute");
  });

  it("calls about a day a day", () => {
    assert.equal(formatTimeUntil(NOW + DAY, NOW), "1 day");
    assert.equal(formatTimeUntil(NOW + 24 * HOUR - 10 * 60 * 1000, NOW), "1 day");
  });
});

describe("nextReviewText", () => {
  it("names the soonest upcoming card", () => {
    const cards = [card("a", NOW + 5 * DAY), card("b", NOW + 2 * DAY), card("c", NOW - DAY)];
    assert.equal(nextReviewText(cards, NOW), "Next review in 2 days");
  });

  it("is null when nothing is waiting", () => {
    assert.equal(nextReviewText([card("a", NOW - DAY)], NOW), null);
    assert.equal(nextReviewText([], NOW), null);
  });
});

describe("flashKeyAction", () => {
  it("shows the answer on Space, once", () => {
    assert.deepEqual(flashKeyAction(" ", false), {type: "show"});
    assert.equal(flashKeyAction(" ", true), null);
  });

  it("grades 1-4 as hard, good, easy, banish once the answer shows", () => {
    assert.deepEqual(flashKeyAction("1", true), {type: "grade", difficulty: "hard"});
    assert.deepEqual(flashKeyAction("2", true), {type: "grade", difficulty: "good"});
    assert.deepEqual(flashKeyAction("3", true), {type: "grade", difficulty: "easy"});
    assert.deepEqual(flashKeyAction("4", true), {type: "grade", difficulty: "banish"});
  });

  it("ignores grades before the answer and other keys", () => {
    assert.equal(flashKeyAction("2", false), null);
    assert.equal(flashKeyAction("5", true), null);
    assert.equal(flashKeyAction("a", true), null);
  });
});

describe("reviewWording", () => {
  it("says Review in … for a future date", () => {
    assert.equal(reviewWording(NOW + 3 * DAY, NOW, "3 days from now"), "Review in 3 days");
    assert.equal(reviewWording(NOW + 90 * 60 * 1000, NOW, "x"), "Review in 2 hours");
  });

  it("keeps Learned … ago for a past date", () => {
    assert.equal(reviewWording(NOW - 2 * DAY, NOW, "2 days ago"), "Learned 2 days ago");
  });
});
