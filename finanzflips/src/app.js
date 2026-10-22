import "./savings-ui.mjs";
import { browserUUID } from "./browser-crypto.mjs";
import {
  SCHEMA_VERSION,
  GROUPS,
  FREQUENCIES,
  norm,
  hash,
  isoDate,
  today,
  shiftMonth,
  monthIndex,
  migrateState,
  emptyState,
  allTransactions,
  detectRecurring,
  recurringSummary,
  cashflow,
  datasetDate,
  monthlyEquivalent,
  isTransfer,
  classifyCategory,
  sum,
  ibanKey,
  parseCSV,
  mergeTransactions,
  markSplitOriginals,
  loanSchedule,
  requiredLoanPayment,
  addMonths,
} from "./model.mjs";
import {
  escape as e,
  icon,
  currency,
  dateLabel,
  monthLabel,
  option,
  money,
} from "./ui.mjs";
import {
  shell,
  renderPage,
  filteredTransactions,
  accountName,
  loanBalance,
} from "./views.mjs";
import {
  recurringDialog,
  accountDialog,
  transactionDialog,
  loanDialog,
  extraPaymentDialog,
  budgetDialog,
  importDialog,
  restoreDialog,
  confirmDialog,
  subOptions,
} from "./dialogs.mjs";
import { BANKS } from "./bank-catalog.mjs";
import { forecastDialog, duplicateDialog } from "./planning-ui.mjs";
import {
  reviewCandidates,
  reviewFingerprint,
  validReviewChanges,
} from "./agent.mjs";
const root = document.getElementById("app"),
  modal = document.getElementById("modal");
// Home Assistant opens the app in an authenticated iframe. Its panel URL
// cannot carry our inner hash route, so land directly on the savings view.
if (window.self !== window.top && !location.hash) location.hash = "/savings";
let state = emptyState(),
  revision = null,
  ready = false,
  dirty = 0,
  saveQueue = Promise.resolve(),
  conflict = false,
  sequence = 0,
  derived = null,
  importPreview = null,
  restorePreview = null,
  modalType = "",
  modalItem = null;
const ui = {
  month: localStorage.getItem("finanzflips-ui-month") || today().slice(0, 7),
  privacy: localStorage.getItem("finanzflips-privacy") === "true",
  route: "dashboard",
  accountId: "",
  loanId: "",
  page: 1,
  accountView: "active",
  filters: {
    q: "",
    month: today().slice(0, 7),
    account: "",
    group: "",
    direction: "",
    sort: "newest",
    recurring: "",
  },
  recurringFilter: "active",
  recurringGroup: "",
  recurringQuery: "",
  analytics: { chart: "cashflow", range: 6, account: "", group: "" },
  chat: [],
  aiBusy: false,
  aiReviewBusy: false,
  aiStatus: null,
  bankStatus: null,
  bankCountry: "DE",
  bankQuery: "",
  banks: [],
  bankTestResult: "",
  bankSyncResult: "",
  syncStatus: "saved",
  syncError: "",
  menuOpen: false,
  loanAll: false,
};
const presentationMode =
  new URLSearchParams(location.search).get("presentation") === "1";
if (presentationMode) ui.privacy = true;
function maskPresentationNumbers(container) {
  if (!presentationMode) return;
  document.body.classList.add("presentation-mode");
  const presentationBrand = container.querySelector(".brand > span:last-child");
  if (presentationBrand)
    presentationBrand.innerHTML =
      'Finanz<span class="presentation-flips">Flips<span class="presentation-tamo">Tamo</span></span><small>Dein Finanzblick</small>';
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT),
    nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (
      !parent ||
      parent.closest(".redacted,script,style,textarea") ||
      !/[0-9]|•{3,}/.test(node.textContent)
    )
      continue;
    if (parent.closest("option")) {
      node.textContent = node.textContent.replace(/\d[\d.,]*/g, "•••");
      continue;
    }
    if (parent.namespaceURI === "http://www.w3.org/2000/svg") {
      node.textContent = node.textContent.replace(/\d[\d.,]*/g, "■■■");
      parent.setAttribute("fill", "#050806");
      continue;
    }
    const text = node.textContent,
      fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(/[+\-]?\d[\d.,/%$€:–-]*|•{3,}/g)) {
      fragment.append(document.createTextNode(text.slice(last, match.index)));
      const span = document.createElement("span");
      span.className = "screenshot-redacted";
      span.textContent = "•••";
      span.setAttribute("aria-label", "Zahl ausgeblendet");
      fragment.append(span);
      last = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(last)));
    node.replaceWith(fragment);
  }
  container.querySelectorAll("select").forEach((select) => {
    if (select.selectedOptions[0]?.textContent.includes("•••"))
      select.classList.add("screenshot-select");
  });
}
function toast(message, error = false) {
  const node = document.createElement("div");
  node.className = "toast" + (error ? " error" : "");
  node.textContent = message;
  document.getElementById("toasts").append(node);
  setTimeout(() => node.remove(), error ? 8000 : 4500);
}
async function api(url, options = {}) {
  const response = await fetch(url.replace(/^\//, "./"), {
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.error || "Die Anfrage konnte nicht abgeschlossen werden.",
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
let dbPromise,
  cacheWarning = false;
function cacheDatabase() {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("finanzflips-local", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("cache");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return dbPromise;
}
async function cacheRecord(key, value) {
  const db = await cacheDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("cache", "readwrite");
    transaction.objectStore("cache").put(value, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}
async function readCached() {
  try {
    const db = await cacheDatabase();
    const value = await new Promise((resolve, reject) => {
      const request = db
        .transaction("cache", "readonly")
        .objectStore("cache")
        .get("primary");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (value) return value;
  } catch {}
  try {
    return JSON.parse(localStorage.getItem("finanzflips-v1"));
  } catch {
    return null;
  }
}
function cache() {
  cacheRecord("primary", structuredClone(state)).catch(() => {
    if (!cacheWarning) {
      cacheWarning = true;
      toast(
        "Die zusätzliche Browserkopie konnte nicht gespeichert werden. Bitte prüfe die lokale Serverspeicherung.",
        true,
      );
    }
  });
}

function invalidate() {
  markSplitOriginals([...state.extraTransactions, ...state.transactions]);
  sequence++;
  derived = null;
}
function context() {
  if (!derived)
    derived = {
      txs: allTransactions(state),
      recurring: detectRecurring(state, today()),
    };
  return { ...ui, ...derived, state };
}
function render({ focus, selection } = {}) {
  if (!ready) return;
  const c = context();
  document.body.classList.toggle("privacy", ui.privacy);
  root.innerHTML = shell(c, renderPage(c));
  maskPresentationNumbers(root);
  document.title =
    "FinanzFlips · " +
    ({
      dashboard: "Übersicht",
      accounts: "Konten & Kredite",
      recurring: "Fixkosten & Verträge",
      income: "Einnahmen",
      transactions: "Buchungen",
      analytics: "Auswertungen",
      budgets: "Budgets",
      agent: "Finanzagent",
      bank: "Bankverbindung",
      settings: "Einstellungen",
      loan: "Kreditplan",
    }[ui.route] || "Finanzblick");
  if (focus) {
    const node = document.getElementById(focus);
    node?.focus({ preventScroll: true });
    if (selection && node?.setSelectionRange)
      try {
        node.setSelectionRange(...selection);
      } catch {}
  }
}
function setSync(status, message = "") {
  ui.syncStatus = status;
  ui.syncError = message;
  if (ready) {
    document.querySelectorAll(".local-card").forEach((el) => {
      el.innerHTML = `<strong>${icon("lock", 13)} Privat auf deinem Mac</strong><span class="status-dot ${status === "error" ? "warn" : ""}"></span>${status === "saving" ? "Änderungen werden gespeichert …" : status === "error" ? "Speicherung prüfen" : "Daten lokal gespeichert"}`;
    });
    if (status === "error" || document.querySelector(".save-banner")) render();
  }
}
function saveState() {
  cache();
  const snapshot = structuredClone(state);
  dirty++;
  setSync("saving");
  saveQueue = saveQueue.then(async () => {
    let saved = false;
    try {
      if (conflict) return false;
      const data = await api("/api/app-state", {
        method: "PUT",
        body: JSON.stringify({ state: snapshot, revision }),
      });
      revision = data.updatedAt;
      saved = true;
      return true;
    } catch (err) {
      conflict = err.status === 409;
      setSync(
        "error",
        conflict
          ? "In einem anderen Browser wurde inzwischen gespeichert. Sichere deine Änderungen und lade den gemeinsamen Stand neu."
          : err.message,
      );
      toast(
        conflict
          ? "Änderungskonflikt: Dein lokaler Stand bleibt erhalten. Bitte vor dem Neuladen sichern."
          : "Lokal im Browser gesichert. Speicherung auf dem Mac noch nicht bestätigt.",
        true,
      );
      return false;
    } finally {
      dirty--;
      if (!dirty && saved) setSync("saved");
    }
  });
  return saveQueue;
}
function audit(label, undo) {
  state.auditLog ||= [];
  state.auditLog.push({
    id: browserUUID(),
    at: new Date().toISOString(),
    label,
    undo,
  });
  if (state.auditLog.length > 80) state.auditLog = state.auditLog.slice(-80);
  invalidate();
  render();
  saveState();
}
function entityUndo(collection, id, before) {
  return {
    type: "entity",
    collection,
    id,
    before: before ? structuredClone(before) : null,
  };
}
function replaceEntity(collection, id, value) {
  const index = state[collection].findIndex((x) => x.id === id);
  if (value === null) {
    if (index >= 0) state[collection].splice(index, 1);
  } else if (index >= 0) state[collection][index] = value;
  else state[collection].push(value);
}
function applyUndo(undo) {
  if (!undo) return;
  switch (undo.type) {
    case "forecast-settings":
      state.settings = undo.before;
      break;
    case "bank-reconciliation":
      for (const { id } of undo.links) {
        const row = [...state.extraTransactions, ...state.transactions].find(
          (t) => t.id === id,
        );
        if (row) {
          delete row.bankDuplicateOf;
          delete row.bankDuplicateReason;
          row.keepBankDuplicate = true;
        }
      }
      break;
    case "entity":
      replaceEntity(undo.collection, undo.id, undo.before);
      break;
    case "compound":
      for (const op of undo.ops.toReversed()) applyUndo(op);
      break;
    case "override":
      if (undo.before) state.recurringOverrides[undo.id] = undo.before;
      else delete state.recurringOverrides[undo.id];
      break;
    case "tx-fields":
      for (const x of undo.rows) {
        const t = [...state.extraTransactions, ...state.transactions].find(
          (t) => t.id === x.id,
        );
        if (t) {
          for (const field of undo.fields)
            if (Object.hasOwn(x, field)) t[field] = x[field];
            else delete t[field];
        }
      }
      if (undo.ruleId)
        state.categoryRules = state.categoryRules.filter(
          (r) => r.id !== undo.ruleId,
        );
      break;
    case "transactions-added": {
      const ids = new Set(undo.ids);
      state.extraTransactions = state.extraTransactions.filter(
        (t) => !ids.has(t.id),
      );
      state.transactions = state.transactions.filter((t) => !ids.has(t.id));
      break;
    }
  }
}
function undoLast() {
  const entry = state.auditLog.toReversed().find((x) => x.undo && !x.undoneAt);
  if (!entry) return toast("Keine Änderung zum Rückgängigmachen.");
  applyUndo(entry.undo);
  if (state.balanceHistory?.some((x) => x.date === today())) recordSnapshot();
  entry.undoneAt = new Date().toISOString();
  invalidate();
  render();
  saveState();
  toast("Rückgängig: " + entry.label);
}
function recordSnapshot() {
  const assets = sum(
      state.accounts.filter((a) => a.includeInNetWorth).map((a) => a.balance),
    ),
    debt = sum(state.loans.map(loanBalance)),
    netWorth = sum([assets, -debt]),
    date = today();
  state.balanceHistory ||= [];
  const snapshot = { date, assets, debt, netWorth, source: "manual" };
  const existing = state.balanceHistory.findIndex((p) => p.date === date);
  if (existing >= 0) state.balanceHistory[existing] = snapshot;
  else state.balanceHistory.push(snapshot);
  state.balanceHistory.sort((a, b) => a.date.localeCompare(b.date));
}
function prepareState(raw) {
  const previous = structuredClone(raw || {}),
    s = migrateState(raw);
  const groupsMap = {
    Lebensmittel: "Lebensmittel & Alltag",
    "Essen & Trinken": "Essen & Ausgehen",
    Freizeit: "Freizeit & Lifestyle",
    Lifestyle: "Freizeit & Lifestyle",
    Mobilitaet: "Mobilität",
    Finanzen: "Kredite & Finanzen",
    Kinder: "Familie & Kinder",
    Sparen: "Vermögensaufbau",
    Drogerie: "Lebensmittel & Alltag",
  };
  if (!previous.schemaVersion || previous.schemaVersion < 2) {
    s.migration = {
      at: new Date().toISOString(),
      from: previous.schemaVersion || 1,
      originalBudgets: previous.budgets || [],
    };
    const merged = new Map();
    for (const b of s.budgets) {
      const group = b.group || groupsMap[b.name] || b.name;
      if (!GROUPS[group]) continue;
      const existing = merged.get(group);
      if (existing)
        existing.limit = sum([existing.limit, Number(b.limit) || 0]);
      else
        merged.set(group, {
          ...b,
          id: b.id || "budget_" + hash(group),
          group,
          name: group,
          limit: Number(b.limit) || 0,
        });
    }
    s.budgets = [...merged.values()];
  }
  for (const b of s.budgets) {
    b.id ||= "budget_" + hash(b.group || b.name);
    b.group ||= groupsMap[b.name] || b.name;
  }
  return s;
}
async function loadShared({ initial = false } = {}) {
  if (dirty && !initial) return;
  const data = await api("/api/app-state");
  revision = data.updatedAt;
  if (data.state) state = prepareState(data.state);
  else {
    const local = await readCached();
    state = local?.extraTransactions?.length
      ? prepareState(local)
      : emptyState();
  }
  invalidate();
  conflict = false;
  ui.syncStatus = "saved";
  cache();
  if (initial) {
    const hasSelected = localStorage.getItem("finanzflips-ui-month");
    if (!hasSelected) ui.month = datasetDate(state).slice(0, 7);
    ui.filters.month = ui.month;
  }
  ready = true;
  root.hidden = false;
  document.getElementById("startup").hidden = true;
  readRoute();
  render();
  if (!data.state || data.state.schemaVersion !== SCHEMA_VERSION)
    await saveState();
}
function readRoute() {
  const raw = location.hash.startsWith("#/")
      ? location.hash.slice(2)
      : "dashboard",
    part = raw.split("?"),
    [route, id] = part[0].split("/"),
    params = new URLSearchParams(part[1] || "");
  ui.route = route || "dashboard";
  ui.accountId = route === "accounts" ? id || "" : "";
  ui.loanId = route === "loan" ? id || "" : "";
  ui.page = 1;
  ui.menuOpen = false;
  ui.loanAll = false;
  if (route === "transactions" || (route === "accounts" && id)) {
    ui.filters = {
      q: params.get("q") || "",
      month: params.get("month") || (id ? "all" : ui.month),
      account: params.get("account") || "",
      group: params.get("group") || "",
      direction: params.get("direction") || "",
      sort: "newest",
      recurring: params.get("recurring") || "",
      rangeFrom: params.get("from") || "",
      rangeTo: params.get("to") || "",
    };
  }
  if (["recurring", "income"].includes(route)) {
    ui.recurringFilter = params.has("changes") ? "changes" : "active";
    ui.recurringQuery = "";
    ui.recurringGroup = "";
  }
  if (route === "analytics" && params.has("chart"))
    ui.analytics.chart = params.get("chart");
}
function navigate(path) {
  if (location.hash === "#/" + path) {
    readRoute();
    render();
  } else location.hash = "/" + path;
}
window.addEventListener("hashchange", () => {
  if (!ready) return;
  readRoute();
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
});
function showDialog(spec, type = "", item = null) {
  modalType = type;
  modalItem = item;
  modal.classList.toggle("wide", !!spec.wide);
  modal.innerHTML = spec.html;
  maskPresentationNumbers(modal);
  if (!modal.open) modal.showModal();
  [...modal.querySelectorAll("input:not([type=hidden]),select,textarea")]
    .find((node) => node.getClientRects().length)
    ?.focus({ preventScroll: true });
}
function closeDialog() {
  modal.close();
  modalType = "";
  modalItem = null;
}
function formError(form, message) {
  const el = form.querySelector("[data-form-error]");
  if (el) {
    el.textContent = message;
    el.hidden = false;
    el.scrollIntoView({ block: "nearest" });
  } else toast(message, true);
}
function formValues(form) {
  return Object.fromEntries(new FormData(form));
}
const number = (value, label, min = -Infinity, max = Infinity) => {
  const n = Number(value);
  if (String(value).trim() === "" || !Number.isFinite(n) || n < min || n > max)
    throw Error(label + " prüfen.");
  return n;
};
function openRecurring(id, direction = "expense") {
  const item = context().recurring.find((x) => x.id === id);
  showDialog(
    recurringDialog(context(), item || {}, item?.direction || direction),
    "recurring",
    item,
  );
}
function openAccount(id) {
  const item = state.accounts.find((x) => x.id === id);
  showDialog(accountDialog(context(), item || {}), "account", item);
}
function openTransaction(id) {
  const item = context().txs.find((x) => x.id === id);
  if (!state.accounts.length) return toast("Lege zuerst ein Konto an.", true);
  showDialog(transactionDialog(context(), item || {}), "transaction", item);
}
function openLoan(id) {
  const item = state.loans.find((x) => x.id === id);
  showDialog(loanDialog(context(), item || {}), "loan", item);
  updateLoanPreview();
}
function download(name, text, type = "application/json") {
  const blob = new Blob([text], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportBackup() {
  download(
    "FinanzFlips-Sicherung-" + today() + ".json",
    JSON.stringify(
      {
        format: "FinanzFlips",
        version: 2,
        exportedAt: new Date().toISOString(),
        state,
      },
      null,
      2,
    ),
  );
  toast("Vollständige Sicherung heruntergeladen.");
}
function csv(rows) {
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let s = String(value ?? "");
            if (
              typeof value !== "number" &&
              !/^-?\d+(?:[.,]\d+)?$/.test(s) &&
              /^[\s]*[=+@-]/.test(s)
            )
              s = "'" + s;
            return '"' + s.replace(/"/g, '""') + '"';
          })
          .join(";"),
      )
      .join("\r\n")
  );
}
function exportTransactions() {
  const rows = filteredTransactions(context());
  download(
    "FinanzFlips-Buchungen-" + today() + ".csv",
    csv([
      [
        "Datum",
        "Zahlungspartner",
        "Betrag",
        "Konto",
        "Lebensbereich",
        "Unterkategorie",
        "Ursprungskategorie",
        "Eigene IBAN",
        "Gegenkonto IBAN",
        "Verwendungszweck",
      ],
      ...rows.map((t) => [
        t.bookingDate,
        t.merchant,
        t.amount.toFixed(2).replace(".", ","),
        state.accounts.find((a) => a.id === t.accountId)?.name || t.account,
        t.group,
        t.subcategory,
        t.category,
        t.referenceIban,
        t.counterpartyIban,
        t.description,
      ]),
    ]),
    "text/csv;charset=utf-8",
  );
  toast(rows.length + " Buchungen exportiert.");
}
async function refreshStatuses() {
  const results = await Promise.allSettled([
    api("/api/ai/status"),
    api("/api/enable/status"),
    api("/api/fints/status"),
  ]);
  if (results[0].status === "fulfilled") ui.aiStatus = results[0].value;
  if (results[1].status === "fulfilled") ui.bankStatus = results[1].value;
  if (results[2].status === "fulfilled") ui.fintsStatus = results[2].value;
  if (ready && ["bank", "settings", "agent", "fints"].includes(ui.route))
    render();
}
let fintsPoll;
async function pollFinTS() {
  if (!ui.fintsSession) return;
  try {
    const event = await api(
      "/api/fints/session?id=" + encodeURIComponent(ui.fintsSession),
    );
    if (JSON.stringify(event) !== JSON.stringify(ui.fintsEvent)) {
      ui.fintsEvent = event;
      if (ui.route === "fints") render();
    }
    if (event.type === "complete") {
      clearInterval(fintsPoll);
      await refreshSharedIfIdle();
      await refreshStatuses();
    }
    if (event.type === "error") clearInterval(fintsPoll);
  } catch (err) {
    clearInterval(fintsPoll);
    ui.fintsEvent = { type: "error", message: err.message };
    if (ui.route === "fints") render();
  }
}
async function refreshSharedIfIdle() {
  if (
    !ready ||
    dirty ||
    conflict ||
    modal.open ||
    ui.aiBusy ||
    ui.aiReviewBusy ||
    document.activeElement?.matches("input,textarea,select")
  )
    return;
  try {
    const expected = revision,
      counter = sequence;
    const data = await api("/api/app-state");
    if (
      dirty ||
      conflict ||
      sequence !== counter ||
      revision !== expected ||
      modal.open
    )
      return;
    if (data.updatedAt !== revision && data.state) {
      revision = data.updatedAt;
      state = prepareState(data.state);
      invalidate();
      cache();
      render();
    }
  } catch {}
}
window.addEventListener("focus", refreshSharedIfIdle);
setInterval(() => {
  if (!document.hidden) refreshSharedIfIdle();
}, 30000);
function saveRecurring(form) {
  const v = formValues(form),
    original = context().recurring.find((x) => x.id === form.dataset.id),
    amount = number(v.amount, "Planbetrag", 0.01, 1e8),
    direction = v.direction === "income" ? "income" : "expense";
  if (!v.name.trim()) throw Error("Bitte eine Bezeichnung eingeben.");
  if (!FREQUENCIES[v.frequency]) throw Error("Zahlungsrhythmus prüfen.");
  if (v.nextDate && !isoDate(v.nextDate))
    throw Error("Das nächste Zahlungsdatum prüfen.");
  const fields = {
    name: v.name.trim(),
    merchant: original?.merchant || v.name.trim(),
    amount,
    frequency: v.frequency,
    direction,
    accountId: v.accountId || "",
    group: direction === "income" ? "Einnahmen" : v.group,
    subcategory: v.customSubcategory?.trim() || v.subcategory,
    status: v.status,
    nextDate: v.nextDate || "",
    nextAmount: amount,
    dueDay: v.nextDate ? Number(v.nextDate.slice(8)) : 1,
    endDate: v.endDate || "",
    noticeDays: v.noticeDays
      ? number(v.noticeDays, "Kündigungsfrist", 0, 3650)
      : null,
    notes: v.notes || "",
    matchMerchant: v.matchMerchant?.trim() || v.name.trim(),
    reviewed: true,
    kind:
      direction === "income" && v.subcategory === "Gehalt"
        ? "salary"
        : original?.kind || "contract",
    updatedAt: new Date().toISOString(),
  };
  let undo;
  if (original?.source === "detected") {
    undo = {
      type: "override",
      id: original.id,
      before: structuredClone(state.recurringOverrides[original.id] || null),
    };
    state.recurringOverrides[original.id] = {
      ...state.recurringOverrides[original.id],
      ...fields,
      snapshot: { ...original, snapshot: undefined },
    };
  } else {
    const id = original?.id || "manual_" + browserUUID();
    undo = entityUndo(
      "manualRecurring",
      id,
      state.manualRecurring.find((x) => x.id === id),
    );
    replaceEntity("manualRecurring", id, {
      ...original,
      ...fields,
      id,
      source: "manual",
      createdAt: original?.createdAt || new Date().toISOString(),
    });
  }
  closeDialog();
  audit(
    (original ? "Eintrag angepasst: " : "Eintrag angelegt: ") + fields.name,
    undo,
  );
  toast("Gespeichert. Deine Vorgaben haben Vorrang vor der Erkennung.");
}
function saveAccount(form) {
  const v = formValues(form),
    old = state.accounts.find((x) => x.id === form.dataset.id),
    id = old?.id || "acct_" + browserUUID();
  if (!v.name.trim()) throw Error("Kontoname fehlt.");
  const name = v.name.trim();
  if (state.accounts.some((a) => a.id !== id && a.name === name))
    throw Error("Dieser Kontoname wird bereits verwendet.");
  const account = {
    ...old,
    id,
    name,
    displayType: v.displayType,
    type: old?.type || "Manuell erfasst",
    balance: number(v.balance, "Kontostand", -1e9, 1e9),
    iban: v.iban.trim(),
    includeInNetWorth: v.includeInNetWorth === "on",
    balanceUpdatedAt: isoDate(v.balanceUpdatedAt),
    notes: v.notes || "",
    source: old?.source || "manual",
  };
  if (!account.balanceUpdatedAt) throw Error("Datum des Kontostands prüfen.");
  if (
    account.balance !== old?.balance ||
    account.balanceUpdatedAt !== old?.balanceUpdatedAt
  )
    account.balanceObservedAt = null;
  const undo = entityUndo("accounts", id, old);
  replaceEntity("accounts", id, account);
  recordSnapshot();
  closeDialog();
  audit((old ? "Konto angepasst: " : "Konto angelegt: ") + name, undo);
  toast("Kontodaten gespeichert. Zugehörige Buchungen bleiben erhalten.");
}
function saveTransaction(form) {
  const v = formValues(form),
    original = context().txs.find((x) => x.id === form.dataset.id),
    id = original?.id || "tx_" + browserUUID(),
    collection = original
      ? state.extraTransactions.some((t) => t.id === id)
        ? "extraTransactions"
        : "transactions"
      : "transactions";
  if (!v.merchant.trim()) throw Error("Zahlungspartner fehlt.");
  const amount = number(v.amount, "Betrag", -1e9, 1e9),
    date = isoDate(v.date);
  if (!amount || !date)
    throw Error("Gültiges Datum und einen Betrag ungleich 0 eingeben.");
  const account = state.accounts.find((a) => a.id === v.accountId);
  if (!account) throw Error("Konto auswählen.");
  const group = v.group,
    subcategory = v.customSubcategory?.trim() || v.subcategory;
  const undo = [entityUndo(collection, id, original)];
  if (v.applySimilar === "on" && original) {
    const fields = ["group", "subcategory", "category"],
      matches = context().txs.filter(
        (t) =>
          t.id !== id &&
          t.accountId === original.accountId &&
          Math.sign(t.amount) === Math.sign(original.amount) &&
          norm(t.merchant) === norm(original.merchant) &&
          t.group === original.group &&
          t.subcategory === original.subcategory,
      );
    const rows = matches.map((t) => ({
      id: t.id,
      ...Object.fromEntries(fields.map((f) => [f, t[f]])),
    }));
    for (const t of matches) {
      t.group = group;
      t.subcategory = subcategory;
      t.category = subcategory;
    }
    const ruleId = browserUUID();
    state.categoryRules.push({
      id: ruleId,
      merchant: norm(original.merchant),
      accountId: original.accountId,
      direction: Math.sign(original.amount),
      fromCategory: original.category,
      fromGroup: original.group,
      group,
      subcategory,
    });
    undo.push({ type: "tx-fields", fields, rows, ruleId });
  }
  const transaction = {
    ...original,
    id,
    merchant: v.merchant.trim(),
    date,
    bookingDate: date,
    amount,
    accountId: account.id,
    account: original?.account || account.name,
    group,
    subcategory,
    category: subcategory,
    transferOverride: v.transferOverride,
    description: v.description || "",
    referenceIban: original?.referenceIban || account.iban || "",
    source: original?.source || "manual",
    editedAt: new Date().toISOString(),
  };
  replaceEntity(collection, id, transaction);
  closeDialog();
  audit(
    (original ? "Buchung angepasst: " : "Buchung angelegt: ") +
      transaction.merchant,
    { type: "compound", ops: undo },
  );
  toast(
    v.applySimilar === "on"
      ? "Buchung und ähnliche Zuordnungen gespeichert."
      : "Buchung gespeichert.",
  );
}
function loanFromForm(form) {
  const v = formValues(form),
    old = state.loans.find((l) => l.id === form.dataset.id),
    balance = number(v.balance, "Restschuld", 0, 1e9),
    annualRate = number(v.annualRate, "Sollzins", 0, 100),
    balanceDate = isoDate(v.balanceDate),
    nextDueDate = isoDate(v.nextDueDate);
  if (!balanceDate || !nextDueDate || nextDueDate <= balanceDate)
    throw Error("Die erste Rate muss nach dem Datum der Restschuld liegen.");
  let monthlyPayment,
    termMonths = null;
  if (v.mode === "term") {
    termMonths = number(v.termMonths, "Restlaufzeit", 1, 1200);
    if (!Number.isInteger(termMonths))
      throw Error("Laufzeit in ganzen Monaten eingeben.");
    monthlyPayment = requiredLoanPayment(balance, annualRate, termMonths);
  } else if (v.mode === "enddate") {
    const end = isoDate(v.targetEndDate);
    if (!end || end < nextDueDate)
      throw Error("Das Schlussdatum muss nach der ersten Rate liegen.");
    termMonths =
      monthIndex(end.slice(0, 7)) - monthIndex(nextDueDate.slice(0, 7)) + 1;
    monthlyPayment = requiredLoanPayment(balance, annualRate, termMonths);
  } else
    monthlyPayment = number(v.monthlyPayment, "Monatliche Rate", 0.01, 1e9);
  return {
    ...old,
    id: old?.id || "loan_" + browserUUID(),
    name: v.name.trim() || v.bankName.trim() || "Mein Kredit",
    bankName:
      v.bankName?.trim() ||
      BANKS.find((b) => b.id === v.bankLogoId)?.name ||
      "",
    bankLogoId: v.bankLogoId || "",
    balance,
    annualRate,
    balanceDate,
    nextDueDate,
    dueDay: Number(nextDueDate.slice(8)),
    monthlyPayment,
    originalAmount: v.originalAmount
      ? number(v.originalAmount, "Ursprüngliche Kreditsumme", 0, 1e9)
      : null,
    termMonths,
    targetEndDate: v.targetEndDate || "",
    accountId: v.accountId || "",
    linkRecurringId: v.linkRecurringId || "",
    notes: v.notes || "",
    extraPayments: (old?.extraPayments || []).filter(
      (x) => x.date > balanceDate,
    ),
    archived: v.archived === "on",
    source: "manual",
    updatedAt: new Date().toISOString(),
  };
}
function updateLoanPreview() {
  const form = modal.querySelector('[data-form="loan"]');
  if (!form) return;
  const out = form.querySelector("#loan-preview");
  try {
    const loan = loanFromForm(form),
      plan = loanSchedule(loan);
    out.innerHTML = plan.notAmortizing
      ? `${icon("alert", 16)} Die Rate deckt die laufenden Zinsen nicht ausreichend. Ein Tilgungsende ist so nicht berechenbar.`
      : `<div class="row between wrap"><span>Monatliche Rate: ${money(loan.monthlyPayment, ui.privacy)}</span><span>Voraussichtliches Ende: <strong>${dateLabel(plan.endDate)}</strong></span></div><div class="mt-sm text-small">${plan.months} Raten · Zinsen insgesamt ${money(plan.interest, ui.privacy)} · Modellrechnung</div>`;
  } catch {
    out.textContent =
      "Ergänze Restschuld, Sollzins, Rate oder Laufzeit und die erste zukünftige Rate für die Vorschau.";
  }
}
function saveLoan(form) {
  const loan = loanFromForm(form),
    old = state.loans.find((l) => l.id === loan.id),
    undo = [entityUndo("loans", loan.id, old)],
    plan = loanSchedule(loan);
  if (!loan.name.trim()) throw Error("Kreditname fehlt.");
  replaceEntity("loans", loan.id, loan);
  const rateId = "loan-rate_" + loan.id,
    oldRate = state.manualRecurring.find((x) => x.id === rateId);
  if (loan.linkRecurringId) {
    if (oldRate) {
      undo.push(entityUndo("manualRecurring", rateId, oldRate));
      replaceEntity("manualRecurring", rateId, null);
    }
    const linked = context().recurring.find(
      (x) => x.id === loan.linkRecurringId,
    );
    if (linked?.source === "detected") {
      undo.push({
        type: "override",
        id: linked.id,
        before: structuredClone(state.recurringOverrides[linked.id] || null),
      });
      state.recurringOverrides[linked.id] = {
        ...state.recurringOverrides[linked.id],
        amount: loan.monthlyPayment,
        nextAmount: loan.monthlyPayment,
        frequency: "monthly",
        reviewed: true,
        loanId: loan.id,
        kind: "loan",
        status: plan.paidOff || loan.archived ? "ended" : "active",
        snapshot: { ...linked, snapshot: undefined },
      };
    } else if (linked) {
      undo.push(entityUndo("manualRecurring", linked.id, linked));
      replaceEntity("manualRecurring", linked.id, {
        ...linked,
        amount: loan.monthlyPayment,
        nextAmount: loan.monthlyPayment,
        frequency: "monthly",
        kind: "loan",
        loanId: loan.id,
        status: plan.paidOff || loan.archived ? "ended" : "active",
      });
    }
  } else {
    undo.push(entityUndo("manualRecurring", rateId, oldRate));
    const next = plan.rows.find((r) => r.date >= today());
    replaceEntity("manualRecurring", rateId, {
      ...oldRate,
      id: rateId,
      name: loan.name + " · Kreditrate",
      merchant: loan.bankName || loan.name,
      direction: "expense",
      kind: "loan",
      loanId: loan.id,
      accountId: loan.accountId,
      group: "Kredite & Finanzen",
      subcategory: "Kreditrate",
      amount: loan.monthlyPayment,
      nextAmount: loan.monthlyPayment,
      frequency: "monthly",
      nextDate: next?.date || loan.nextDueDate,
      dueDay: loan.dueDay,
      status: plan.paidOff || loan.archived ? "ended" : "active",
      reviewed: true,
      source: "manual",
      notes: "Verknüpft mit dem manuellen Kreditplan.",
    });
  }
  recordSnapshot();
  closeDialog();
  audit((old ? "Kredit aktualisiert: " : "Kredit angelegt: ") + loan.name, {
    type: "compound",
    ops: undo,
  });
  navigate("loan/" + loan.id);
  toast("Kredit und Tilgungsplan gespeichert.");
}
function saveBudget(form) {
  const v = formValues(form),
    old = state.budgets.find((b) => b.id === form.dataset.id),
    id = old?.id || "budget_" + hash(v.group);
  if (state.budgets.some((b) => b.group === v.group && b.id !== id))
    throw Error("Für diese Kategorie gibt es bereits ein Budget.");
  const undo = entityUndo("budgets", id, old);
  replaceEntity("budgets", id, {
    ...old,
    id,
    group: v.group,
    name: v.group,
    limit: number(v.limit, "Budgetlimit", 0, 1e9),
  });
  closeDialog();
  audit("Budget angepasst: " + v.group, undo);
  toast("Monatsbudget gespeichert.");
}
function applyCategoryRules(t) {
  for (const rule of state.categoryRules || [])
    if (
      norm(t.merchant) === rule.merchant &&
      t.accountId === rule.accountId &&
      Math.sign(t.amount) === rule.direction &&
      (t.category === rule.fromCategory || t.group === "Sonstiges")
    ) {
      t.group = rule.group;
      t.subcategory = rule.subcategory;
      t.category = rule.subcategory;
    }
  return t;
}
function matchImportAccount(t, fallback) {
  return (
    state.accounts.find((a) => t.accountId && a.id === t.accountId) ||
    state.accounts.find(
      (a) =>
        ibanKey(t.referenceIban) &&
        ibanKey(a.iban) === ibanKey(t.referenceIban),
    ) ||
    state.accounts.find((a) => norm(a.name) === norm(t.account) && t.account) ||
    state.accounts.find((a) => a.id === fallback)
  );
}
function commitImport(form) {
  if (!importPreview) throw Error("Importvorschau fehlt.");
  const fallback = formValues(form).accountId;
  const prepared = importPreview.rows.map((t) => {
    const account = matchImportAccount(t, fallback);
    if (!account)
      throw Error(
        "Bitte ein Zielkonto für nicht zugeordnete Buchungen wählen.",
      );
    const cat = classifyCategory(t.category, t.merchant, t.amount);
    return applyCategoryRules({
      ...t,
      id: "tx_" + browserUUID(),
      accountId: account.id,
      account: t.account || account.name,
      referenceIban: t.referenceIban || account.iban || "",
      ...cat,
      source: "csv",
      importedAt: new Date().toISOString(),
    });
  });
  const merged = mergeTransactions(state.extraTransactions, prepared),
    ids = merged.transactions
      .slice(state.extraTransactions.length)
      .map((t) => t.id);
  state.extraTransactions = merged.transactions;
  markSplitOriginals([...state.extraTransactions, ...state.transactions]);
  state.lastImportAt = new Date().toISOString();
  closeDialog();
  audit(merged.added + " Buchungen importiert", {
    type: "transactions-added",
    ids,
  });
  importPreview = null;
  toast(
    merged.added +
      " neue Buchungen · " +
      merged.duplicates +
      " bereits vorhandene übersprungen.",
  );
  if (merged.added && state.aiAutomationEnabled !== false)
    setTimeout(() => reviewWithAI(true, ids), 500);
}
async function restoreConfirmed(form) {
  if (!restorePreview) throw Error("Keine geprüfte Sicherung ausgewählt.");
  await api("/api/app-state/backup", {
    method: "POST",
    body: JSON.stringify({ reason: "before-restore" }),
  });
  state = prepareState(restorePreview.state);
  restorePreview = null;
  closeDialog();
  invalidate();
  cache();
  render();
  const saved = await saveState();
  if (saved)
    toast(
      "Sicherung wiederhergestellt. Vorheriger Stand liegt als lokale Serversicherung vor.",
    );
}
async function loadBanks() {
  const data = await api(
    "/api/enable/banks?country=" + encodeURIComponent(ui.bankCountry),
  );
  ui.banks = Array.isArray(data) ? data : data.aspsps || [];
  render();
  toast(ui.banks.length + " Banken geladen.");
}
async function testBank() {
  ui.bankTestResult = "Verbindung wird geprüft …";
  render();
  try {
    const result = await api("/api/enable/test", {
      method: "POST",
      body: "{}",
    });
    ui.bankTestResult = result.message || "Verbindung zum Anbieter bestätigt.";
    if (result.warnings?.length)
      ui.bankTestResult += " " + result.warnings.join(" ");
  } catch (err) {
    ui.bankTestResult = err.message;
  }
  await refreshStatuses();
  render();
}
async function saveBankSettings(form) {
  const v = formValues(form),
    file = form.elements.privateKey.files[0];
  if (file && file.size > 30000) throw Error("Die Schlüsseldatei ist zu groß.");
  const privateKey = file ? await file.text() : undefined;
  await api("/api/enable/settings", {
    method: "POST",
    body: JSON.stringify({
      app_id: v.appId.trim(),
      base_url: v.baseUrl.trim(),
      private_key: privateKey,
    }),
  });
  toast("Bankeinrichtung lokal gespeichert.");
  await refreshStatuses();
}
async function syncBank() {
  if (ui.bankSyncBusy) return;
  if (dirty) await saveQueue;
  if (conflict || ui.syncStatus === "error")
    throw Error(
      "Bitte zuerst deine lokalen Änderungen speichern oder den gemeinsamen Stand laden.",
    );
  ui.bankSyncBusy = true;
  ui.bankSyncResult = "Kontostände und neue Buchungen werden abgerufen …";
  render();
  try {
    const result = await api("/api/enable/sync", {
      method: "POST",
      body: "{}",
    });
    // The server merges into the latest shared state, even with the browser closed.
    await refreshSharedIfIdle();
    ui.bankSyncResult =
      `Aktualisiert: ${result.accounts} Konten · ${result.added} neue Buchungen · ${result.duplicates} bereits vorhanden.` +
      (result.reconciled ? ` ${result.reconciled} Dubletten zugeordnet.` : "") +
      (result.errors?.length
        ? " " + result.errors.map((x) => x.bank + ": " + x.message).join(" ")
        : "");
    await refreshStatuses();
    toast(
      result.accounts
        ? "Bankdaten auf dem Mac gespeichert."
        : "Keine Konten aktualisiert. Bitte Hinweise prüfen.",
      !result.accounts,
    );
    if (result.added && state.aiAutomationEnabled !== false)
      setTimeout(() => reviewWithAI(true, result.addedIds), 500);
  } catch (err) {
    ui.bankSyncResult = err.message;
    toast(err.message, true);
  } finally {
    ui.bankSyncBusy = false;
    render();
  }
}
async function askAgent(message) {
  if (ui.aiBusy) return;
  const question = message.trim();
  if (!question) return;
  ui.chat.push({ role: "user", text: question });
  ui.aiBusy = true;
  render();
  document
    .getElementById("chat-messages")
    ?.scrollTo({ top: 1e6, behavior: "smooth" });
  const c = context(),
    flow = cashflow(state, ui.month, c.txs),
    summary = recurringSummary(c.recurring),
    finances = {
      period: ui.month,
      dataAsOf: datasetDate(state),
      monthlyCashflow: {
        income: flow.income,
        expenses: flow.expenses,
        net: flow.net,
        groups: flow.groups,
      },
      monthlyHistory: Array.from({ length: 12 }, (_, i) => {
        const m = shiftMonth(ui.month, i - 11),
          f = cashflow(state, m, c.txs);
        return {
          month: m,
          income: f.income,
          expenses: f.expenses,
          net: f.net,
          groups: f.groups,
        };
      }),
      plannedRecurring: {
        income: summary.income,
        expenses: summary.expenses,
        available: summary.available,
      },
      accounts: state.accounts.map(
        ({
          name,
          displayType,
          balance,
          includeInNetWorth,
          balanceUpdatedAt,
        }) => ({
          name,
          type: displayType,
          balance,
          includeInNetWorth,
          balanceUpdatedAt,
        }),
      ),
      loans: state.loans.map((l) => ({
        name: l.name,
        balance: loanBalance(l),
        annualRate: l.annualRate,
        monthlyPayment: l.monthlyPayment,
        modelCalculation: true,
      })),
      recurring: c.recurring
        .filter((x) => x.status === "active")
        .slice(0, 45)
        .map(
          ({
            name,
            direction,
            group,
            subcategory,
            amount,
            frequency,
            reviewed,
            splitSalary,
            reason,
          }) => ({
            name,
            direction,
            group,
            subcategory,
            amount,
            frequency,
            reviewed,
            splitSalary,
            reason,
          }),
        ),
      transactions: c.txs
        .filter((t) => !isTransfer(t, state))
        .slice(0, 60)
        .map((t) => ({
          date: t.bookingDate,
          merchant: t.merchant,
          amount: t.amount,
          group: t.group,
          subcategory: t.subcategory,
          account: state.accounts.find((a) => a.id === t.accountId)?.name,
        })),
    };
  try {
    const result = await api("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message: question, finances }),
    });
    ui.chat.push({ role: "assistant", text: result.answer });
    if (ui.aiStatus) ui.aiStatus.usd = result.usd;
  } catch (err) {
    ui.chat.push({ role: "assistant", text: err.message });
  } finally {
    ui.aiBusy = false;
    render();
    document
      .getElementById("chat-messages")
      ?.scrollTo({ top: 1e6, behavior: "smooth" });
  }
}
async function reviewWithAI(automatic = false, ids = null) {
  if (
    ui.aiReviewBusy ||
    ui.aiBusy ||
    conflict ||
    !ui.aiStatus?.configured ||
    ui.aiStatus?.paused
  ) {
    if (!automatic)
      toast(
        "Bitte zuerst die KI-Verbindung und das Kostenlimit in den Einstellungen prüfen.",
        true,
      );
    return;
  }
  const pool = ids
    ? reviewCandidates(state, 100000)
        .filter((t) => ids.includes(t.id))
        .slice(0, 40)
    : reviewCandidates(state);
  const candidates = structuredClone(pool);
  if (!candidates.length) {
    if (!automatic)
      toast(
        "Alle geeigneten Buchungen sind bereits geprüft. Manuelle Zuordnungen bleiben erhalten.",
      );
    return;
  }
  ui.aiReviewBusy = true;
  render();
  try {
    const result = await api("/api/ai/review", {
      method: "POST",
      body: JSON.stringify({
        candidates: candidates.map(
          ({ id, merchant, bookingDate, amount, group, subcategory }) => ({
            id,
            merchant,
            bookingDate,
            amount,
            group,
            subcategory,
          }),
        ),
      }),
    });
    const changes = validReviewChanges(state, candidates, result.suggestions),
      undo = [];
    for (const change of changes) {
      const collection = state.extraTransactions.some((t) => t.id === change.id)
          ? "extraTransactions"
          : "transactions",
        t = state[collection].find((t) => t.id === change.id);
      undo.push(entityUndo(collection, t.id, t));
      undo.at(-1).before.aiCheckedFingerprint = reviewFingerprint(t);
      Object.assign(t, {
        group: change.group,
        subcategory: change.subcategory,
        category: change.subcategory,
        aiCategoryReason: change.reason,
        aiCategorizedAt: new Date().toISOString(),
      });
    }
    for (const before of candidates) {
      const t = [...state.extraTransactions, ...state.transactions].find(
        (t) => t.id === before.id,
      );
      if (
        t &&
        !t.editedAt &&
        (reviewFingerprint(t) === reviewFingerprint(before) ||
          changes.some((x) => x.id === t.id))
      )
        t.aiCheckedFingerprint = reviewFingerprint(t);
    }
    state.aiReview = {
      at: new Date().toISOString(),
      checked: candidates.length,
      applied: changes.length,
      notes: result.notes || [],
    };
    if (ui.aiStatus) ui.aiStatus.usd = result.usd;
    audit(
      "KI-Prüfung: " + changes.length + " Kategoriezuordnungen angepasst",
      undo.length ? { type: "compound", ops: undo } : null,
    );
    toast(
      candidates.length +
        " Buchungen geprüft · " +
        changes.length +
        " sichere Zuordnungen übernommen.",
    );
  } catch (err) {
    toast(err.message, true);
  } finally {
    ui.aiReviewBusy = false;
    render();
  }
}
async function refreshAction(force = false) {
  if ((conflict || ui.syncStatus === "error") && !force) {
    showDialog(
      confirmDialog(
        "Gemeinsamen Stand neu laden?",
        "Dein lokaler, noch nicht bestätigter Stand bleibt zusätzlich im Browser gesichert. Lade vorher bei Bedarf eine vollständige Sicherung herunter. Anschließend wird der zuletzt auf dem Mac gespeicherte Stand geladen.",
        "force-refresh",
        "",
      ),
      "confirm",
    );
    return;
  }
  if (force) {
    await cacheRecord(
      "unsynced-" + new Date().toISOString(),
      structuredClone(state),
    );
    closeDialog();
  }
  try {
    await saveQueue;
    await loadShared();
    await refreshStatuses();
    toast("Gemeinsamer Datenstand aktualisiert.");
  } catch (err) {
    toast(err.message, true);
  }
}
async function clickAction(button) {
  const action = button.dataset.action,
    id = button.dataset.id;
  switch (action) {
    case "menu":
      ui.menuOpen = !ui.menuOpen;
      render();
      break;
    case "close-menu":
      ui.menuOpen = false;
      render();
      break;
    case "privacy":
      if (presentationMode) {
        toast("In der Fotoansicht bleiben persönliche Angaben ausgeblendet.");
        break;
      }
      ui.privacy = !ui.privacy;
      localStorage.setItem("finanzflips-privacy", String(ui.privacy));
      render();
      break;
    case "prev-month":
    case "next-month":
      ui.month = shiftMonth(ui.month, action === "prev-month" ? -1 : 1);
      localStorage.setItem("finanzflips-ui-month", ui.month);
      if (ui.route === "transactions") ui.filters.month = ui.month;
      render();
      break;
    case "refresh":
      await refreshAction();
      break;
    case "force-refresh":
      await refreshAction(true);
      break;
    case "close-modal":
      closeDialog();
      break;
    case "new-account":
      openAccount();
      break;
    case "edit-account":
      openAccount(id);
      break;
    case "new-loan":
      openLoan();
      break;
    case "edit-loan":
      openLoan(id);
      break;
    case "new-transaction":
      openTransaction();
      break;
    case "transaction-detail":
      openTransaction(id);
      break;
    case "new-recurring":
      openRecurring(null, button.dataset.direction || "expense");
      break;
    case "edit-recurring":
      openRecurring(id);
      break;
    case "contract-transactions": {
      const item = context().recurring.find((x) => x.id === id);
      closeDialog();
      navigate("transactions?month=all&recurring=" + id);
      break;
    }
    case "recurring-from-transaction": {
      const t = context().txs.find((x) => x.id === id);
      closeDialog();
      const direction = t.amount > 0 ? "income" : "expense",
        item = {
          name: t.merchant,
          merchant: t.merchant,
          matchMerchant: t.merchant,
          amount: Math.abs(t.amount),
          direction,
          accountId: t.accountId,
          group: direction === "income" ? "Einnahmen" : t.group,
          subcategory:
            direction === "income"
              ? t.group === "Einnahmen"
                ? t.subcategory
                : "Sonstige Einnahmen"
              : t.subcategory,
          nextDate: addMonths(t.bookingDate, 1),
          frequency: "monthly",
          evidenceIds: [t.id],
          status: "active",
        };
      showDialog(
        recurringDialog(context(), item, direction),
        "recurring",
        item,
      );
      break;
    }
    case "reject-recurring": {
      const item = context().recurring.find((x) => x.id === id);
      showDialog(
        confirmDialog(
          item?.source === "manual"
            ? "Eintrag entfernen?"
            : "Vorschlag verwerfen?",
          "Die Buchungen bleiben erhalten. Dieser Eintrag zählt anschließend nicht mehr zum Plan. Du kannst die Änderung im Verlauf rückgängig machen.",
          "reject-recurring-confirm",
          id,
        ),
        "confirm",
        item,
      );
      break;
    }
    case "reject-recurring-confirm": {
      const item = context().recurring.find((x) => x.id === id);
      if (!item) break;
      let undo;
      if (item.source === "manual") {
        undo = entityUndo(
          "manualRecurring",
          id,
          state.manualRecurring.find((x) => x.id === id),
        );
        replaceEntity("manualRecurring", id, null);
      } else {
        undo = {
          type: "override",
          id,
          before: structuredClone(state.recurringOverrides[id] || null),
        };
        state.recurringOverrides[id] = {
          ...state.recurringOverrides[id],
          status: "rejected",
          reviewed: true,
          snapshot: { ...item, snapshot: undefined },
        };
      }
      closeDialog();
      audit("Eintrag verworfen: " + item.name, undo);
      toast("Eintrag aus der Planung entfernt.");
      break;
    }
    case "recheck":
      invalidate();
      render();
      toast(
        "Buchungen neu geprüft. Deine manuellen Änderungen bleiben maßgeblich.",
      );
      break;
    case "new-budget":
      showDialog(budgetDialog(context()), "budget");
      break;
    case "edit-budget": {
      const item = state.budgets.find((b) => b.id === id);
      showDialog(budgetDialog(context(), item), "budget", item);
      break;
    }
    case "remove-budget": {
      const old = state.budgets.find((b) => b.id === id);
      replaceEntity("budgets", id, null);
      closeDialog();
      audit("Budget entfernt: " + old.group, entityUndo("budgets", id, old));
      break;
    }
    case "account-view":
      ui.accountView = button.dataset.value;
      render();
      break;
    case "tx-prev":
      ui.page = Math.max(1, ui.page - 1);
      render();
      document.querySelector(".table-wrap")?.scrollIntoView({ block: "start" });
      break;
    case "tx-next":
      ui.page++;
      render();
      document.querySelector(".table-wrap")?.scrollIntoView({ block: "start" });
      break;
    case "filter-group": {
      const range =
        ui.route === "analytics"
          ? "&from=" +
            shiftMonth(ui.month, -Number(ui.analytics.range) + 1) +
            "&to=" +
            ui.month
          : "";
      navigate(
        "transactions?month=" +
          (range ? "all" : ui.month) +
          "&group=" +
          encodeURIComponent(button.dataset.group) +
          range +
          (ui.route === "analytics" && ui.analytics.account
            ? "&account=" + encodeURIComponent(ui.analytics.account)
            : ""),
      );
      break;
    }
    case "chart-month":
      ui.month = button.dataset.month;
      localStorage.setItem("finanzflips-ui-month", ui.month);
      navigate(
        "transactions?month=" +
          ui.month +
          (ui.route === "analytics" && ui.analytics.account
            ? "&account=" + encodeURIComponent(ui.analytics.account)
            : "") +
          (ui.route === "analytics" && ui.analytics.group
            ? "&group=" + encodeURIComponent(ui.analytics.group)
            : ""),
      );
      break;
    case "reset-filters":
      ui.filters = {
        q: "",
        month: ui.accountId ? "all" : ui.month,
        account: "",
        group: "",
        direction: "",
        sort: "newest",
        recurring: "",
      };
      ui.page = 1;
      render();
      break;
    case "reset-analytics":
      ui.analytics = { chart: "cashflow", range: 6, account: "", group: "" };
      render();
      break;
    case "export-backup":
      exportBackup();
      break;
    case "export-csv":
      exportTransactions();
      break;
    case "import":
      if (!state.accounts.length) {
        openAccount();
        toast("Lege zuerst das Konto für deinen Import an.");
      } else document.getElementById("import-file").click();
      break;
    case "restore":
      document.getElementById("restore-file").click();
      break;
    case "undo":
      undoLast();
      break;
    case "print":
      window.print();
      break;
    case "chat-prompt": {
      const input = document.getElementById("chat-input");
      if (input) {
        input.value = button.dataset.prompt;
        input.focus();
      }
      break;
    }
    case "remove-key":
      showDialog(
        confirmDialog(
          "API-Schlüssel entfernen?",
          "Die lokale KI-Verbindung wird deaktiviert. Deine Finanzdaten bleiben erhalten.",
          "remove-key-confirm",
          "",
        ),
        "confirm",
      );
      break;
    case "remove-key-confirm":
      await api("/api/ai/settings", { method: "DELETE" });
      closeDialog();
      await refreshStatuses();
      toast("API-Schlüssel lokal entfernt.");
      break;
    case "ai-test": {
      const result = await api("/api/ai/test", { method: "POST", body: "{}" });
      toast(result.message);
      await refreshStatuses();
      break;
    }
    case "ai-review":
      await reviewWithAI();
      break;
    case "bank-refresh":
      await refreshStatuses();
      toast("Einrichtungsstatus geprüft.");
      break;
    case "bank-test":
      await testBank();
      break;
    case "load-banks":
      await loadBanks();
      break;
    case "connect-bank": {
      button.disabled = true;
      try {
        const result = await api("/api/enable/connect", {
          method: "POST",
          body: JSON.stringify({
            bank: button.dataset.bank,
            country: button.dataset.country,
          }),
        });
        const url = new URL(result.url);
        if (url.protocol !== "https:")
          throw Error("Die Bank hat keine sichere Anmeldeadresse geliefert.");
        location.assign(url.href);
      } finally {
        button.disabled = false;
      }
      break;
    }
    case "sync-bank":
      await syncBank();
      break;
    case "forecast-detail":
      showDialog(forecastDialog(context()), "forecast");
      break;
    case "fints-cancel":
      clearInterval(fintsPoll);
      if (ui.fintsSession)
        await api("/api/fints/cancel", {
          method: "POST",
          body: JSON.stringify({ id: ui.fintsSession }),
        }).catch(() => {});
      ui.fintsSession = null;
      ui.fintsEvent = null;
      sessionStorage.removeItem("finanzflips-fints-session");
      await refreshStatuses();
      render();
      break;
    case "bank-duplicates":
      showDialog(
        duplicateDialog(context(), Number(button.dataset.page) || 0),
        "duplicates",
      );
      break;
    case "restore-bank-duplicate": {
      const row = state.extraTransactions.find((t) => t.id === id);
      if (!row?.bankDuplicateOf) break;
      const before = structuredClone(row);
      delete row.bankDuplicateOf;
      delete row.bankDuplicateReason;
      row.keepBankDuplicate = true;
      closeDialog();
      audit(
        "Dubletten-Zuordnung manuell aufgehoben",
        entityUndo("extraTransactions", id, before),
      );
      break;
    }
    case "select-bank-logo": {
      const bank = BANKS.find((b) => b.id === id),
        form = modal.querySelector('[data-form="loan"]');
      if (!bank || !form) break;
      form.elements.bankLogoId.value = bank.id;
      form.elements.bankName.value = bank.name;
      if (!form.elements.name.value)
        form.elements.name.value = bank.name + " Kredit";
      form.querySelectorAll(".logo-choice").forEach((el) => {
        const selected = el.dataset.id === id;
        el.classList.toggle("selected", selected);
        el.setAttribute("aria-pressed", String(selected));
      });
      document.getElementById("bank-logo-selected").textContent =
        "Ausgewählt: " + bank.name;
      const summary = document.getElementById("bank-picker-summary");
      if (summary) summary.textContent = bank.name;
      form.querySelector(".bank-picker-details")?.removeAttribute("open");
      form.elements.name.focus();
      const candidate = context().recurring.find(
        (x) =>
          x.direction === "expense" &&
          x.subcategory === "Kreditrate" &&
          (norm(x.name).includes(norm(bank.name).replace(/ bank/g, "")) ||
            norm(bank.name).includes(norm(x.name))),
      );
      if (candidate) {
        form.elements.linkRecurringId.value = candidate.id;
        if (!form.elements.monthlyPayment.value)
          form.elements.monthlyPayment.value = candidate.amount;
        if (candidate.nextDate > form.elements.balanceDate.value)
          form.elements.nextDueDate.value = candidate.nextDate;
      }
      updateLoanPreview();
      break;
    }
    case "extra-payment": {
      const l = state.loans.find((x) => x.id === id);
      showDialog(extraPaymentDialog(context(), l), "extra-payment", l);
      break;
    }
    case "remove-extra": {
      const l = state.loans.find((x) => x.id === id),
        old = structuredClone(l);
      l.extraPayments = l.extraPayments.filter(
        (x) => x.id !== button.dataset.extra,
      );
      recordSnapshot();
      audit("Sondertilgung entfernt: " + l.name, entityUndo("loans", id, old));
      break;
    }
    case "loan-all":
      ui.loanAll = !ui.loanAll;
      render();
      break;
    case "export-loan": {
      const l = state.loans.find((x) => x.id === id),
        plan = loanSchedule(l);
      download(
        "FinanzFlips-Tilgungsplan-" + today() + ".csv",
        csv([
          [
            "Rate",
            "Datum",
            "Zahlung",
            "Zinsen",
            "Tilgung",
            "Sondertilgung",
            "Restschuld",
          ],
          ...plan.rows.map((r) => [
            r.number,
            r.date,
            r.payment,
            r.interest,
            r.principal,
            r.extra,
            r.balance,
          ]),
        ]),
        "text/csv;charset=utf-8",
      );
      toast("Tilgungsplan exportiert.");
      break;
    }
  }
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  event.preventDefault();
  Promise.resolve(clickAction(button)).catch((err) =>
    toast(err.message || "Die Aktion konnte nicht abgeschlossen werden.", true),
  );
});
document.addEventListener("keydown", (event) => {
  const row = event.target.closest('tr[role="button"]');
  if (row && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    row.click();
  }
});
modal.addEventListener("close", () => {
  modalType = "";
  modalItem = null;
});
modal.addEventListener("click", (event) => {
  if (event.target === modal) {
    const r = modal.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      closeDialog();
  }
});
let searchTimer;
function applyFilter(element) {
  const key = element.dataset.filter,
    value = element.value,
    focus = element.id,
    selection =
      element.selectionStart !== undefined
        ? [element.selectionStart, element.selectionEnd]
        : null;
  switch (key) {
    case "global-month":
      ui.month = value;
      localStorage.setItem("finanzflips-ui-month", value);
      if (ui.route === "transactions") ui.filters.month = value;
      break;
    case "q":
      ui.filters.q = value;
      ui.page = 1;
      break;
    case "tx-month":
      ui.filters.month = value;
      ui.filters.rangeFrom = "";
      ui.filters.rangeTo = "";
      ui.page = 1;
      break;
    case "account":
      ui.filters.account = value;
      ui.page = 1;
      break;
    case "group":
      ui.filters.group = value;
      ui.page = 1;
      break;
    case "direction":
      ui.filters.direction = value;
      ui.page = 1;
      break;
    case "sort":
      ui.filters.sort = value;
      ui.page = 1;
      break;
    case "recurring-q":
      ui.recurringQuery = value;
      break;
    case "recurring-status":
      ui.recurringFilter = value;
      break;
    case "recurring-group":
      ui.recurringGroup = value;
      break;
    case "analytics-chart":
      ui.analytics.chart = value;
      break;
    case "analytics-range":
      ui.analytics.range = Number(value);
      break;
    case "analytics-account":
      ui.analytics.account = value;
      break;
    case "analytics-group":
      ui.analytics.group = value;
      break;
    case "bank-country":
      ui.bankCountry = value;
      ui.banks = [];
      break;
    case "bank-search":
      ui.bankQuery = value;
      break;
  }
  render({ focus, selection });
}
document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.matches("input[data-filter]")) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => applyFilter(el), 180);
  }
  if (el.dataset.dialogFilter === "bank-logo-search") {
    const query = norm(el.value);
    document
      .querySelectorAll("#bank-logo-options .logo-choice")
      .forEach(
        (button) =>
          (button.hidden = !norm(button.dataset.bankName).includes(query)),
      );
  }
  if (
    el.closest('[data-form="loan"]') &&
    el.dataset.dialogFilter !== "bank-logo-search"
  )
    updateLoanPreview();
  if (
    el.closest('[data-form="recurring"]') &&
    ["amount", "frequency"].includes(el.name)
  ) {
    const form = el.form,
      amount = Number(form.elements.amount.value) || 0,
      frequency = form.elements.frequency.value;
    form.querySelector("#recurring-preview").innerHTML =
      money(monthlyEquivalent({ amount, frequency }), ui.privacy) +
      " pro Monat in deiner Planung";
  }
});
document.addEventListener("change", (event) => {
  const el = event.target;
  if (el.dataset.setting === "ai-automation") {
    state.aiAutomationEnabled = el.checked;
    audit(
      "Automatische KI-Zuordnungen " +
        (el.checked ? "eingeschaltet" : "ausgeschaltet"),
      null,
    );
  }
  if (el.matches("select[data-filter]")) applyFilter(el);
  if (el.dataset.dialogFilter === "group") {
    const form = el.form,
      current = form.elements.subcategory.value,
      group = el.value,
      sub = (GROUPS[group]?.sub || []).includes(current)
        ? current
        : GROUPS[group]?.sub?.[0];
    form.elements.subcategory.innerHTML = subOptions(group, sub);
  }
  if (el.dataset.dialogFilter === "loan-mode") {
    const mode = el.value;
    el.form
      .querySelectorAll("[data-loan-mode]")
      .forEach((field) =>
        field.classList.toggle("hidden", field.dataset.loanMode !== mode),
      );
    updateLoanPreview();
  }
});
document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const error = form.querySelector("[data-form-error]");
  if (error) error.hidden = true;
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    switch (form.dataset.form) {
      case "recurring":
        saveRecurring(form);
        break;
      case "account":
        saveAccount(form);
        break;
      case "transaction":
        saveTransaction(form);
        break;
      case "loan":
        saveLoan(form);
        break;
      case "budget":
        saveBudget(form);
        break;
      case "import-confirm":
        commitImport(form);
        break;
      case "restore-confirm":
        await restoreConfirmed(form);
        break;
      case "extra-payment": {
        const v = formValues(form),
          loan = state.loans.find((l) => l.id === form.dataset.id),
          old = structuredClone(loan),
          date = isoDate(v.date);
        if (!date || date <= loan.balanceDate)
          throw Error(
            "Die Sondertilgung muss nach dem bestätigten Restschuldstand liegen.",
          );
        loan.extraPayments ||= [];
        loan.extraPayments.push({
          id: browserUUID(),
          amount: number(v.amount, "Sondertilgung", 0.01, 1e9),
          date,
          note: v.note || "",
        });
        loan.extraPayments.sort((a, b) => a.date.localeCompare(b.date));
        recordSnapshot();
        closeDialog();
        audit(
          "Sondertilgung erfasst: " + loan.name,
          entityUndo("loans", loan.id, old),
        );
        toast("Sondertilgung im Plan berücksichtigt.");
        break;
      }
      case "ai-settings": {
        const key = form.elements.key.value.trim();
        await api("/api/ai/settings", {
          method: "POST",
          body: JSON.stringify({ api_key: key }),
        });
        form.elements.key.value = "";
        toast("API-Schlüssel lokal gespeichert.");
        await refreshStatuses();
        break;
      }
      case "bank-settings":
        await saveBankSettings(form);
        break;
      case "bank-schedule": {
        ui.bankStatus = await api("/api/enable/schedule", {
          method: "POST",
          body: JSON.stringify({ mode: form.elements.mode.value }),
        });
        render();
        toast("Automatische Bankabrufe gespeichert.");
        break;
      }
      case "fints-settings":
        ui.fintsStatus = await api("/api/fints/settings", {
          method: "POST",
          body: JSON.stringify({ productId: form.elements.productId.value }),
        });
        render();
        break;
      case "fints-start": {
        const username = form.elements.username.value,
          pin = form.elements.pin.value;
        form.elements.pin.value = "";
        const result = await api("/api/fints/start", {
          method: "POST",
          body: JSON.stringify({ username, pin }),
        });
        ui.fintsSession = result.id;
        sessionStorage.setItem("finanzflips-fints-session", result.id);
        ui.fintsEvent = { type: "waiting" };
        render();
        clearInterval(fintsPoll);
        fintsPoll = setInterval(pollFinTS, 1500);
        await pollFinTS();
        break;
      }
      case "fints-respond": {
        const data = new FormData(form),
          payload = {
            id: ui.fintsSession,
            choice: data.get("choice"),
            accounts: data.getAll("accounts"),
            tan: data.get("tan"),
          };
        if (form.elements.tan) form.elements.tan.value = "";
        await api("/api/fints/respond", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        ui.fintsEvent = { type: "waiting" };
        render();
        await pollFinTS();
        break;
      }
      case "forecast-settings": {
        const v = formValues(form),
          previous = structuredClone(state.settings || {});
        if (!state.accounts.some((a) => a.id === v.accountId))
          throw Error("Bitte ein Konto auswählen.");
        state.settings = {
          ...state.settings,
          forecastAccountId: v.accountId,
          forecastVariableDaily:
            v.variableDaily.trim() === ""
              ? null
              : number(v.variableDaily, "Tagesbudget", 0, 100000),
        };
        closeDialog();
        audit("Kontoprognose angepasst", {
          type: "forecast-settings",
          before: previous,
        });
        showDialog(forecastDialog(context()), "forecast");
        break;
      }
      case "chat": {
        const text = form.elements.message.value;
        form.elements.message.value = "";
        await askAgent(text);
        break;
      }
    }
  } catch (err) {
    formError(
      form,
      err.message || "Die Angaben konnten nicht gespeichert werden.",
    );
  } finally {
    if (submit?.isConnected) submit.disabled = false;
  }
});
document
  .getElementById("import-file")
  .addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 20e6)
        throw Error("Bitte eine Exportdatei bis 20 MB verwenden.");
      let parsed;
      if (/\.xlsx$/i.test(file.name)) {
        toast("Excel-Export wird lokal geprüft …");
        const encoded = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        parsed = await api("/api/import/xlsx/preview", {
          method: "POST",
          body: JSON.stringify({ file: encoded }),
        });
      } else parsed = parseCSV(await file.text());
      if (!parsed.transactions.length)
        throw Error("Keine gültigen Buchungen in der Datei gefunden.");
      importPreview = {
        filename: file.name,
        rows: parsed.transactions,
        errors: parsed.errors,
        defaultAccountId: ui.accountId || state.accounts[0]?.id,
      };
      showDialog(importDialog(context(), importPreview), "import");
    } catch (err) {
      toast(err.message, true);
    }
    event.target.value = "";
  });

document
  .getElementById("restore-file")
  .addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 30e6) throw Error("Diese Sicherungsdatei ist zu groß.");
      const parsed = JSON.parse(await file.text()),
        raw = parsed.state || parsed;
      if (
        !Array.isArray(raw.accounts) ||
        !Array.isArray(raw.budgets) ||
        !Array.isArray(raw.extraTransactions)
      )
        throw Error("Das ist keine vollständige FinanzFlips-Sicherung.");
      if (
        raw.accounts.some(
          (a) =>
            typeof a.name !== "string" || !Number.isFinite(Number(a.balance)),
        ) ||
        [...raw.extraTransactions, ...(raw.transactions || [])].some(
          (t) =>
            typeof t.merchant !== "string" ||
            !Number.isFinite(Number(t.amount)),
        )
      )
        throw Error("Die Sicherung enthält ungültige Konten oder Buchungen.");
      restorePreview = { filename: file.name, state: prepareState(raw) };
      showDialog(restoreDialog(context(), restorePreview), "restore");
    } catch (err) {
      toast(
        err.message || "Sicherungsdatei konnte nicht gelesen werden.",
        true,
      );
    }
    event.target.value = "";
  });
async function boot() {
  try {
    await loadShared({ initial: true });
    await refreshStatuses();
    ui.fintsSession = sessionStorage.getItem("finanzflips-fints-session");
    if (ui.fintsSession) {
      fintsPoll = setInterval(pollFinTS, 1500);
      pollFinTS();
    }
    if (new URLSearchParams(location.search).has("connected")) {
      history.replaceState(null, "", location.pathname + "#/bank");
      readRoute();
      render();
      toast(
        "Bankfreigabe zurückgegeben. Du kannst jetzt Konten und Buchungen abrufen.",
      );
    }
  } catch (err) {
    const local = await readCached();
    if (local?.extraTransactions?.length) {
      state = prepareState(local);
      invalidate();
      ready = true;
      ui.syncStatus = "error";
      ui.syncError =
        "Lokaler FinanzFlips-Server nicht erreichbar. Du siehst die zuletzt in diesem Browser gesicherte Kopie.";
      root.hidden = false;
      document.getElementById("startup").hidden = true;
      readRoute();
      render();
    } else
      document.getElementById("startup").innerHTML =
        `<div class="startup-brand"><span class="brand-mark">F</span>FinanzFlips</div><h2>Dein lokaler Finanzraum ist gerade nicht erreichbar.</h2><p class="muted">Starte den FinanzFlips-Server auf diesem Mac und lade die Seite neu.</p><button class="button primary" data-action="refresh">Noch einmal versuchen</button>`;
  }
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("./sw.js").catch(() => {});
}
boot();
