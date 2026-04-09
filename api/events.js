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

    const draamaEvents = await getDraamateaterEvents();
    const linnaEvents = []; // lisame hiljem tagasi

    const events = [...draamaEvents, ...linnaEvents];
    const filtered = applyFilters(events, config);

    res.status(200).json(filtered);
  } catch (err) {
    res.status(500).json({
      error: "Error loading events",
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

      const inDateRange =
        eventDate >= today && eventDate <= nextDays;

      const notExcluded =
        !config.excludedShows.some((ex) =>
          title.includes(ex.toLowerCase())
        );

      return inDateRange && notExcluded;
    })
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
}

async function getDraamateaterEvents() {
  const url = "https://www.draamateater.ee/mangukava/";
  const html = await fetchText(url);

  const events = [];
  const year = new Date().getFullYear();

  // Lihtne starter-regex:
  // püüab kinni kuupäeva + kellaaja + lähima lingi teksti
  const regex = /(\d{2}\.\d{2})\s+(\d{2}:\d{2})[\s\S]{0,800}?>([^<]{3,120})<\/a>/g;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const rawDate = match[1];   // nt 09.04
    const rawTime = match[2];   // nt 19:00
    const rawTitle = cleanupText(match[3]);

    if (isNoiseTitle(rawTitle)) continue;

    const [day, month] = rawDate.split(".");
    const datetime = `${year}-${month}-${day}T${rawTime}:00+03:00`;

    events.push({
      theatre: "Eesti Draamateater",
      title: rawTitle,
      datetime,
      available: true,
      venue: "Eesti Draamateater",
      url
    });
  }

  return dedupe(events);
}

function dedupe(events) {
  const seen = new Set();

  return events.filter((e) => {
    const key = `${e.theatre}|${e.title}|${e.datetime}|${e.venue}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanupText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNoiseTitle(value) {
  const v = String(value || "").trim().toLowerCase();

  const blockedExact = [
    "mängukava",
    "repertuaar",
    "osta pilet",
    "piletid",
    "loe edasi",
    "vaata rohkem"
  ];

  if (blockedExact.includes(v)) return true;
  if (v.length < 3) return true;
  if (/^\d+$/.test(v)) return true;
  if (/^\d{2}:\d{2}$/.test(v)) return true;

  return false;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "MinuteaterBot/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${url} (${response.status})`);
  }

  return await response.text();
}

