const {
  computeOptimalChecks: backendComputeOptimalChecks,
  solveAdversarialState: backendSolveAdversarialState,
  findAssignmentForTruth: backendFindAssignmentForTruth,
} = window.LogicBackend;

const COLORS = ["white", "red", "black"];

const levels = [
  {
    prompt: "Is there a white card with a black reverse side?",
    rule: {
      kind: "existential",
      one_side: "white",
      other_side: "black",
    },
    fronts: ["white", "black", "red", "red"],
  },
  {
    prompt: "Does every card with a black side have a white reverse side?",
    rule: {
      kind: "universal",
      one_side: "black",
      other_side: "white",
    },
    fronts: ["white", "white", "red", "black"],
  },
];

const state = {
  cards: [],
  distinctChecks: 0,
  answered: false,
  answerLocked: false,
  levelIndex: 0,
  optimalWin: false,
  highlightedCardIds: [],
};

const cardRow = document.getElementById("card-row");
const promptText = document.getElementById("prompt-text");
const flipCount = document.getElementById("flip-count");
const messageTitle = document.getElementById("message-title");
const messageBody = document.getElementById("message-body");
const messagePanel = document.getElementById("message-panel");
const answerYesBtn = document.getElementById("answer-yes-btn");
const answerNoBtn = document.getElementById("answer-no-btn");
const resetBtn = document.getElementById("reset-btn");
const nextLevelBtn = document.getElementById("next-level-btn");

function getLevel() {
  return levels[state.levelIndex];
}

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function createLevelCards(fronts) {
  return shuffle(fronts).map((front, index) => ({
    id: index + 1,
    front,
    back: null,
    flipped: false,
    backSeen: false,
  }));
}

function getSolverState(cards = state.cards) {
  return {
    cards: cards.map((card) => ({
      id: card.id,
      seen: card.backSeen ? [card.front, card.back] : [card.front],
    })),
  };
}

function countDistinctChecks(cards = state.cards) {
  return cards.filter((card) => card.backSeen).length;
}

function createCardElement(card) {
  const button = document.createElement("button");
  button.className = "card";
  button.type = "button";
  button.dataset.id = String(card.id);
  button.innerHTML = `
    <div class="card-shell">
      <div class="card-face card-front card-front-${card.front}">
        <div class="card-face-inner">
          <span class="card-index">Front</span>
        </div>
      </div>
      <div class="card-face card-back">
        <div class="card-face-inner">
          <span class="card-index">Back</span>
        </div>
      </div>
    </div>
  `;
  button.addEventListener("click", () => handleCardClick(card.id));
  return button;
}

function syncCardElement(card) {
  const button = cardRow.querySelector(`[data-id="${card.id}"]`);
  if (!button) {
    return;
  }

  const isHighlighted = state.highlightedCardIds.includes(card.id);
  button.disabled = state.answerLocked;
  button.setAttribute("aria-label", `Card ${card.id}, ${card.flipped ? "back" : "front"} side showing`);
  button.classList.toggle("is-flipped", card.flipped);
  button.classList.toggle("is-spotlight", isHighlighted);
  button.classList.toggle(
    "is-dimmed",
    state.highlightedCardIds.length > 0 && !isHighlighted
  );

  const back = button.querySelector(".card-back");
  const backColor = card.back ?? card.front;
  back.className = `card-face card-back card-back-${backColor}`;
}

function initializeBoard() {
  cardRow.innerHTML = "";
  state.cards.forEach((card) => {
    cardRow.appendChild(createCardElement(card));
  });
  syncBoard();
}

function syncBoard() {
  promptText.textContent = getLevel().prompt;
  flipCount.textContent = String(state.distinctChecks);
  answerYesBtn.disabled = state.answered;
  answerNoBtn.disabled = state.answered;
  nextLevelBtn.classList.toggle(
    "is-visible",
    state.optimalWin && state.levelIndex < levels.length - 1
  );
  state.cards.forEach(syncCardElement);
}

function setMessage(kind, title, body) {
  messageTitle.textContent = title;
  messageBody.textContent = body;
  messagePanel.classList.toggle("is-loss", kind === "loss");
  messagePanel.classList.toggle("is-win", kind === "win");
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function toOrdinal(value) {
  const ordinals = ["1st", "2nd", "3rd", "4th"];
  return ordinals[value - 1] ?? `${value}th`;
}

function findUniversalCounterexample(cards, rule) {
  return cards.find((card) => {
    const otherSide = card.sides[0] === rule.one_side ? card.sides[1] : card.sides[0];
    return card.sides.includes(rule.one_side) && otherSide !== rule.other_side;
  });
}

function findUniversalSupportingCards(cards, rule) {
  return cards.filter((card) => card.sides.includes(rule.one_side));
}

function isRelevantFront(front, rule) {
  if (rule.kind === "existential") {
    return front === rule.one_side || front === rule.other_side;
  }

  return front !== rule.other_side;
}

function countRemainingRelevantUnknowns(cardId) {
  const rule = getLevel().rule;

  return state.cards.filter((card) => {
    if (card.id === cardId) {
      return false;
    }

    return !card.backSeen && isRelevantFront(card.front, rule);
  }).length;
}

function getIncorrectMessage(answer, result) {
  const rule = getLevel().rule;

  if (rule.kind === "existential") {
    if (answer) {
      return "There was no such card.";
    }

    return "You missed the card.";
  }

  if (!answer) {
    return `All cards with ${rule.one_side} on one side indeed have ${rule.other_side} on the other.`;
  }

  const counterexample = findUniversalCounterexample(result.cards, rule);
  if (!counterexample) {
    return `All cards with ${rule.one_side} on one side indeed have ${rule.other_side} on the other.`;
  }

  return `The ${toOrdinal(counterexample.id)} card is a counterexample. It's ${rule.one_side} on one side but not ${rule.other_side} on the other.`;
}

function findExistentialWitness(cards, rule) {
  const directionalMatch = cards.find((card) => {
    const [left, right] = card.sides;
    return left === rule.one_side && right === rule.other_side;
  });

  if (directionalMatch) {
    return directionalMatch;
  }

  return cards.find((card) => {
    const [left, right] = card.sides;
    return (
      (left === rule.one_side && right === rule.other_side) ||
      (left === rule.other_side && right === rule.one_side)
    );
  });
}

function buildStateWithForcedBack(cardId, backColor) {
  return {
    cards: state.cards.map((card) => {
      if (card.id === cardId) {
        return {
          id: card.id,
          seen: [card.front, backColor],
        };
      }

      return {
        id: card.id,
        seen: card.backSeen ? [card.front, card.back] : [card.front],
      };
    }),
  };
}

function findPreferredExistentialMiss(rule) {
  const unseenCards = state.cards.filter((card) => !card.backSeen);
  const preferredIds = [
    ...unseenCards.filter((card) => card.front === rule.one_side).map((card) => card.id),
    ...unseenCards.filter((card) => card.front === rule.other_side).map((card) => card.id),
  ];

  for (const cardId of preferredIds) {
    const card = state.cards.find((item) => item.id === cardId);
    const forcedBack = card.front === rule.one_side ? rule.other_side : rule.one_side;
    const setup = backendFindAssignmentForTruth({
      state: buildStateWithForcedBack(cardId, forcedBack),
      rule,
      ruleHolds: true,
    });

    if (setup) {
      return {
        cards: setup,
        highlightedCardIds: [cardId],
      };
    }
  }

  return null;
}

function findPreferredUniversalCounterexample(rule) {
  const preferredCards = state.cards.filter(
    (card) => !card.backSeen && card.front !== rule.other_side
  );

  for (const card of preferredCards) {
    if (card.front === rule.one_side) {
      for (const candidate of COLORS) {
        if (candidate === rule.other_side) {
          continue;
        }

        const setup = backendFindAssignmentForTruth({
          state: buildStateWithForcedBack(card.id, candidate),
          rule,
          ruleHolds: false,
        });

        if (setup) {
          return {
            cards: setup,
            highlightedCardIds: [card.id],
          };
        }
      }
      continue;
    }

    const setup = backendFindAssignmentForTruth({
      state: buildStateWithForcedBack(card.id, rule.one_side),
      rule,
      ruleHolds: false,
    });

    if (setup) {
      return {
        cards: setup,
        highlightedCardIds: [card.id],
      };
    }
  }

  return null;
}

function chooseBackForFlip(cardId) {
  const level = getLevel();
  const card = state.cards.find((item) => item.id === cardId);
  if (!card || card.backSeen) {
    return card?.back ?? null;
  }

  const candidateOutcomes = [];

  for (const candidate of COLORS) {
    const nextCards = state.cards.map((item) =>
      item.id === cardId
        ? {
            ...item,
            back: candidate,
            backSeen: true,
          }
        : item
    );

    const candidateState = getSolverState(nextCards);
    const truePossible = Boolean(
      backendFindAssignmentForTruth({
        state: candidateState,
        rule: level.rule,
        ruleHolds: true,
      })
    );
    const falsePossible = Boolean(
      backendFindAssignmentForTruth({
        state: candidateState,
        rule: level.rule,
        ruleHolds: false,
      })
    );

    candidateOutcomes.push({
      candidate,
      truePossible,
      falsePossible,
    });
  }

  const canStayUnsettled = candidateOutcomes.filter(
    (outcome) => outcome.truePossible && outcome.falsePossible
  );
  const remainingRelevantUnknowns = countRemainingRelevantUnknowns(cardId);
  const isRelevant = isRelevantFront(card.front, level.rule);

  if (isRelevant && remainingRelevantUnknowns > 0 && canStayUnsettled.length > 0) {
    if (level.rule.kind === "existential") {
      const nonSatisfying = canStayUnsettled.filter((outcome) => {
        if (card.front === level.rule.one_side) {
          return outcome.candidate !== level.rule.other_side;
        }

        if (card.front === level.rule.other_side) {
          return outcome.candidate !== level.rule.one_side;
        }

        return true;
      });

      return randomChoice(nonSatisfying.length > 0 ? nonSatisfying : canStayUnsettled).candidate;
    }

    const nonCounterexample = canStayUnsettled.filter((outcome) => {
      if (card.front === level.rule.one_side) {
        return outcome.candidate === level.rule.other_side;
      }

      return outcome.candidate !== level.rule.one_side;
    });

    return randomChoice(nonCounterexample.length > 0 ? nonCounterexample : canStayUnsettled).candidate;
  }

  if (isRelevant && remainingRelevantUnknowns === 0) {
    const truthy = candidateOutcomes.filter((outcome) => outcome.truePossible);
    const falsy = candidateOutcomes.filter((outcome) => outcome.falsePossible);

    if (truthy.length > 0 && falsy.length > 0) {
      const desiredTruth = Math.random() < 0.5;
      const pool = desiredTruth ? truthy : falsy;
      return randomChoice(pool).candidate;
    }
  }

  if (canStayUnsettled.length > 0) {
    return randomChoice(canStayUnsettled).candidate;
  }

  const truthy = candidateOutcomes.filter((outcome) => outcome.truePossible);
  if (truthy.length > 0) {
    return randomChoice(truthy).candidate;
  }

  const falsy = candidateOutcomes.filter((outcome) => outcome.falsePossible);
  if (falsy.length > 0) {
    return randomChoice(falsy).candidate;
  }

  return COLORS[0];
}

function handleCardClick(cardId) {
  if (state.answerLocked) {
    return;
  }

  const card = state.cards.find((item) => item.id === cardId);
  if (!card) {
    return;
  }

  let chosenBack = card.back;
  if (!card.backSeen && chosenBack === null) {
    chosenBack = chooseBackForFlip(cardId);
  }

  state.cards = state.cards.map((item) =>
    item.id === cardId
      ? {
          ...item,
          back: chosenBack,
          backSeen: true,
          flipped: !item.flipped,
        }
      : item
  );

  state.distinctChecks = countDistinctChecks();
  syncBoard();
}

function revealAdversarialSetup(fullCards) {
  state.cards = state.cards.map((card) => {
    const resolved = fullCards.find((item) => item.id === card.id);
    const back = resolved.sides[0] === card.front ? resolved.sides[1] : resolved.sides[0];

    return {
      ...card,
      back,
      backSeen: true,
      flipped: true,
    };
  });
  state.distinctChecks = countDistinctChecks();
}

function applyResolvedBacks(fullCards) {
  state.cards = state.cards.map((card) => {
    const resolved = fullCards.find((item) => item.id === card.id);
    const back = resolved.sides[0] === card.front ? resolved.sides[1] : resolved.sides[0];

    return {
      ...card,
      back,
    };
  });
}

function getInitialState() {
  return {
    cards: state.cards.map((card) => ({
      id: card.id,
      seen: [card.front],
    })),
  };
}

function evaluateAnswer(answer) {
  if (state.answered) {
    return;
  }

  const result = backendSolveAdversarialState({
    state: getSolverState(),
    rule: getLevel().rule,
    answer,
  });
 
  state.answered = true;
  let explainedResult = result;
 
  if (result.status === "adversarial") {
    state.optimalWin = false;
    if (getLevel().rule.kind === "existential" && answer === false) {
      const preferredMiss = findPreferredExistentialMiss(getLevel().rule);

      if (preferredMiss) {
        applyResolvedBacks(preferredMiss.cards);
        state.highlightedCardIds = preferredMiss.highlightedCardIds;
        explainedResult = { ...result, cards: preferredMiss.cards };
      } else {
        applyResolvedBacks(result.cards);
        const witness = findExistentialWitness(result.cards, getLevel().rule);
        const missedCard = witness
          ? state.cards.find((card) => card.id === witness.id && !card.backSeen)
          : null;

        if (missedCard) {
          state.highlightedCardIds = [missedCard.id];
        } else {
          applyResolvedBacks(result.cards);
        }
      }
    } else if (getLevel().rule.kind === "universal" && answer === true) {
      const preferredCounterexample = findPreferredUniversalCounterexample(getLevel().rule);

      if (preferredCounterexample) {
        applyResolvedBacks(preferredCounterexample.cards);
        state.highlightedCardIds = preferredCounterexample.highlightedCardIds;
        explainedResult = { ...result, cards: preferredCounterexample.cards };
      } else {
        applyResolvedBacks(result.cards);
      }
    } else if (getLevel().rule.kind === "universal" && answer === false) {
      applyResolvedBacks(result.cards);
      state.highlightedCardIds = findUniversalSupportingCards(
        result.cards,
        getLevel().rule
      ).map((card) => card.id);
    } else {
      applyResolvedBacks(result.cards);
    }
    syncBoard();
    setMessage("loss", "Incorrect.", getIncorrectMessage(answer, explainedResult));
    return;
  }

  state.answerLocked = true;
  state.highlightedCardIds = [];
  const minimalChecks = backendComputeOptimalChecks({
    state: getInitialState(),
    rule: getLevel().rule,
  });
  const fewerPossible = minimalChecks < state.distinctChecks;
  state.optimalWin = !fewerPossible;
  syncBoard();

  if (fewerPossible) {
    setMessage(
      "loss",
      "Correct.",
      `You solved it in ${state.distinctChecks} moves, but it could be done in fewer.`
    );
    return;
  }

  setMessage(
    "win",
    "Correct.",
    "You solved it in the optimal number of moves."
  );
}

function loadLevel(levelIndex) {
  state.levelIndex = levelIndex;
  state.cards = createLevelCards(getLevel().fronts);
  state.distinctChecks = 0;
  state.answered = false;
  state.answerLocked = false;
  state.optimalWin = false;
  state.highlightedCardIds = [];
  setMessage("info", "Test the rule.", "Flip cards, then answer when you you have enough information.");
  initializeBoard();
}

answerYesBtn.addEventListener("click", () => evaluateAnswer(true));
answerNoBtn.addEventListener("click", () => evaluateAnswer(false));
resetBtn.addEventListener("click", () => loadLevel(state.levelIndex));
nextLevelBtn.addEventListener("click", () => {
  if (state.levelIndex < levels.length - 1) {
    loadLevel(state.levelIndex + 1);
  }
});

loadLevel(0);
