const state = document.querySelector("#state");
const stateMessage = document.querySelector("#state-message");
const profile = document.querySelector("#profile");
const profileImage = document.querySelector("#profile-image");
const avatarFallback = document.querySelector("#avatar-fallback");

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

function fetchPlayer(playerId) {
  return fetch(
    `https://api.dupr.com/player/v1.0/${encodeURIComponent(playerId)}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  )
    .then(async (response) => {
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
    })
    .catch((error) => ({
      ok: false,
      networkError: true,
      message: error instanceof Error ? error.message : "The request was blocked.",
    }));
}

async function loadCurrentPlayer() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
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

  const playerId = playerMatch[1];
  state.classList.remove("error");
  stateMessage.textContent = "Loading player profile…";
  state.hidden = false;

  try {
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: fetchPlayer,
      args: [playerId],
    });
    const result = execution?.result;
    if (!result?.ok) {
      if (result?.status === 401 || result?.status === 403) {
        showError(
          "DUPR restricted this request",
          "Make sure you're signed in to dashboard.dupr.com, then reload the profile and try again.",
        );
      } else if (result?.status === 404) {
        showError("Player not found", "DUPR returned no player for this profile ID.");
      } else if (result?.networkError) {
        showError(
          "Couldn't complete the request",
          "DUPR may be temporarily unavailable or may have changed how its dashboard requests work. Try again from the signed-in player profile.",
        );
      } else {
        showError(
          "DUPR couldn't complete the lookup",
          result?.message || "Please try again from the player profile.",
        );
      }
      return;
    }

    const payload = result.payload;
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
  } catch {
    showError(
      "Couldn't load the player profile",
      "Reload the DUPR profile page and click DUPR Free again.",
    );
  }
}

loadCurrentPlayer();
