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
  let currentMonth = null;
  let currentYear = new Date().getFullYear();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // nt "aprill 2026"
    const monthHeader = line.match(/^(jaanuar|veebruar|märts|aprill|mai|juuni|juuli|august|september|oktoober|november|detsember)\s+(\d{4})$/i);
    if (monthHeader) {
      currentMonth = monthNameToNumber(monthHeader[1]);
      currentYear = Number(monthHeader[2]);
      continue;
    }

    // nt "N 09.04"
    const dateMatch = line.match(/^[ETKNRLP]\s+(\d{2})\.(\d{2})$/);
    if (!dateMatch) continue;

    const day = dateMatch[1];
    const month = dateMatch[2];
    let time = null;
    let title = null;
    let venue = "Tallinna Linnateater";
    let buyFound = false;

    for (let j = i + 1; j <= Math.min(i + 18, lines.length - 1); j++) {
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

      if (!title && looksLikeTitle(next)) {
        title = next;
        continue;
      }

      if (isVenue(next)) {
        venue = next;
      }

      // kui jõuame järgmise kuupäevani, katkesta
      if (/^[ETKNRLP]\s+\d{2}\.\d{2}$/.test(next)) {
        break;
      }
    }

    if (time && buyFound) {
      const finalTitle = title || "Tallinna Linnateatri etendus";

      events.push({
        theatre: "Tallinna Linnateater",
        title: finalTitle,
        datetime: `${currentYear}-${month}-${day}T${time}:00+03:00`,
        venue,
        url
      });
    }
  }

  return dedupe(events);
}

function looksLikeTitle(value) {
  const v = cleanupText(value);
  const lower = v.toLowerCase();

  if (!v) return false;
  if (v.length < 2) return false;
  if (/^\d{2}:\d{2}$/.test(v)) return false;
  if (/^[ETKNRLP]\s+\d{2}\.\d{2}$/.test(v)) return false;

  const blocked = [
    "mängukava",
    "kõik etendused",
    "piletid saadaval",
    "kuupäev",
    "mängukoht",
    "lavastus",
    "mängukohad",
    "lavastused",
    "osta pilet",
    "image",
    "tallinna linnateater"
  ];

  if (blocked.includes(lower)) return false;
  if (isVenue(v)) return false;

  return true;
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

function monthNameToNumber(name) {
  const map = {
    "jaanuar": "01",
    "veebruar": "02",
    "märts": "03",
    "aprill": "04",
    "mai": "05",
    "juuni": "06",
    "juuli": "07",
    "august": "08",
    "september": "09",
    "oktoober": "10",
    "november": "11",
    "detsember": "12"
  };
  return map[String(name || "").toLowerCase()] || null;
}

function cleanupText(value) {
  return String(value || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    const key = `${e.title}|${e.datetime}|${e.venue}`;
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