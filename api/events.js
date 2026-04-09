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

    const [draamaEvents, linnaEvents] = await Promise.all([
      getDraamateaterEvents(),
      getLinnateaterEvents()
    ]);

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
      if (!event.available) return false;

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

  const lines = html.split(/\r?\n/);
  const events = [];

  let currentDate = null;

  for (let i = 0; i < lines.length; i++) {
    const line = clean(lines[i]);

    const dateMatch = line.match(/([ETKNRLP])\s*(\d{1,2})\.(\d{2})\s+([ETKNRLP])\s*\d{1,2}\s+\S+\s+(\d{2}:\d{2})/);
    if (dateMatch) {
      currentDate = {
        day: pad2(dateMatch[2]),
        month: dateMatch[3],
        time: dateMatch[4]
      };
    }

    const titleMatch = line.match(/>([^<]+)<\/a>/);
    const maybeTitle = titleMatch?.[1]?.trim();

    if (currentDate && maybeTitle && !isNoiseTitle(maybeTitle)) {
      const title = maybeTitle;

      let venue = "";
      let buyUrl = "";
      let available = false;
      let availableTickets = null;

      for (let j = i; j < Math.min(i + 12, lines.length); j++) {
        const nextLine = clean(lines[j]);

        if (!venue) {
          const venueMatch = nextLine.match(/(suur saal|väike saal|Maalisaal|teatrimaja|Leedu Riiklik Noorsooteater|Teater Vanemuine, Tartu)/i);
          if (venueMatch) {
            venue = venueMatch[1];
          }
        }

        if (!buyUrl) {
          const buyMatch = lines[j].match(/href="([^"]*piletimaailm[^"]*)"/i);
          if (buyMatch) {
            buyUrl = buyMatch[1];
            available = true;
          }
        }

        const seatsMatch = nextLine.match(/Vabu kohti:\s*(\d+)/i);
        if (seatsMatch) {
          availableTickets = Number(seatsMatch[1]);
          available = availableTickets > 0;
        }
      }

      const year = inferYear(currentDate.month);
      const datetime = `${year}-${currentDate.month}-${currentDate.day}T${currentDate.time}:00+03:00`;

      events.push({
        theatre: "Eesti Draamateater",
        title,
        datetime,
        available,
        availableTickets,
        venue: venue || "Eesti Draamateater",
        url: buyUrl || url
      });
    }
  }

  return dedupe(events);
}

async function getLinnateaterEvents() {
  const url = "https://linnateater.ee/mangukava/?filter=available";
  const html = await fetchText(url);

  const lines = html.split(/\r?\n/);
  const events = [];

  let currentMonth = null;

  for (let i = 0; i < lines.length; i++) {
    const line = clean(lines[i]);

    const monthMatch = line.match(/###\s+([a-zõäöü]+)\s+(\d{4})/i);
    if (monthMatch) {
      currentMonth = {
        monthName: monthMatch[1].toLowerCase(),
        year: monthMatch[2]
      };
    }

    const dateMatch = line.match(/^([ETKNRLP])\s+(\d{2})\.(\d{2})$/);
    if (dateMatch && currentMonth) {
      const day = dateMatch[2];
      const month = dateMatch[3];

      let time = null;
      let title = null;
      let venue = "Tallinna Linnateater";
      let urlMatch = null;
      let available = false;

      for (let j = i; j < Math.min(i + 20, lines.length); j++) {
        const nextLine = clean(lines[j]);

        if (!time) {
          const tm = nextLine.match(/^(\d{2}:\d{2})$/);
          if (tm) time = tm[1];
        }

        if (!title) {
          const altMatch = lines[j].match(/alt="([^"]+)"/i);
          const titleAttrMatch = lines[j].match(/title="([^"]+)"/i);
          const headingMatch = lines[j].match(/<h[2-4][^>]*>(.*?)<\/h[2-4]>/i);

          title =
            altMatch?.[1]?.trim() ||
            titleAttrMatch?.[1]?.trim() ||
            stripHtml(headingMatch?.[1] || "");
        }

        if (nextLine.includes("Osta pilet")) {
          available = true;
        }

        if (!urlMatch) {
          const href = lines[j].match(/href="([^"]+)"/i);
          if (href) urlMatch = href[1];
        }

        const venueMatch = nextLine.match(/Suur saal|Väike saal|Taevasaal|Must saal|Võlvsaal|Kammer­saal|Kammersaal|Hobuveski/i);
        if (venueMatch) {
          venue = venueMatch[0];
        }
      }

      if (available && time) {
        const finalTitle = title && !isNoiseTitle(title)
          ? title
          : "Tallinna Linnateatri etendus";

        const datetime = `${currentMonth.year}-${month}-${day}T${time}:00+03:00`;

        events.push({
          theatre: "Tallinna Linnateater",
          title: finalTitle,
          datetime,
          available: true,
          venue,
          url: normalizeUrl(urlMatch, "https://linnateater.ee")
        });
      }
    }
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

function inferYear(month) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const parsedMonth = Number(month);

  if (parsedMonth < currentMonth - 2) {
    return currentYear + 1;
  }

  return currentYear;
}

function normalizeUrl(url, base) {
  if (!url) return base;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${base}${url}`;
  return `${base}/${url}`;
}

function clean(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function isNoiseTitle(value) {
  const v = String(value || "").trim().toLowerCase();

  return [
    "mängukava",
    "repertuaar",
    "piletid saadaval",
    "osta pilet",
    "image"
  ].includes(v);
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
