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
    const filtered = applyFilters(draamaEvents, config);

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

  const lines = html
    .split(/\r?\n/)
    .map((line) => stripHtml(line))
    .map((line) => line.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const events = [];
  let currentDate = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Nt: "N 09.04 N 9 aprill 19:00 Lehman Brothers"
    const dateLineMatch = line.match(
      /^[ETKNRLP]\s+(\d{2})\.(\d{2}).*?(\d{2}:\d{2})\s+(.+)$/
    );

    if (dateLineMatch) {
      const [, day, month, time, title] = dateLineMatch;

      currentDate = {
        day,
        month,
        time
      };

      const year = inferYear(Number(month), Number(day));
      const datetime = buildIso(year, month, day, time);

      let venue = "Eesti Draamateater";
      let buyUrl = url;

      // vaata mõned järgmised read läbi
      for (let j = i + 1; j <= Math.min(i + 8, lines.length - 1); j++) {
        const next = lines[j];

        if (isVenue(next)) {
          venue = next;
        }
      }

      events.push({
        theatre: "Eesti Draamateater",
        title: cleanupText(title),
        datetime,
        venue,
        url: buyUrl
      });

      continue;
    }

    // erijuht: mõnel real jätkub sama kuupäeva all järgmine etendus kujul "19:00 Maag"
    if (currentDate) {
      const sameDayMatch = line.match(/^(\d{2}:\d{2})\s+(.+)$/);

      if (sameDayMatch) {
        const [, time, rawTitle] = sameDayMatch;

        if (looksLikeTitle(rawTitle)) {
          const year = inferYear(Number(currentDate.month), Number(currentDate.day));
          const datetime = buildIso(year, currentDate.month, currentDate.day, time);

          let venue = "Eesti Draamateater";

          for (let j = i + 1; j <= Math.min(i + 6, lines.length - 1); j++) {
            const next = lines[j];
            if (isVenue(next)) {
              venue = next;
              break;
            }
          }

          events.push({
            theatre: "Eesti Draamateater",
            title: cleanupText(rawTitle),
            datetime,
            venue,
            url
          });
        }
      }
    }
  }

  return dedupe(events);
}

function inferYear(month, day) {
  const now = new Date();
  const currentYear = now.getFullYear();

  // lihtne loogika: kui kuu on juba ammu möödas, siis võib olla järgmine aasta
  const currentMonth = now.getMonth() + 1;
  if (month < currentMonth - 2) {
    return currentYear + 1;
  }

  return currentYear;
}

function buildIso(year, month, day, time) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${time}:00+03:00`;
}

function isVenue(value) {
  const v = String(value || "").toLowerCase();

  return [
    "suur saal",
    "väike saal",
    "maalisaal",
    "teatrimaja",
    "leedu riiklik noorsooteater",
    "teater vanemuine, tartu"
  ].includes(v);
}

function looksLikeTitle(value) {
  const v = cleanupText(value).toLowerCase();

  if (!v) return false;
  if (v.length < 2) return false;
  if (isVenue(v)) return false;

  const blockedStarts = [
    "nb!",
    "ingliskeelsete",
    "solarise",
    "ugala teatri",
    "pärast etendust",
    "viimaseid kordi",
    "viimast korda",
    "lisaetendus"
  ];

  if (blockedStarts.some((x) => v.startsWith(x))) return false;
  if (/^\d{2}:\d{2}$/.test(v)) return false;

  return true;
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
    const key = `${e.theatre}|${e.title}|${e.datetime}|${e.venue}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 MinuteaterBot/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${url} (${response.status})`);
  }

  return await response.text();
}