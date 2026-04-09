export default async function handler(req, res) {
  try {
    const config = {
      daysForward: 30,
      excludedShows: [
        "koolietendus",
        "proov",
        "külalisetendus"
      ]
    };

    const events = await getLinnateaterEvents();
    const filtered = applyFilters(events, config);

    res.status(200).json(filtered);
  } catch (err) {
    res.status(500).json({
      error: "Error loading Linnateater events",
      details: err.message
    });
  }
}

function applyFilters(events, config) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextDays = new Date(today);
  nextDays.setDate(nextDays.getDate() + config.daysForward);
  nextDays.setHours(23, 59, 59, 999);

  return events
    .filter((event) => {
      const eventDate = new Date(event.datetime);
      if (Number.isNaN(eventDate.getTime())) return false;

      const title = (event.title || "").toLowerCase();

      const inDateRange = eventDate >= today && eventDate <= nextDays;
      const notExcluded = !config.excludedShows.some((ex) =>
        title.includes(ex.toLowerCase())
      );

      return inDateRange && notExcluded;
    })
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
}

async function getLinnateaterEvents() {
  const url = "https://linnateater.ee/mangukava/?filter=available";
  const html = await fetchText(url);

  const lines = html
    .split(/\r?\n/)
    .map(stripHtml)
    .map((line) => line.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const events = [];
  let currentYear = new Date().getFullYear();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const monthHeader = line.match(
      /^(jaanuar|veebruar|märts|aprill|mai|juuni|juuli|august|september|oktoober|november|detsember)\s+(\d{4})$/i
    );
    if (monthHeader) {
      currentYear = Number(monthHeader[2]);
      continue;
    }

    // kuupäev nt: "N 09.04"
    const dateMatch = line.match(/^[ETKNRLP]\s+(\d{2})\.(\d{2})$/);
    if (!dateMatch) continue;

    const day = dateMatch[1];
    const month = dateMatch[2];

    let time = null;
    let venue = "Tallinna Linnateater";
    let buyFound = false;

    for (let j = i + 1; j <= Math.min(i + 12, lines.length - 1); j++) {
      const next = lines[j];

      if (!time) {
        const tm = next.match(/^(\d{2}:\d{2})$/);
        if (tm) {
          time = tm[1];
          continue;
        }
      }

      if (next === "Osta pilet") {
        buyFound = true;
        continue;
      }

      if (isVenue(next)) {
        venue = next;
      }

      if (/^[ETKNRLP]\s+\d{2}\.\d{2}$/.test(next)) {
        break;
      }
    }

    if (time && buyFound) {
      events.push({
        theatre: "Tallinna Linnateater",
        title: "Tallinna Linnateatri etendus",
        datetime: `${currentYear}-${month}-${day}T${time}:00+03:00`,
        venue,
        url
      });
    }
  }

  return dedupe(events);
}

function isVenue(value) {
  const v = String(value || "").toLowerCase();
  return [
    "suur saal",
    "väike saal",
    "taevasaal",
    "must saal",
    "võlvsaal",
    "kammersaal",
    "kammer­saal",
    "hobuveski"
  ].includes(v);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(events) {
  const seen = new Set();
  return events.filter((e) => {
    const key = `${e.datetime}|${e.venue}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${url} (${response.status})`);
  }

  return await response.text();
}