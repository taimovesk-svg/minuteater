export default async function handler(req, res) {
  try {
    // 👇 DEMO andmed (järgmises sammus paneme päris scrapingu)
    const events = [
      {
        theatre: "Eesti Draamateater",
        title: "Revident",
        datetime: "2026-04-10T19:00:00",
        available: true,
        url: "https://draamateater.ee"
      },
      {
        theatre: "Eesti Draamateater",
        title: "Koolietendus – mingi asi",
        datetime: "2026-04-12T12:00:00",
        available: true,
        url: "https://draamateater.ee"
      },
      {
        theatre: "Tallinna Linnateater",
        title: "Lehman Brothers",
        datetime: "2026-05-20T19:00:00",
        available: true,
        url: "https://linnateater.ee"
      }
    ];

    // 🟢 KONFIG
    const config = {
      daysForward: 30,
      excludedShows: ["koolietendus", "proov", "külalis"]
    };

    // 🟢 KUUPÄEVA FILTER
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const nextDays = new Date(today);
    nextDays.setDate(nextDays.getDate() + config.daysForward);
    nextDays.setHours(23, 59, 59, 999);

    // 🟢 FILTER + SORT
    const filtered = events
      .filter((event) => {
        const eventDate = new Date(event.datetime);
        const title = event.title.toLowerCase();

        const inDateRange =
          eventDate >= today && eventDate <= nextDays;

        const notExcluded =
          !config.excludedShows.some((ex) =>
            title.includes(ex)
          );

        return inDateRange && notExcluded && event.available;
      })
      .sort((a, b) => {
        return new Date(a.datetime) - new Date(b.datetime);
      });

    res.status(200).json(filtered);
  } catch (err) {
    res.status(500).json({ error: "Error loading events" });
  }
}
