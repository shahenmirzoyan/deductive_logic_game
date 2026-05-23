"use strict";

const DEFAULT_COLORS = ["white", "red", "black"];

function solveAdversarialState({ state, rule, answer, palette = DEFAULT_COLORS }) {
  const normalized = normalizeState(state, palette);
  const targetTruth = !answer;
  const setup = findAssignmentForTruth({
    state: normalized,
    rule,
    ruleHolds: targetTruth,
  });

  if (!setup) {
    return {
      status: "correct",
      rule_holds: answer,
    };
  }

  return {
    status: "adversarial",
    rule_holds: targetTruth,
    cards: setup.map((card) => ({
      id: card.id,
      sides: [...card.sides],
    })),
  };
}

function computeOptimalChecks({ state, rule, palette = DEFAULT_COLORS }) {
  const normalized = normalizeState(state, palette);
  validateRule(rule);

  if (rule.kind === "universal") {
    return normalized.cards.filter((card) => card.sides[0] !== rule.other_side).length;
  }

  return normalized.cards.filter((card) => {
    const face = card.sides[0];
    return face === rule.one_side || face === rule.other_side;
  }).length;
}

function findAssignmentForTruth({ state, rule, ruleHolds, palette = DEFAULT_COLORS }) {
  const normalized = isNormalizedState(state)
    ? state
    : normalizeState(state.cards ? state : { cards: state }, palette);
  return searchAssignments(normalized.cards, normalized.palette, rule, ruleHolds, 0);
}

function isNormalizedState(state) {
  return Boolean(
    state &&
      Array.isArray(state.cards) &&
      state.cards.every((card) => Array.isArray(card.sides))
  );
}

function normalizeState(state, palette) {
  if (!state || !Array.isArray(state.cards)) {
    throw new Error("state.cards must be an array");
  }

  const uniquePalette = [...new Set(palette)];
  const cards = state.cards.map((card, index) => normalizeCard(card, index, uniquePalette));

  return {
    palette: uniquePalette,
    cards,
  };
}

function normalizeCard(card, index, palette) {
  const seen = Array.isArray(card.seen) ? card.seen : [];

  if (seen.length > 2) {
    throw new Error(`card ${card.id ?? index} has more than two seen faces`);
  }

  seen.forEach((color) => {
    if (!palette.includes(color)) {
      throw new Error(`unknown color "${color}" on card ${card.id ?? index}`);
    }
  });

  return {
    id: card.id ?? index,
    sides: [seen[0] ?? null, seen[1] ?? null],
  };
}

function searchAssignments(cards, palette, rule, targetTruth, index) {
  if (index === cards.length) {
    return evaluateRule(cards, rule) === targetTruth ? cards : null;
  }

  const card = cards[index];
  const unknownSlots = [];

  for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
    if (card.sides[sideIndex] === null) {
      unknownSlots.push(sideIndex);
    }
  }

  if (unknownSlots.length === 0) {
    return searchAssignments(cards, palette, rule, targetTruth, index + 1);
  }

  const assignments = enumerateAssignments(unknownSlots.length, palette);
  for (const assignment of assignments) {
    const nextCards = cards.map((current, currentIndex) => {
      if (currentIndex !== index) {
        return current;
      }

      const sides = [...current.sides];
      unknownSlots.forEach((slot, assignmentIndex) => {
        sides[slot] = assignment[assignmentIndex];
      });

      return {
        ...current,
        sides,
      };
    });

    const result = searchAssignments(nextCards, palette, rule, targetTruth, index + 1);
    if (result) {
      return result;
    }
  }

  return null;
}

function enumerateAssignments(length, palette) {
  if (length === 0) {
    return [[]];
  }

  const tailAssignments = enumerateAssignments(length - 1, palette);
  const assignments = [];

  for (const color of palette) {
    for (const tail of tailAssignments) {
      assignments.push([color, ...tail]);
    }
  }

  return assignments;
}

function evaluateRule(cards, rule) {
  validateRule(rule);

  if (rule.kind === "universal") {
    return cards.every((card) => satisfiesUniversal(card.sides, rule));
  }

  return cards.some((card) => satisfiesExistential(card.sides, rule));
}

function validateRule(rule) {
  if (!rule || (rule.kind !== "universal" && rule.kind !== "existential")) {
    throw new Error('rule.kind must be "universal" or "existential"');
  }

  if (typeof rule.one_side !== "string" || typeof rule.other_side !== "string") {
    throw new Error("rule.one_side and rule.other_side must be strings");
  }
}

function satisfiesUniversal(sides, rule) {
  const [left, right] = sides;
  const { one_side: oneSide, other_side: otherSide } = rule;

  if (left === oneSide && right !== otherSide) {
    return false;
  }

  if (right === oneSide && left !== otherSide) {
    return false;
  }

  return true;
}

function satisfiesExistential(sides, rule) {
  const [left, right] = sides;
  const { one_side: oneSide, other_side: otherSide } = rule;

  return (
    (left === oneSide && right === otherSide) ||
    (left === otherSide && right === oneSide)
  );
}

const exported = {
  computeOptimalChecks,
  DEFAULT_COLORS,
  evaluateRule,
  findAssignmentForTruth,
  solveAdversarialState,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = exported;
}

if (typeof window !== "undefined") {
  window.LogicBackend = exported;
}
