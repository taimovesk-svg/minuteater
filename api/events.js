export default async function handler(req, res) {
  try {
    const html = await fetchText("https://www.draamateater.ee/mangukava/");

    // 👉 võtame kõik script blokid
    const scripts = html.match(/<script[\s\S]*?<\/script>/g) || [];

    let jsonData = null;

    for (const s of scripts) {
      if (s.includes("mangukava") || s.includes("events")) {
        const match = s.match(/\{[\s\S]*\}/);
        if (match) {
          jsonData = match[0];
          break;
        }
      }
    }

    if (!jsonData) {
      return res.status(200).json({
        error: "Ei leidnud JSON andmeid (JS renderdatud leht)"
      });
    }

    // 👉 kui JSON leitakse (harva), proovime parse
    let parsed;
    try {
      parsed = JSON.parse(jsonData);
    } catch {
      return res.status(200).json({
        error: "JSON parse failed",
        raw: jsonData.slice(0, 500)
      });
    }

    return res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });
  return await res.text();
}