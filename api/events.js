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

    const events = await getDraamateaterFromPiletimaailm();
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

async function getDraamateaterFromPiletimaailm() {
  const url = "https://www.piletimaailm.com/performances/timeline_search?organizer_id=7";
  const html = await fetchText(url);

  const events = [];

  // Näidisblokid Piletimaailmas:
  // N 09.04.2026 19:00
  // Maag
  // Välja müüdud!
  // Eesti Draamateater
  // Vabu kohti: 0, Tavahinnad: ...

  const regex =
    /([ETKNRLP])\s+(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})[\s\S]*?\n\s*([^\n<][\s\S]*?)\n[\s\S]*?\n\s*(Osta pilet|Välja müüdud!|Vali kuupäev ja osta pilet|Piletid müügil [^\n<]+)?[\s\S]*?\n\s*([^\n<]+)[\s\S]*?Vabu kohti:\s*(\d+)/g;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const day = match[2];
    const month = match[3];
    const year = match[4];
    const time = match[5];
    const rawTitle = cleanupText(match[6]);
    const status = cleanupText(match[7] || "");
    const venue = cleanupText(match[8] || "");
    const availableTickets = Number(match[9] || 0);

    const title = rawTitle
      .replace(/\s+/g, " ")
      .trim();

    if (!title || isNoise(title)) continue;

    const datetime = `${year}-${month}-${day}T${time}:00+03:00`;

    const available =
      status.toLowerCase().includes("osta pilet") ||
      status.toLowerCase().includes("vali kuupäev") ||
      availableTickets > 0;

    events.push({
      theatre: "Eesti Draamateater",
      title,
      datetime,
      venue: venue || "Eesti Draamateater",
      available,
      availableTickets,
      url: "https://www.piletimaailm.com/performances/timeline_search?organizer_id=7"
    });
  }

  return dedupe(events);
}

function cleanupText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNoise(value) {
  const v = value.toLowerCase();

  return [
    "eesti draamateater",
    "vabu kohti",
    "osta pilet",
    "välja müüdud!"
  ].includes(v);
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