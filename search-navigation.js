const cardSelector = "div.cursor-pointer";
const nameSelector =
  ".text-sm.font-semibold .text-navy-900:not(.text-opacity-50)";
const duprIdSelector = ".text-navy-900.text-opacity-50";

function normalize(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isPlayerId(value) {
  return /^\d{5,}$/.test(String(value ?? ""));
}

function findMatchingPlayerId(
  value,
  playerName,
  duprId,
  seen,
  depth = 0,
  visited = { count: 0 },
) {
  if (
    !value ||
    typeof value !== "object" ||
    depth > 8 ||
    seen.has(value) ||
    visited.count >= 5000
  ) {
    return null;
  }
  seen.add(value);
  visited.count += 1;

  const objectName =
    value.fullName ??
    value.displayName ??
    value.name ??
    [value.firstName, value.lastName].filter(Boolean).join(" ");
  const matchesPlayer =
    (playerName && normalize(objectName) === playerName) ||
    (duprId &&
      [value.duprId, value.displayIdentity].some(
        (candidate) => normalize(candidate) === duprId,
      ));

  if (matchesPlayer) {
    for (const key of ["id", "playerId", "player_id", "userId"]) {
      if (isPlayerId(value[key])) return String(value[key]);
    }
  }

  for (const child of Object.values(value)) {
    const playerId = findMatchingPlayerId(
      child,
      playerName,
      duprId,
      seen,
      depth + 1,
      visited,
    );
    if (playerId) return playerId;
  }
  return null;
}

function findPlayerIdInCard(card, playerName, duprId) {
  const seen = new WeakSet();
  const visited = { count: 0 };
  const roots = [];
  const nodes = [card, ...card.querySelectorAll("*")];

  for (const node of nodes) {
    for (const key of Object.keys(node)) {
      if (key.startsWith("__reactProps$")) roots.push(node[key]);
      if (key.startsWith("__reactFiber$")) {
        let fiber = node[key];
        for (let depth = 0; fiber && depth < 20; depth += 1) {
          roots.push(fiber.memoizedProps, fiber.pendingProps);
          fiber = fiber.return;
        }
      }
    }
  }

  for (const root of roots) {
    const playerId = findMatchingPlayerId(
      root,
      playerName,
      duprId,
      seen,
      0,
      visited,
    );
    if (playerId) return playerId;
  }
  return null;
}

document.addEventListener(
  "click",
  (event) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) return;
    const card = target.closest(cardSelector);
    if (!card) return;

    const name = card.querySelector(nameSelector)?.textContent?.trim();
    const duprId = card.querySelector(duprIdSelector)?.textContent?.trim();
    if (!name || !duprId) return;

    const playerId = findPlayerIdInCard(
      card,
      normalize(name),
      normalize(duprId),
    );
    if (!playerId) {
      console.warn(
        "DUPR Free couldn't find this search result's player ID in the page data.",
      );
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(
      `https://dashboard.dupr.com/dashboard/player/${encodeURIComponent(playerId)}`,
    );
  },
  true,
);
