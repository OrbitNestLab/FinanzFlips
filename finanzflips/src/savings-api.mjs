import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import webpush from "web-push";
import { SavingsService } from "./savings-service.mjs";
import {
  bookedSnapshot,
  cleanIban,
  epcPayload,
  savingsError,
} from "./savings-core.mjs";
export function savingsAPI({
  dataDir,
  vault,
  loadData,
  eb,
  bodyJson,
  send,
  config,
}) {
  const file = path.join(dataDir, ".finanzflips-savings.enc"),
    pushFile = path.join(dataDir, ".finanzflips-push.enc");
  const read = () => (fs.existsSync(file) ? JSON.parse(vault.read(file)) : {});
  const write = (d) => vault.write(file, JSON.stringify(d));
  const pushRead = () =>
    fs.existsSync(pushFile)
      ? JSON.parse(vault.read(pushFile))
      : { subscriptions: [] };
  const pushWrite = (d) => vault.write(pushFile, JSON.stringify(d));
  const sources = () => {
    const d = loadData();
    return (d.appState?.accounts || [])
      .filter(
        (a) =>
          a.syncKey &&
          d.accounts.some(
            (r) =>
              r.uid === a.syncKey &&
              r.bank === "ING" &&
              r.country === "DE" &&
              r.cash_account_type === "CACC" &&
              r.currency === "EUR" &&
              cleanIban(r.account_id?.iban) === cleanIban(a.iban),
          ),
      )
      .map((a) => ({ id: a.id, name: a.name, iban: a.iban }));
  };
  async function fetchBalance(sourceId) {
    const d = loadData(),
      a = d.appState?.accounts.find((a) => a.id === sourceId),
      matches = d.accounts.filter(
        (r) =>
          a &&
          r.uid === a.syncKey &&
          r.bank === "ING" &&
          r.country === "DE" &&
          r.cash_account_type === "CACC" &&
          r.currency === "EUR" &&
          cleanIban(r.account_id?.iban) === cleanIban(a.iban),
      );
    if (matches.length !== 1)
      throw savingsError("Das ING-Quellkonto ist nicht eindeutig verbunden.");
    const r = matches[0],
      s = d.sessions.find((s) => s.session_id === r.session_id);
    if (
      !s ||
      !s.access?.valid_until ||
      Date.parse(s.access.valid_until) <= Date.now()
    )
      throw savingsError("Die ING-Freigabe fehlt oder ist abgelaufen.");
    const requestedAt = new Date().toISOString(),
      result = await eb("/accounts/" + encodeURIComponent(r.uid) + "/balances");
    return bookedSnapshot(result, {
      requestedAt,
      receivedAt: new Date().toISOString(),
    });
  }
  async function notify(op) {
    const payload = {
      title: "Finanzflips – Sparbetrag bereit",
      body: "Deine monatliche Sparberechnung ist abgeschlossen. Öffne Finanzflips, um das Ergebnis zu prüfen und die Überweisung vorzubereiten.",
      operationId: op.id,
    };
    if (config.FINANZFLIPS_HA_INGRESS === "1") {
      const target = config.FINANZFLIPS_NOTIFY_SERVICE;
      if (!/^mobile_app_[a-z0-9_]+$/.test(target || ""))
        return {
          sent: 0,
          error:
            "Bitte das iPhone-Benachrichtigungsziel in der HA-App-Konfiguration wählen.",
        };
      const response = await fetch(
        "http://supervisor/core/api/services/notify/" + target,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + config.SUPERVISOR_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: payload.title,
            message: payload.body,
            data: {
              tag: "finanzflips-" + op.id,
              url: config.FINANZFLIPS_HA_PANEL || "/hassio/dashboard",
            },
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      return response.ok
        ? { sent: 1, transport: "ha", at: new Date().toISOString() }
        : {
            sent: 0,
            error: "Home Assistant hat die Benachrichtigung nicht angenommen.",
          };
    }
    const p = pushRead();
    if (!p.keys || !p.subscriptions.length)
      return { sent: 0, error: "Noch kein Gerät für Push angemeldet." };
    let sent = 0;
    const expired = [];
    for (const sub of p.subscriptions) {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload), {
          vapidDetails: {
            subject: config.WEB_PUSH_CONTACT || "https://localhost/",
            publicKey: p.keys.publicKey,
            privateKey: p.keys.privateKey,
          },
          TTL: 86400,
          timeout: 15000,
        });
        sent++;
      } catch (e) {
        if ([404, 410].includes(e.statusCode)) expired.push(sub.endpoint);
      }
    }
    if (expired.length) {
      p.subscriptions = p.subscriptions.filter(
        (s) => !expired.includes(s.endpoint),
      );
      pushWrite(p);
    }
    return {
      sent,
      ...(!sent ? { error: "Push konnte nicht zugestellt werden." } : {}),
      at: new Date().toISOString(),
    };
  }
  const service = new SavingsService({
    read,
    write,
    fetchBalance,
    sourceAccounts: sources,
    notify,
  });
  return {
    service,
    async handle(req, res, url) {
      if (!url.pathname.startsWith("/api/savings")) return false;
      const p = url.pathname.slice("/api/savings".length);
      if (req.method === "GET" && p === "/status") {
        send(res, 200, {
          ...service.status(),
          push: {
            ha: config.FINANZFLIPS_HA_INGRESS === "1",
            configured:
              !!config.FINANZFLIPS_NOTIFY_SERVICE ||
              pushRead().subscriptions.length > 0,
          },
        });
        return true;
      }
      if (req.method === "GET" && p === "/push-key") {
        let p = pushRead();
        if (!p.keys) {
          p.keys = webpush.generateVAPIDKeys();
          pushWrite(p);
        }
        send(res, 200, { publicKey: p.keys.publicKey });
        return true;
      }
      if (req.method === "GET" && p.startsWith("/qr/")) {
        const op = service.payment(p.slice(4));
        const png = await QRCode.toBuffer(epcPayload(op), {
          type: "png",
          errorCorrectionLevel: "M",
          margin: 4,
          width: 600,
        });
        send(res, 200, png, "image/png");
        return true;
      }
      if (req.method !== "POST")
        throw savingsError("Unbekannter Spar-Endpunkt.", 404);
      const input = await bodyJson(req);
      if (p === "/settings") send(res, 200, service.settings(input));
      else if (p === "/activate") send(res, 200, service.activate(input));
      else if (p === "/run")
        send(
          res,
          200,
          await service.run({
            requestId: input.requestId,
            confirmNew: input.confirmNew,
            previousId: input.previousId,
            trigger: "manual",
          }),
        );
      else if (p === "/prepare")
        send(res, 200, await service.prepare(input.id, input));
      else if (p === "/status") send(res, 200, service.update(input.id, input));
      else if (p === "/payment") send(res, 200, service.payment(input.id));
      else if (p === "/push-subscribe") {
        const s = input.subscription;
        let endpoint;
        try {
          endpoint = new URL(s?.endpoint);
        } catch {
          throw savingsError("Ungültiges Push-Ziel.");
        }
        if (
          endpoint.protocol !== "https:" ||
          endpoint.port ||
          endpoint.username ||
          endpoint.password ||
          !(
            [
              "fcm.googleapis.com",
              "updates.push.services.mozilla.com",
            ].includes(endpoint.hostname) ||
            endpoint.hostname.endsWith(".push.apple.com")
          )
        )
          throw savingsError("Dieses Push-Ziel wird nicht unterstützt.");
        if (
          !/^[A-Za-z0-9_-]{80,100}$/.test(s.keys?.p256dh || "") ||
          !/^[A-Za-z0-9_-]{20,30}$/.test(s.keys?.auth || "")
        )
          throw savingsError("Push-Schlüssel ungültig.");
        const p = pushRead();
        p.subscriptions = p.subscriptions.filter(
          (x) => x.endpoint !== s.endpoint,
        );
        if (p.subscriptions.length >= 5)
          throw savingsError("Maximal fünf Geräte.");
        p.subscriptions.push({
          endpoint: s.endpoint,
          keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
        });
        pushWrite(p);
        send(res, 200, { saved: true });
      } else throw savingsError("Unbekannter Spar-Endpunkt.", 404);
      return true;
    },
  };
}
