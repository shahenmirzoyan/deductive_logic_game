"use strict";

const assert = require("assert");
const {
  computeOptimalChecks,
  evaluateRule,
  solveAdversarialState,
} = require("./logic_backend");

function runTests() {
  testUniversalCanPunishYes();
  testUniversalCanPunishNo();
  testExistentialCanPunishEarlyYes();
  testExistentialRecognizesCorrectNo();
  testUniversalRecognizesKnownViolation();
  testOptimalChecksForUniversal();
  testOptimalChecksForExistential();
  console.log("logic_backend tests passed");
}

function testUniversalCanPunishYes() {
  const result = solveAdversarialState({
    state: {
      cards: [
        { id: 1, seen: ["white"] },
        { id: 2, seen: ["white"] },
        { id: 3, seen: ["red"] },
        { id: 4, seen: ["black"] },
      ],
    },
    rule: {
      kind: "universal",
      one_side: "black",
      other_side: "white",
    },
    answer: true,
  });

  assert.equal(result.status, "adversarial");
  assert.equal(result.rule_holds, false);
  assert.equal(
    evaluateRule(
      result.cards.map((card) => ({ sides: card.sides })),
      { kind: "universal", one_side: "black", other_side: "white" }
    ),
    false
  );
}

function testUniversalCanPunishNo() {
  const result = solveAdversarialState({
    state: {
      cards: [
        { seen: ["white"] },
        { seen: ["white"] },
        { seen: ["red"] },
        { seen: ["black"] },
      ],
    },
    rule: {
      kind: "universal",
      one_side: "black",
      other_side: "white",
    },
    answer: false,
  });

  assert.equal(result.status, "adversarial");
  assert.equal(result.rule_holds, true);
}

function testExistentialCanPunishEarlyYes() {
  const result = solveAdversarialState({
    state: {
      cards: [
        { seen: ["white"] },
        { seen: ["black"] },
        { seen: ["white"] },
        { seen: ["red"] },
      ],
    },
    rule: {
      kind: "existential",
      one_side: "white",
      other_side: "black",
    },
    answer: true,
  });

  assert.equal(result.status, "adversarial");
  assert.equal(result.rule_holds, false);
}

function testExistentialRecognizesCorrectNo() {
  const result = solveAdversarialState({
    state: {
      cards: [
        { seen: ["white", "red"] },
        { seen: ["black", "red"] },
        { seen: ["white", "red"] },
        { seen: ["red"] },
      ],
    },
    rule: {
      kind: "existential",
      one_side: "white",
      other_side: "black",
    },
    answer: false,
  });

  assert.equal(result.status, "correct");
  assert.equal(result.rule_holds, false);
}

function testUniversalRecognizesKnownViolation() {
  const result = solveAdversarialState({
    state: {
      cards: [
        { seen: ["white"] },
        { seen: ["white"] },
        { seen: ["red", "black"] },
        { seen: ["black"] },
      ],
    },
    rule: {
      kind: "universal",
      one_side: "black",
      other_side: "white",
    },
    answer: false,
  });

  assert.equal(result.status, "correct");
  assert.equal(result.rule_holds, false);
}

function testOptimalChecksForUniversal() {
  const optimal = computeOptimalChecks({
    state: {
      cards: [
        { seen: ["white"] },
        { seen: ["white"] },
        { seen: ["red"] },
        { seen: ["black"] },
      ],
    },
    rule: {
      kind: "universal",
      one_side: "black",
      other_side: "white",
    },
  });

  assert.equal(optimal, 2);
}

function testOptimalChecksForExistential() {
  const optimal = computeOptimalChecks({
    state: {
      cards: [
        { seen: ["white"] },
        { seen: ["black"] },
        { seen: ["red"] },
        { seen: ["red"] },
      ],
    },
    rule: {
      kind: "existential",
      one_side: "white",
      other_side: "black",
    },
  });

  assert.equal(optimal, 2);
}

runTests();
