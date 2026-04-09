import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "events.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const events = JSON.parse(raw);

    const config = {
      daysForward: 30,
      excludedShows: ["koolietendus", "proov", "külalisetendus"]
    };

    const filtered = applyFilters(events, config);

    res.status(200).json(filtered);
  } catch (err) {
    res.status(500).json({
      error: "Error loading local events",
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