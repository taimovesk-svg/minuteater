export default async function handler(req, res) {
  try {
    const url = "https://www.draamateater.ee/mangukava/";

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 MinuteaterBot/1.0"
      }
    });

    const html = await response.text();

    res.status(200).json({
      ok: true,
      status: response.status,
      contentType: response.headers.get("content-type"),
      length: html.length,
      preview: html.slice(0, 3000)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}