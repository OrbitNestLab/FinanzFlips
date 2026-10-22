import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

// A loopback-only HTTPS endpoint. It never exposes the general app API.
export function createBankCallback({
  key,
  cert,
  root,
  mainPort,
  mainUrl = `http://finanzflips.localhost:${mainPort}`,
}) {
  return https.createServer({ key, cert }, (req, res) => {
    const headers = {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    };
    const reply = (
      code,
      body,
      type = "text/plain; charset=utf-8",
      extra = {},
    ) => {
      res.writeHead(code, { ...headers, "Content-Type": type, ...extra });
      res.end(req.method === "HEAD" ? "" : body);
    };
    try {
      const url = new URL(req.url, "https://" + req.headers.host);
      if (
        !["localhost", "127.0.0.1", "finanzflips.localhost"].includes(
          url.hostname,
        )
      )
        return reply(403, "Diese lokale Adresse ist nicht freigegeben.");
      if (!["GET", "HEAD"].includes(req.method))
        return reply(405, "Methode nicht erlaubt.");
      if (
        ["/privacy.html", "/terms.html", "/styles.css"].includes(url.pathname)
      ) {
        const filename = path.join(root, url.pathname.slice(1));
        return reply(
          200,
          fs.readFileSync(filename),
          url.pathname.endsWith(".css")
            ? "text/css; charset=utf-8"
            : "text/html; charset=utf-8",
        );
      }
      if (url.pathname === "/favicon.ico") return reply(204, "");
      if (url.pathname === "/")
        return reply(
          200,
          '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FinanzFlips · Lokale Bank-Rückleitung</title><style>body{background:#0e1510;color:#eef4ef;font:18px/1.7 -apple-system,sans-serif;max-width:720px;margin:80px auto;padding:24px}a{color:#afe1bb}</style><h1>Die lokale Bank-Rückleitung ist bereit.</h1><p>Diese Adresse läuft ausschließlich auf deinem Mac und nimmt die Antwort deiner Bankfreigabe entgegen. Deine Bankanmeldung erfolgt bei deiner Bank.</p><p><a href="' +
            mainUrl +
            '/#/bank">Bankeinrichtung in FinanzFlips öffnen</a></p><p><a href="/privacy.html">Datenschutz</a> · <a href="/terms.html">Nutzungshinweise</a></p></html>',
          "text/html; charset=utf-8",
        );
      if (url.pathname !== "/callback") return reply(404, "Nicht gefunden.");
      if (req.method !== "GET") return reply(405, "Methode nicht erlaubt.");
      // Forward only the dedicated callback; do not forward browser credentials or headers.
      const upstream = http.request(
        {
          hostname: "127.0.0.1",
          port: mainPort,
          path: "/callback" + url.search,
          method: req.method,
          timeout: 60000,
        },
        (incoming) => {
          if (incoming.statusCode === 303) {
            incoming.resume();
            return reply(303, "", "text/plain; charset=utf-8", {
              Location: mainUrl + "/?connected=1#/bank",
            });
          }
          res.writeHead(incoming.statusCode || 502, {
            ...headers,
            "Content-Type":
              incoming.headers["content-type"] || "text/plain; charset=utf-8",
          });
          incoming.pipe(res);
        },
      );
      upstream.on("timeout", () => upstream.destroy());
      upstream.on("error", () => {
        if (!res.headersSent)
          reply(
            502,
            "FinanzFlips ist gerade nicht erreichbar. Bitte die Bankeinrichtung erneut öffnen.",
          );
        else res.destroy();
      });
      res.on("close", () => {
        if (!res.writableFinished) upstream.destroy();
      });
      upstream.end();
    } catch {
      if (!res.headersSent)
        reply(400, "Die lokale Anfrage konnte nicht verarbeitet werden.");
      else res.destroy();
    }
  });
}
