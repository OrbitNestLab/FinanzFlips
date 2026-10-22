// Minimal, bounded OpenXML reader for bank exports. It never executes formulas,
// macros or external links, and never extracts ZIP entries to the filesystem.
import { inflateRawSync } from "node:zlib";
import { parseTabularRows } from "./model.mjs";
const MAX_FILE = 20 * 1024 * 1024,
  MAX_TOTAL = 100 * 1024 * 1024;
function unzip(buffer) {
  if (buffer.length > MAX_FILE)
    throw Error("Bitte eine Excel-Datei bis 20 MB verwenden.");
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw Error("Die Datei ist kein unterstütztes XLSX-Dokument.");
  const count = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16);
  if (count > 2000 || count === 65535)
    throw Error("Diese Excel-Datei enthält zu viele Bestandteile.");
  let cursor = offset,
    total = 0;
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (
      cursor + 46 > buffer.length ||
      buffer.readUInt32LE(cursor) !== 0x02014b50
    )
      throw Error("Beschädigtes Excel-Archiv.");
    const flags = buffer.readUInt16LE(cursor + 8),
      method = buffer.readUInt16LE(cursor + 10),
      compressed = buffer.readUInt32LE(cursor + 20),
      size = buffer.readUInt32LE(cursor + 24),
      nameLength = buffer.readUInt16LE(cursor + 28),
      extra = buffer.readUInt16LE(cursor + 30),
      comment = buffer.readUInt16LE(cursor + 32),
      local = buffer.readUInt32LE(cursor + 42),
      name = buffer
        .subarray(cursor + 46, cursor + 46 + nameLength)
        .toString("utf8");
    cursor += 46 + nameLength + extra + comment;
    total += size;
    if (flags & 1)
      throw Error("Passwortgeschützte Excel-Dateien werden nicht unterstützt.");
    if (total > MAX_TOTAL || size > 64 * 1024 * 1024)
      throw Error("Die entpackten Excel-Daten sind zu groß.");
    if (!/^xl\/(sharedStrings|styles|worksheets\/sheet\d+)\.xml$/.test(name))
      continue;
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50)
      throw Error("Beschädigter Excel-Dateieintrag.");
    const start =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    if (start + compressed > buffer.length)
      throw Error("Unvollständige Excel-Datei.");
    const data = buffer.subarray(start, start + compressed),
      raw =
        method === 0
          ? data
          : method === 8
            ? inflateRawSync(data, { maxOutputLength: 64 * 1024 * 1024 })
            : null;
    if (!raw || raw.length !== size)
      throw Error("Nicht unterstützte oder beschädigte Excel-Komprimierung.");
    entries.set(name, raw.toString("utf8"));
  }
  return entries;
}
const entities = (text) =>
  text.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (match) => {
    const body = match.slice(1, -1);
    if (body.startsWith("#")) {
      const code =
        body[1].toLowerCase() === "x"
          ? parseInt(body.slice(2), 16)
          : Number(body.slice(1));
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[body] || match;
  });
const textRuns = (xml) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((m) => entities(m[1]))
    .join("");
function columnIndex(reference) {
  let n = 0;
  for (const c of reference.match(/^[A-Z]+/)?.[0] || "A")
    n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
}
function dateStyles(xml = "") {
  const custom = new Map(
    [
      ...xml.matchAll(
        /<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"[^>]*\/?\s*>/g,
      ),
    ].map((m) => [+m[1], entities(m[2])]),
  );
  const block = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || "";
  return [...block.matchAll(/<xf\b[^>]*numFmtId="(\d+)"[^>]*>/g)].map(
    (m) =>
      (+m[1] >= 14 && +m[1] <= 22) ||
      /[dy]/i.test((custom.get(+m[1]) || "").replace(/"[^"]*"/g, "")),
  );
}
function excelDate(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 100000) return "";
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function parseXLSX(buffer) {
  const files = unzip(buffer),
    strings = [
      ...(files.get("xl/sharedStrings.xml") || "").matchAll(
        /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g,
      ),
    ].map((m) => textRuns(m[1])),
    styles = dateStyles(files.get("xl/styles.xml"));
  let lastError;
  for (const [name, xml] of files)
    if (name.startsWith("xl/worksheets/")) {
      const rows = [];
      for (const match of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const row = [];
        for (const cell of match[1].matchAll(
          /<c\b([^>]*?)(?:>([\s\S]*?)<\/c>|\/>)/g,
        )) {
          const attributes = Object.fromEntries(
              [...cell[1].matchAll(/(\w+)="([^"]*)"/g)].map((m) => [
                m[1],
                m[2],
              ]),
            ),
            content = cell[2] || "",
            v = content.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1] ?? "";
          let value =
            attributes.t === "s"
              ? strings[Number(v)] || ""
              : attributes.t === "inlineStr"
                ? textRuns(content)
                : entities(v);
          if (!attributes.t || attributes.t === "n") {
            if (styles[Number(attributes.s || 0)] && v !== "")
              value = excelDate(v);
            else if (v !== "" && Number.isFinite(Number(v))) value = Number(v);
          }
          row[columnIndex(attributes.r || "A")] = value;
        }
        if (row.some((v) => v !== "" && v !== undefined)) rows.push(row);
      }
      // Some exports start with a short title. Try only the first ten possible
      // header rows; a failed parse never falls back to fabricated values.
      for (let offset = 0; offset < Math.min(10, rows.length - 1); offset++)
        try {
          return parseTabularRows(rows.slice(offset));
        } catch (error) {
          lastError = error;
        }
    }
  throw (
    lastError ||
    Error("Keine lesbare Buchungstabelle in dieser Excel-Datei gefunden.")
  );
}
