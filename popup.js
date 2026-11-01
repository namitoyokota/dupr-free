const state = document.querySelector("#state");
const stateMessage = document.querySelector("#state-message");
const profile = document.querySelector("#profile");
const profileImage = document.querySelector("#profile-image");
const avatarFallback = document.querySelector("#avatar-fallback");
const historySection = document.querySelector("#match-history");
const historyMessage = document.querySelector("#history-message");
const historyList = document.querySelector("#history-list");
const doublesRatingHistorySection = document.querySelector("#doubles-rating-history");
const doublesRatingHistoryMessage = document.querySelector(
  "#doubles-rating-history-message",
);
const doublesRatingChart = document.querySelector("#doubles-rating-chart");
const singlesRatingHistorySection = document.querySelector("#singles-rating-history");
const singlesRatingHistoryMessage = document.querySelector(
  "#singles-rating-history-message",
);
const singlesRatingChart = document.querySelector("#singles-rating-chart");
let loadGeneration = 0;

function showError(title, detail) {
  state.classList.add("error");
  state.replaceChildren();

  const message = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const description = document.createElement("span");
  description.textContent = detail;
  message.append(heading, description);
  state.append(message);
  state.hidden = false;
  profile.hidden = true;
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    let timeoutId;
    const cleanup = () => {
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
    const onUpdated = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        cleanup();
        resolve(tab);
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for the player profile to load."));
    }, 15000);

    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        cleanup();
        resolve(tab);
      }
    }, (error) => {
      cleanup();
      reject(error);
    });
  });
}

function formatRating(value) {
  if (value === null || value === undefined || value === "") return "—";
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toFixed(3) : "—";
}

function renderReliability(id, value) {
  const indicator = document.querySelector(`#${id}-reliability`);
  const percentage = document.querySelector(`#${id}-reliability-value`);
  const numericValue = Number(value);
  const available =
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(numericValue);

  if (!available) {
    indicator.style.setProperty("--reliability", "0%");
    indicator.setAttribute("aria-label", "Reliability unavailable");
    percentage.textContent = "—";
    return;
  }

  const boundedValue = Math.min(100, Math.max(0, numericValue));
  indicator.style.setProperty("--reliability", `${boundedValue}%`);
  indicator.setAttribute("aria-label", `Reliability ${numericValue}%`);
  percentage.textContent = `${numericValue}%`;
}

function addChip(container, text) {
  const chip = document.createElement("span");
  chip.className = "meta-chip";
  chip.textContent = text;
  container.append(chip);
}

function formatMatchDate(value) {
  const match =
    typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return `${Number(match[2])}/${Number(match[3])}/${match[1]}`;
}

function createSvgElement(tag, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

function renderRatingHistory(result, type, section, message, chart) {
  section.hidden = false;
  message.textContent = "";
  chart.replaceChildren();

  if (!result?.ok) {
    message.textContent =
      result?.message || "Couldn't load rating history.";
    return;
  }

  const history = result.payload?.result?.ratingHistory;
  if (result.payload?.status !== "SUCCESS" || !Array.isArray(history)) {
    message.textContent =
      result.payload?.message || "DUPR returned an unexpected rating history response.";
    return;
  }

  const points = history
    .filter(
      (entry) =>
        typeof entry.date === "string" &&
        Number.isFinite(Number(entry.rating)) &&
        entry.rating !== null,
    )
    .map((entry) => ({
      date: entry.date,
      timestamp: Date.parse(`${entry.date}T00:00:00Z`),
      rating: Number(entry.rating),
    }))
    .filter((entry) => Number.isFinite(entry.timestamp))
    .sort((first, second) => first.timestamp - second.timestamp);

  if (points.length === 0) {
    message.textContent = `No ${type.toLowerCase()} rating history found.`;
    return;
  }

  const firstYear = new Date(points[0].timestamp).getUTCFullYear();
  const lastYear = new Date(points.at(-1).timestamp).getUTCFullYear();
  const width = 340;
  const height = 150;
  const margin = { top: 12, right: 12, bottom: 25, left: 42 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  let minRating = points[0].rating;
  let maxRating = points[0].rating;
  for (const point of points) {
    minRating = Math.min(minRating, point.rating);
    maxRating = Math.max(maxRating, point.rating);
  }
  let lowerRating = Math.floor(minRating * 2) / 2;
  let upperRating = Math.ceil(maxRating * 2) / 2;
  if (lowerRating === upperRating) {
    lowerRating -= 0.5;
    upperRating += 0.5;
  }
  const firstDate = points[0].timestamp;
  const lastDate = points.at(-1).timestamp;
  const dateRange = lastDate - firstDate;
  const coordinates = points.map((point) => ({
    x:
      margin.left +
      (dateRange === 0
        ? 0
        : ((point.timestamp - firstDate) / dateRange) * plotWidth),
    y:
      margin.top +
      ((upperRating - point.rating) / (upperRating - lowerRating)) *
        plotHeight,
    ...point,
  }));
  const svg = createSvgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: "group",
    "aria-label": `${type} DUPR history from ${formatMatchDate(points[0].date)} to ${formatMatchDate(points.at(-1).date)}, ${points.length} ratings. Hover or focus a point to inspect its rating.`,
  });

  for (
    let value = lowerRating;
    value <= upperRating + Number.EPSILON;
    value += 0.5
  ) {
    const y =
      margin.top +
      ((upperRating - value) / (upperRating - lowerRating)) * plotHeight;
    svg.append(
      createSvgElement("line", {
        x1: margin.left,
        x2: width - margin.right,
        y1: y,
        y2: y,
        class: "rating-chart-grid rating-chart-grid-threshold",
      }),
    );
    const label = createSvgElement("text", {
      x: margin.left - 7,
      y: y + 3,
      "text-anchor": "end",
      class: "rating-chart-label",
    });
    label.textContent = value.toFixed(1);
    svg.append(label);
  }

  for (let year = firstYear; year <= lastYear; year += 1) {
    const yearStart = Date.UTC(year, 0, 1);
    if (yearStart < firstDate || yearStart > lastDate) continue;
    const x =
      margin.left + ((yearStart - firstDate) / (dateRange || 1)) * plotWidth;
    svg.append(
      createSvgElement("line", {
        x1: x,
        x2: x,
        y1: margin.top,
        y2: margin.top + plotHeight,
        class: "rating-chart-grid",
      }),
    );
    const label = createSvgElement("text", {
      x,
      y: height - 5,
      "text-anchor": "middle",
      class: "rating-chart-label",
    });
    label.textContent = String(year);
    svg.append(label);
  }

  const path = createSvgElement("path", {
    d: coordinates
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
      .join(" "),
    class: "rating-chart-line",
  });
  svg.append(path);

  const tooltip = createSvgElement("g", {
    class: "rating-chart-tooltip",
    "pointer-events": "none",
    visibility: "hidden",
  });
  const tooltipBackground = createSvgElement("rect", {
    width: 116,
    height: 30,
    rx: 5,
    class: "rating-chart-tooltip-background",
  });
  const tooltipLabel = createSvgElement("text", {
    x: 58,
    y: 19,
    "text-anchor": "middle",
    class: "rating-chart-tooltip-label",
  });
  tooltip.append(tooltipBackground, tooltipLabel);

  function showPoint(point) {
    const x = Math.max(
      margin.left,
      Math.min(width - margin.right - 116, point.x - 58),
    );
    const y = Math.max(margin.top, point.y - 38);
    tooltip.setAttribute("transform", `translate(${x} ${y})`);
    tooltipLabel.textContent = `${point.rating.toFixed(3)} · ${formatMatchDate(point.date)}`;
    tooltip.setAttribute("visibility", "visible");
  }

  coordinates.forEach((point) => {
    const marker = createSvgElement("circle", {
      cx: point.x,
      cy: point.y,
      r: 2.5,
      class: "rating-chart-point",
    });
    const hitTarget = createSvgElement("circle", {
      cx: point.x,
      cy: point.y,
      r: 9,
      class: "rating-chart-point-hit",
      tabindex: "0",
      role: "img",
      "aria-label": `${type} DUPR ${point.rating.toFixed(3)} on ${formatMatchDate(point.date)}`,
    });
    hitTarget.addEventListener("pointerenter", () => showPoint(point));
    hitTarget.addEventListener("focus", () => showPoint(point));
    hitTarget.addEventListener("pointerleave", () => {
      tooltip.setAttribute("visibility", "hidden");
    });
    hitTarget.addEventListener("blur", () => {
      tooltip.setAttribute("visibility", "hidden");
    });
    svg.append(marker, hitTarget);
  });

  svg.append(tooltip);

  chart.append(svg);
}

async function loadPlayer(playerId) {
  const generation = ++loadGeneration;
  const isCurrentLoad = () => generation === loadGeneration;
  if (!/^\d+$/.test(String(playerId))) {
    showError("Couldn't load player", "The player ID is invalid.");
    return;
  }

  let tab;
  try {
    [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
  } catch (error) {
    if (isCurrentLoad()) {
      showError(
        "Couldn't check the active page",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
    return;
  }
  if (!tab?.id || !tab.url) {
    showError("No active page", "Open a DUPR player profile, then click DUPR Free.");
    return;
  }

  let url;
  try {
    url = new URL(tab.url);
  } catch {
    showError("Can't read this page", "Open a DUPR player profile, then try again.");
    return;
  }
  if (url.origin !== "https://dashboard.dupr.com") {
    showError(
      "Open a DUPR player profile",
      "Open a player profile on dashboard.dupr.com, then try again.",
    );
    return;
  }

  state.classList.remove("error");
  stateMessage.textContent = "Loading player profile…";
  state.hidden = false;
  profile.hidden = true;

  try {
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: fetchPlayer,
      args: [String(playerId)],
    });
    if (!isCurrentLoad()) return;

    const result = execution?.result;
    const playerResult = result?.player;
    if (!playerResult?.ok) {
      if (playerResult?.status === 401 || playerResult?.status === 403) {
        showError(
          "DUPR restricted this request",
          "Make sure you're signed in to dashboard.dupr.com, then try again.",
        );
      } else if (playerResult?.status === 404) {
        showError("Player not found", "DUPR returned no player for this profile ID.");
      } else if (playerResult?.networkError) {
        showError(
          "Couldn't complete the request",
          "DUPR may be temporarily unavailable or may have changed how its dashboard requests work. Try again from the signed-in player profile.",
        );
      } else {
        showError(
          "DUPR couldn't complete the lookup",
          playerResult?.message || "Please try again from the player profile.",
        );
      }
      return;
    }

    const payload = playerResult.payload;
    if (
      !payload?.result ||
      payload.status === "ERROR" ||
      payload.status === "FAILURE" ||
      payload.status === "NOT_FOUND"
    ) {
      showError(
        "DUPR couldn't return this profile",
        payload?.message || "The response did not include a player profile.",
      );
      return;
    }

    renderPlayer(payload.result);
    renderHistory(result.history, String(playerId));
    renderRatingHistory(
      result.doublesRatingHistory,
      "Doubles",
      doublesRatingHistorySection,
      doublesRatingHistoryMessage,
      doublesRatingChart,
    );
    renderRatingHistory(
      result.singlesRatingHistory,
      "Singles",
      singlesRatingHistorySection,
      singlesRatingHistoryMessage,
      singlesRatingChart,
    );
  } catch (error) {
    if (isCurrentLoad()) {
      showError(
        "Couldn't load the player profile",
        error instanceof Error
          ? error.message
          : "Try again from the player profile.",
      );
    }
  }
}

async function navigateToPlayer(event, playerId) {
  event.preventDefault();
  await loadPlayer(playerId);
}

function createTeamPlayer(player, team, position, isSingles) {
  const link = document.createElement("a");
  link.className = "team-player";
  link.href = `https://dashboard.dupr.com/dashboard/player/${encodeURIComponent(player.id)}`;
  link.addEventListener("click", (event) => {
    navigateToPlayer(event, player.id);
  });

  if (typeof player.imageUrl === "string" && player.imageUrl.trim()) {
    const image = document.createElement("img");
    image.src = player.imageUrl;
    image.alt = "";
    image.loading = "lazy";
    image.onerror = () => {
      const fallback = document.createElement("span");
      fallback.className = "team-avatar-fallback";
      fallback.textContent = player.fullName?.trim()?.[0]?.toUpperCase() || "?";
      image.replaceWith(fallback);
    };
    link.append(image);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "team-avatar-fallback";
    fallback.textContent = player.fullName?.trim()?.[0]?.toUpperCase() || "?";
    link.append(fallback);
  }

  const name = document.createElement("span");
  name.className = "team-player-name";
  name.textContent = player.fullName || "DUPR player";
  const playerNumber = position === "player1" ? 1 : 2;
  const ratingType = isSingles ? "Single" : "Double";
  const previousRating =
    team.preMatchRatingAndImpact?.[
      `preMatch${ratingType}RatingPlayer${playerNumber}`
    ];
  const currentRating = player.postMatchRating?.[
    isSingles ? "singles" : "doubles"
  ];
  const rating = document.createElement("span");
  rating.className = "team-player-rating";
  const previous = document.createElement("span");
  previous.textContent = formatRating(previousRating);
  const after = document.createElement("span");
  after.className = "team-player-rating-after";
  after.textContent = formatRating(currentRating);
  const previousValue = Number(previousRating);
  const currentValue = Number(currentRating);
  const hasRatingChange =
    previousRating !== null &&
    previousRating !== undefined &&
    previousRating !== "" &&
    currentRating !== null &&
    currentRating !== undefined &&
    currentRating !== "" &&
    Number.isFinite(previousValue) &&
    Number.isFinite(currentValue);
  if (hasRatingChange) {
    if (currentValue > previousValue) after.classList.add("rating-increase");
    if (currentValue < previousValue) after.classList.add("rating-decrease");
  }
  rating.append(previous, document.createTextNode(" → "), after);
  if (hasRatingChange) {
    const change = document.createElement("span");
    change.className = "team-player-rating-change";
    const difference = (currentValue - previousValue).toFixed(3);
    change.textContent = ` (${difference.startsWith("-") ? "-" : "+"}${difference.replace(/^-?0/, "")})`;
    rating.append(change);
  }
  rating.setAttribute(
    "aria-label",
    `DUPR before match ${formatRating(previousRating)}, after match ${formatRating(currentRating)}`,
  );
  link.append(name, rating);
  return link;
}

function renderTeam(team, isSingles) {
  const row = document.createElement("div");
  row.className = "match-team";
  if (team.winner === true) row.classList.add("is-winner");

  const players = document.createElement("div");
  players.className = "team-players";
  for (const position of ["player1", "player2"]) {
    const player = team[position];
    if (player && player.id !== null && player.id !== undefined) {
      players.append(createTeamPlayer(player, team, position, isSingles));
    }
  }

  const scores = [];
  for (let game = 1; game <= 5; game += 1) {
    const score = team[`game${game}`];
    if (typeof score === "number" && score >= 0) scores.push(score);
  }
  const score = document.createElement("span");
  score.className = "team-score";
  score.textContent = scores.join(" · ") || "—";
  row.append(players, score);
  return row;
}

function renderMatch(match, playerId) {
  const card = document.createElement("article");
  card.className = "card match-card";
  const teams = Array.isArray(match.teams) ? match.teams : [];
  const isSingles = String(match.eventFormat).toUpperCase() === "SINGLES";
  const playerTeam = teams.find((team) =>
    ["player1", "player2"].some(
      (position) => String(team[position]?.id) === playerId,
    ),
  );
  const heading = document.createElement("div");
  heading.className = "match-heading";
  const result = document.createElement("div");
  const outcome = document.createElement("p");
  outcome.className = "match-outcome";
  if (playerTeam?.winner === false) {
    outcome.textContent = "Loss";
    outcome.classList.add("loss");
  } else {
    outcome.textContent = playerTeam?.winner === true ? "Win" : "Match";
  }

  const event = document.createElement("p");
  event.className = "match-event";
  event.textContent =
    match.league || match.tournament || match.eventName || "Match";
  const date = formatMatchDate(match.eventDate);
  const meta = document.createElement("div");
  meta.className = "match-meta";
  meta.append(outcome);
  if (date) {
    const dateElement = document.createElement("span");
    dateElement.textContent = date;
    meta.append(dateElement);
  }
  heading.append(event, meta);
  card.append(heading);

  for (const team of teams) {
    card.append(renderTeam(team, isSingles));
  }
  return card;
}

function renderHistory(result, playerId) {
  historySection.hidden = false;
  historyList.replaceChildren();
  historyMessage.textContent = "";
  if (!result?.ok) {
    historyMessage.textContent =
      result?.message || "Couldn't load this player's match history.";
    return;
  }

  const payload = result.payload;
  const hits = payload?.result?.hits;
  if (payload?.status !== "SUCCESS" || !Array.isArray(hits)) {
    historyMessage.textContent =
      payload?.message || "DUPR returned an unexpected match history response.";
    return;
  }
  if (hits.length === 0) {
    historyMessage.textContent = "No match history found.";
    return;
  }
  for (const match of hits) {
    historyList.append(renderMatch(match, playerId));
  }
}

function renderPlayer(player) {
  const fullName = player.fullName?.trim();
  const name =
    fullName ||
    [player.firstName, player.lastName].filter(Boolean).join(" ").trim() ||
    "DUPR player";
  const ratings = player.ratings ?? {};
  const primaryName =
    ratings.defaultRating?.toUpperCase() === "SINGLES" ? "Singles" : "Doubles";
  const primaryKey = primaryName.toLowerCase();
  const secondaryName = primaryName === "Doubles" ? "Singles" : "Doubles";
  const secondaryKey = secondaryName.toLowerCase();

  setText("#profile-name", name);

  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  avatarFallback.textContent = initials || "?";
  profileImage.hidden = true;
  avatarFallback.hidden = false;
  profileImage.onload = () => {
    profileImage.hidden = false;
    avatarFallback.hidden = true;
  };
  profileImage.onerror = () => {
    profileImage.hidden = true;
    avatarFallback.hidden = false;
  };
  if (typeof player.imageUrl === "string" && player.imageUrl.trim()) {
    profileImage.src = player.imageUrl;
  } else {
    profileImage.removeAttribute("src");
  }

  const meta = document.querySelector("#profile-meta");
  meta.replaceChildren();
  if (player.age !== null && player.age !== undefined) {
    addChip(meta, `${player.age} years old`);
  }
  if (player.gender) {
    const gender = player.gender.toLowerCase();
    addChip(meta, gender.charAt(0).toUpperCase() + gender.slice(1));
  }

  const duprIdMeta = document.querySelector("#dupr-id-meta");
  duprIdMeta.replaceChildren();
  if (player.duprId) {
    addChip(duprIdMeta, player.duprId);
  }

  document.querySelector("#primary-rating-card").setAttribute(
    "aria-label",
    `${primaryName} DUPR rating`,
  );
  setText("#primary-value", formatRating(ratings[primaryKey]));
  renderReliability(
    "primary",
    ratings[`${primaryKey}ReliabilityScore`],
  );
  const primaryProvisional = ratings[`${primaryKey}Provisional`];
  const primaryStatus = document.querySelector("#rating-status");
  primaryStatus.hidden = primaryProvisional !== true;
  primaryStatus.textContent = primaryProvisional === true ? "Provisional" : "";
  setText("#primary-title", primaryName);
  setText("#secondary-title", secondaryName);
  const secondaryProvisional = ratings[`${secondaryKey}Provisional`];
  const secondaryStatus = document.querySelector("#secondary-status");
  secondaryStatus.hidden = secondaryProvisional !== true;
  secondaryStatus.textContent =
    secondaryProvisional === true ? "Provisional" : "";
  document.querySelector("#secondary-rating-card").setAttribute(
    "aria-label",
    `${secondaryName} DUPR rating`,
  );
  setText("#secondary-value", formatRating(ratings[secondaryKey]));
  renderReliability(
    "secondary",
    ratings[`${secondaryKey}ReliabilityScore`],
  );

  state.hidden = true;
  profile.hidden = false;
}

async function fetchPlayer(playerId) {
  const endpoint = `https://api.dupr.com/player/v1.0/${encodeURIComponent(playerId)}`;

  async function fetchEndpoint(url, method = "GET", body) {
    try {
      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          message:
            payload?.message ||
            `DUPR couldn't complete this lookup (HTTP ${response.status}).`,
        };
      }
      return { ok: true, payload };
    } catch (error) {
      return {
        ok: false,
        networkError: true,
        message:
          error instanceof Error ? error.message : "The request was blocked.",
      };
    }
  }

  async function fetchAllRatingHistory(type) {
    const ratingHistory = [];
    const limit = 100;
    let offset = 0;
    const today = new Date();
    const endDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    while (true) {
      const page = await fetchEndpoint(`${endpoint}/rating-history`, "POST", {
        endDate,
        limit,
        offset,
        startDate: "1900-01-01",
        sortBy: "asc",
        type,
      });
      if (!page.ok) return page;

      const pageHistory = page.payload?.result?.ratingHistory;
      if (
        page.payload?.status !== "SUCCESS" ||
        !Array.isArray(pageHistory)
      ) {
        return {
          ok: false,
          message:
            page.payload?.message ||
            "DUPR returned an unexpected rating history response.",
        };
      }

      ratingHistory.push(...pageHistory);
      if (pageHistory.length < limit) break;
      offset += limit;
    }

    return {
      ok: true,
      payload: {
        status: "SUCCESS",
        result: { ratingHistory },
      },
    };
  }

  const [player, history, doublesRatingHistory, singlesRatingHistory] =
    await Promise.all([
      fetchEndpoint(endpoint),
      fetchEndpoint(`${endpoint}/history`, "POST", {
        filters: { eventFormat: null },
        limit: 10,
        offset: 0,
        sort: { order: "DESC", parameter: "MATCH_DATE" },
      }),
      fetchAllRatingHistory("DOUBLES"),
      fetchAllRatingHistory("SINGLES"),
    ]);
  return { player, history, doublesRatingHistory, singlesRatingHistory };
}

async function loadCurrentPlayer() {
  let [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (!tab?.id || !tab.url) {
    showError("No active page", "Open a DUPR player profile, then click DUPR Free.");
    return;
  }

  if (tab.status === "loading") {
    stateMessage.textContent = "Waiting for the player profile to load…";
    try {
      tab = await waitForTabComplete(tab.id);
    } catch (error) {
      showError(
        "Player profile is still loading",
        error instanceof Error
          ? error.message
          : "Wait for the page to finish loading, then try again.",
      );
      return;
    }
  }

  let url;
  try {
    url = new URL(tab.url);
  } catch {
    showError("Can't read this page", "Open a DUPR player profile, then try again.");
    return;
  }

  const playerMatch =
    url.origin === "https://dashboard.dupr.com"
      ? url.pathname.match(/^\/dashboard\/player\/(\d+)\/?$/)
      : null;
  if (!playerMatch) {
    showError(
      "Open a DUPR player profile",
      "Navigate to dashboard.dupr.com/dashboard/player/{player ID}, then click the extension.",
    );
    return;
  }
  await loadPlayer(playerMatch[1]);
}

loadCurrentPlayer();
