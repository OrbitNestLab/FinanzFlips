import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { localVault } from "./local-vault.mjs";
import { parseXLSX } from "./xlsx.mjs";
import {
  parseCSV,
  classifyCategory,
  mergeTransactions,
  markSplitOriginals,
} from "./model.mjs";

const MAX_BODY = 28_500_000;

function error(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw error("Die Exportdatei ist zu groß.", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw error("Die Importanfrage ist ungültig.");
  }
}

function sameToken(req, token) {
  const actual = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return actual.length === token.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(token));
}

function findAccount(state, transaction) {
  const iban = String(transaction.referenceIban || "").replace(/\s/g, "").toUpperCase();
  return (
    state.accounts.find((account) => transaction.accountId === account.id) ||
    state.accounts.find((account) => iban && String(account.iban || "").replace(/\s/g, "").toUpperCase() === iban) ||
    state.accounts.find((account) => String(account.name || "").trim().toLocaleLowerCase("de-DE") === String(transaction.account || "").trim().toLocaleLowerCase("de-DE"))
  );
}

function applyRule(state, transaction) {
  const merchant = String(transaction.merchant || "").trim().toLocaleLowerCase("de-DE");
  for (const rule of state.categoryRules || []) {
    if (
      merchant === rule.merchant &&
      transaction.accountId === rule.accountId &&
      Math.sign(transaction.amount) === rule.direction &&
      (transaction.category === rule.fromCategory || transaction.group === "Sonstiges")
    ) {
      transaction.group = rule.group;
      transaction.subcategory = rule.subcategory;
      transaction.category = rule.subcategory;
    }
  }
  return transaction;
}

export function startShareGateway({ dataDir = "/data/finanzflips", port = 8100 } = {}) {
  const vault = localVault(dataDir);
  const tokenPath = path.join(dataDir, ".finanzflips-share-token");
  let token;
  if (fs.existsSync(tokenPath)) token = vault.read(tokenPath).trim();
  if (!/^[a-f0-9]{64}$/.test(token || "")) {
    token = crypto.randomBytes(32).toString("hex");
    vault.write(tokenPath, token);
  }
  process.env.SHARE_IMPORT_TOKEN = token;

  const dataPath = path.join(dataDir, ".finanzflips-data.json");
  const load = () => JSON.parse(vault.read(dataPath));
  const save = (data) => vault.write(dataPath, JSON.stringify(data, null, 2));

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method !== "POST" || url.pathname !== "/api/share-import")
        throw error("Nicht gefunden.", 404);
      if (!sameToken(req, token)) throw error("Freigabeschlüssel ungültig.", 401);

      const input = await readJson(req);
      const filename = String(input.filename || "").slice(0, 240);
      const encoded = String(input.file || "");
      if (!/\.(?:xlsx|csv)$/i.test(filename))
        throw error("Bitte eine XLSX- oder CSV-Datei aus Finanzguru teilen.");
      if (!/^[A-Za-z0-9+/=]+$/.test(encoded) || encoded.length > 28_000_000)
        throw error("Die Exportdatei ist ungültig oder zu groß.");

      const file = Buffer.from(encoded, "base64");
      const parsed = /\.xlsx$/i.test(filename)
        ? parseXLSX(file)
        : parseCSV(file.toString("utf8").replace(/^\uFEFF/, ""));
      if (!parsed.transactions.length) throw error("Keine gültigen Buchungen gefunden.");

      const data = load();
      const state = data.appState;
      if (!state || !Array.isArray(state.accounts) || !Array.isArray(state.extraTransactions))
        throw error("Der FinanzFlips-Datenbestand ist nicht bereit.", 503);

      const missing = new Set();
      const prepared = [];
      for (const transaction of parsed.transactions) {
        const account = findAccount(state, transaction);
        if (!account) {
          missing.add(transaction.account || transaction.referenceIban || "Unbekannt");
          continue;
        }
        const category = classifyCategory(transaction.category, transaction.merchant, transaction.amount);
        prepared.push(
          applyRule(state, {
            ...transaction,
            id: "tx_" + crypto.randomUUID(),
            accountId: account.id,
            account: transaction.account || account.name,
            referenceIban: transaction.referenceIban || account.iban || "",
            ...category,
            source: "share-import",
            importedAt: new Date().toISOString(),
          }),
        );
      }
      if (missing.size)
        throw error("Diese Konten müssen zuerst in FinanzFlips zugeordnet werden: " + [...missing].join(", "), 422);

      const existing = [...(state.extraTransactions || []), ...(state.transactions || [])];
      const merged = mergeTransactions(existing, prepared);
      const added = merged.transactions.slice(existing.length);
      state.extraTransactions.push(...added);
      markSplitOriginals([...(state.extraTransactions || []), ...(state.transactions || [])]);
      state.lastImportAt = new Date().toISOString();
      state.auditLog ||= [];
      state.auditLog.unshift({
        id: "audit_" + crypto.randomUUID(),
        at: state.lastImportAt,
        label: `${added.length} Buchungen über das Teilen-Menü importiert`,
      });
      data.appStateUpdatedAt = new Date().toISOString();
      save(data);
      send(res, 200, {
        imported: true,
        added: added.length,
        duplicates: merged.duplicates,
        invalidRows: parsed.errors?.length || 0,
        message: `${added.length} neue Buchungen · ${merged.duplicates} bereits vorhandene übersprungen.`,
      });
    } catch (cause) {
      send(res, cause.status || 500, { error: cause.message || "Import fehlgeschlagen." });
    }
  });
  server.listen(port, "0.0.0.0", () => console.log(`[share-import] bereit auf Port ${port}`));
  return { server, token };
}
