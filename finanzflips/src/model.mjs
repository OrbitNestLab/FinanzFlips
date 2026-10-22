// Shared financial calculations. Dates are calendar dates in Europe/Berlin;
// amounts are accumulated as integer cents to avoid rounding drift.
export const SCHEMA_VERSION = 2;
export const GROUPS = {
  Wohnen: {
    icon: "home",
    color: "#86c9b1",
    sub: [
      "Miete",
      "Strom",
      "Gas",
      "Wasser",
      "Nebenkosten",
      "Internet & Telefon",
      "Rundfunkbeitrag",
      "Hausratversicherung",
      "Einrichtung",
      "Renovierung",
      "Sonstiges Wohnen",
    ],
  },
  Auto: {
    icon: "car",
    color: "#96b9ef",
    sub: [
      "Kfz-Versicherung",
      "Kfz-Steuer",
      "Tanken",
      "Parken",
      "Wartung & Werkstatt",
      "Automobilclub",
      "Leasing",
      "Waschanlage",
      "Sonstiges Auto",
    ],
  },
  Versicherungen: {
    icon: "shield",
    color: "#c3acf0",
    sub: [
      "Haftpflicht",
      "Rechtsschutz",
      "Krankenversicherung",
      "Lebensversicherung",
      "Sonstige Versicherung",
    ],
  },
  "Abos & Digitales": {
    icon: "layers",
    color: "#debc82",
    sub: [
      "Streaming",
      "Musik & Podcasts",
      "Mobilfunk",
      "Cloud",
      "Software & KI",
      "Prime",
      "Gaming",
      "Mitgliedschaften",
      "Sonstige Abos",
    ],
  },
  "Familie & Kinder": {
    icon: "heart",
    color: "#e7a3b9",
    sub: ["Kinderbetreuung", "Essensgeld", "Taschengeld", "Sonstiges Kinder"],
  },
  "Kredite & Finanzen": {
    icon: "wallet",
    color: "#a7b4cc",
    sub: ["Kreditrate", "Bankgebühren", "Steuern", "Sonstige Finanzausgaben"],
  },
  "Lebensmittel & Alltag": {
    icon: "basket",
    color: "#aed19d",
    sub: [
      "Lebensmittel",
      "Bäckerei",
      "Drogerie",
      "Bargeld",
      "Porto",
      "Sonstiges Alltag",
    ],
  },
  "Essen & Ausgehen": {
    icon: "coffee",
    color: "#d7a286",
    sub: ["Restaurants", "Lieferservice", "Trinkgeld"],
  },
  "Freizeit & Lifestyle": {
    icon: "spark",
    color: "#a5a2df",
    sub: [
      "Freizeit",
      "Sport",
      "Shopping",
      "Bekleidung",
      "Urlaub",
      "Geschenke",
      "Bildung",
      "Sonstiges Lifestyle",
    ],
  },
  Mobilität: {
    icon: "train",
    color: "#91c6d7",
    sub: ["Bus & Bahn", "Fahrrad", "Taxi", "Sonstige Mobilität"],
  },
  Gesundheit: {
    icon: "plus",
    color: "#d99ba2",
    sub: ["Apotheke", "Behandlung", "Sonstige Gesundheit"],
  },
  Haustiere: {
    icon: "paw",
    color: "#b1be8c",
    sub: ["Futter & Tierbedarf", "Tierarzt", "Tierhaftpflicht", "Hundesteuer"],
  },
  Vermögensaufbau: {
    icon: "trend",
    color: "#81bbb7",
    sub: ["Sparen", "Kapitalanlage", "Bausparvertrag"],
  },
  Einnahmen: {
    icon: "income",
    color: "#9cdeb4",
    sub: [
      "Gehalt",
      "Kindergeld",
      "Elterngeld",
      "Rente",
      "Mieteinnahmen",
      "Kapitalerträge",
      "Erstattung",
      "Sonstige Einnahmen",
    ],
  },
  Umbuchungen: {
    icon: "transfer",
    color: "#8e9eaa",
    sub: ["Eigene Konten", "Kreditkartenabrechnung", "Haushaltsgeld"],
  },
  Sonstiges: {
    icon: "more",
    color: "#a1a9a5",
    sub: ["Nicht zugeordnet", "Sonstige Ausgaben"],
  },
};
export const FREQUENCIES = {
  weekly: { label: "Wöchentlich", months: 12 / 52, days: 7 },
  fortnightly: { label: "Alle 2 Wochen", months: 12 / 26, days: 14 },
  monthly: { label: "Monatlich", months: 1, days: 30.44 },
  bimonthly: { label: "Alle 2 Monate", months: 2, days: 60.88 },
  quarterly: { label: "Vierteljährlich", months: 3, days: 91.31 },
  semiannual: { label: "Halbjährlich", months: 6, days: 182.63 },
  annual: { label: "Jährlich", months: 12, days: 365.25 },
};
export const norm = (s) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const cents = (n) => Math.round(Number(n || 0) * 100);
export const sum = (values) => values.reduce((a, b) => a + cents(b), 0) / 100;
export const median = (values) => {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length
    ? (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2
    : 0;
};
export function hash(s) {
  let n = 2166136261;
  for (const c of String(s)) {
    n ^= c.charCodeAt(0);
    n = Math.imul(n, 16777619);
  }
  return (n >>> 0).toString(36);
}
export function isoDate(value) {
  const s = String(value ?? "").trim();
  let y, m, d;
  const a = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/),
    b = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/);
  if (a) [, y, m, d] = a;
  else if (b) {
    [, d, m, y] = b;
    if (y.length === 2) y = "20" + y;
  } else return "";
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  return dt.getUTCFullYear() === +y &&
    dt.getUTCMonth() === +m - 1 &&
    dt.getUTCDate() === +d
    ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    : "";
}
export function today() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export const monthIndex = (month) =>
  Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
export function monthAt(index) {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}
export const shiftMonth = (month, n) => monthAt(monthIndex(month) + n);
export function addMonths(date, n, day) {
  const d = isoDate(date);
  if (!d) return "";
  const base = new Date(d + "T12:00:00Z");
  const target = base.getUTCMonth() + n;
  const end = new Date(
    Date.UTC(base.getUTCFullYear(), target + 1, 0),
  ).getUTCDate();
  base.setUTCDate(1);
  base.setUTCMonth(target);
  base.setUTCDate(Math.min(day || Number(d.slice(8)), end));
  return base.toISOString().slice(0, 10);
}
export const dayDiff = (a, b) =>
  (Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000;
export function advanceDate(date, frequency, day) {
  const f = FREQUENCIES[frequency] || FREQUENCIES.monthly;
  if (f.months >= 1) return addMonths(date, f.months, day);
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + f.days);
  return d.toISOString().slice(0, 10);
}
export const ibanKey = (s) =>
  String(s ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
export function maskedIdentifier(value) {
  const s = ibanKey(value);
  return s
    ? /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)
      ? s.slice(0, 2) + "•• •••• " + s.slice(-4)
      : "•••• " + s.slice(-4)
    : "Keine IBAN hinterlegt";
}
export function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  let s = String(value ?? "")
    .replace(/[\s€$]/g, "")
    .trim();
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const categoryRules = [
  ["Wohnen", "Miete", /^(miete|mietzahlung)$/],
  ["Wohnen", "Strom", /^strom$/],
  ["Wohnen", "Gas", /^gas$/],
  ["Wohnen", "Wasser", /wasser/],
  ["Wohnen", "Nebenkosten", /nebenkosten/],
  ["Wohnen", "Internet & Telefon", /internet|festnetz/],
  ["Wohnen", "Rundfunkbeitrag", /rundfunk|gez/],
  ["Wohnen", "Hausratversicherung", /hausrat/],
  ["Wohnen", "Einrichtung", /einrichtung/],
  ["Wohnen", "Renovierung", /renovier|bauen/],
  ["Wohnen", "Sonstiges Wohnen", /wohnen/],
  ["Auto", "Kfz-Versicherung", /kfz versicherung|autoversicherung/],
  ["Auto", "Kfz-Steuer", /kfz steuer/],
  ["Auto", "Tanken", /tanken/],
  ["Auto", "Parken", /parken/],
  ["Auto", "Wartung & Werkstatt", /werkstatt|wartung/],
  ["Auto", "Automobilclub", /automobilclub|adac/],
  ["Auto", "Leasing", /leasing/],
  ["Auto", "Waschanlage", /waschanlage/],
  ["Auto", "Sonstiges Auto", /^auto$/],
  ["Versicherungen", "Haftpflicht", /^haftpflicht/],
  ["Versicherungen", "Rechtsschutz", /rechtsschutz/],
  [
    "Versicherungen",
    "Krankenversicherung",
    /krankenversicherung|brillenversicherung/,
  ],
  ["Versicherungen", "Lebensversicherung", /lebensversicherung/],
  ["Versicherungen", "Sonstige Versicherung", /sachversicherung|versicherung/],
  ["Abos & Digitales", "Streaming", /serien|filme|streaming/],
  ["Abos & Digitales", "Musik & Podcasts", /musik|podcast/],
  ["Abos & Digitales", "Mobilfunk", /mobilfunk/],
  ["Abos & Digitales", "Cloud", /cloud/],
  ["Abos & Digitales", "Software & KI", /software|ki abo/],
  ["Abos & Digitales", "Prime", /prime/],
  ["Abos & Digitales", "Gaming", /gaming|in app/],
  ["Abos & Digitales", "Mitgliedschaften", /mitgliedschaft/],
  ["Familie & Kinder", "Kinderbetreuung", /kinderbetreuung/],
  ["Familie & Kinder", "Essensgeld", /essensgeld/],
  ["Familie & Kinder", "Taschengeld", /taschengeld/],
  ["Familie & Kinder", "Sonstiges Kinder", /kinder|^emma$/],
  ["Kredite & Finanzen", "Kreditrate", /^kredit(rate)?$/],
  ["Kredite & Finanzen", "Bankgebühren", /bankgebu(?:e)?hr/],
  ["Kredite & Finanzen", "Steuern", /^steuern$/],
  ["Kredite & Finanzen", "Sonstige Finanzausgaben", /finanzausgaben/],
  ["Lebensmittel & Alltag", "Lebensmittel", /lebensmittel/],
  ["Lebensmittel & Alltag", "Bäckerei", /backer|baecker/],
  ["Lebensmittel & Alltag", "Drogerie", /drogerie/],
  ["Lebensmittel & Alltag", "Bargeld", /bargeld/],
  ["Lebensmittel & Alltag", "Porto", /porto/],
  ["Essen & Ausgehen", "Restaurants", /restaurant/],
  ["Essen & Ausgehen", "Lieferservice", /lieferservice/],
  ["Essen & Ausgehen", "Trinkgeld", /trinkgeld/],
  ["Freizeit & Lifestyle", "Sport", /sport|tanzen/],
  ["Freizeit & Lifestyle", "Shopping", /shopping|elektrohandel/],
  ["Freizeit & Lifestyle", "Bekleidung", /bekleidung/],
  ["Freizeit & Lifestyle", "Urlaub", /urlaub/],
  ["Freizeit & Lifestyle", "Geschenke", /geschenk/],
  ["Freizeit & Lifestyle", "Bildung", /bildung|bucher|zeitungen/],
  [
    "Freizeit & Lifestyle",
    "Freizeit",
    /freizeit|angelsachen|basteln|kino|veranstalt/,
  ],
  ["Freizeit & Lifestyle", "Sonstiges Lifestyle", /lifestyle|rauchen|friseur/],
  ["Mobilität", "Bus & Bahn", /bus|bahn/],
  ["Mobilität", "Fahrrad", /fahrrad/],
  ["Mobilität", "Taxi", /taxi/],
  ["Gesundheit", "Apotheke", /apotheke/],
  ["Gesundheit", "Behandlung", /arztliche behandlung|aerztliche behandlung/],
  ["Gesundheit", "Sonstige Gesundheit", /gesundheit/],
  ["Haustiere", "Futter & Tierbedarf", /futter|tierbedarf/],
  ["Haustiere", "Tierarzt", /tierarzt|tieraerzt/],
  ["Haustiere", "Tierhaftpflicht", /tierhaftpflicht/],
  ["Haustiere", "Hundesteuer", /hundesteuer/],
  ["Vermögensaufbau", "Sparen", /^sparen$/],
  ["Vermögensaufbau", "Kapitalanlage", /kapitalanlage/],
  ["Vermögensaufbau", "Bausparvertrag", /bauspar/],
  ["Einnahmen", "Gehalt", /lohn|gehalt/],
  ["Einnahmen", "Kindergeld", /kindergeld/],
  ["Einnahmen", "Elterngeld", /elterngeld/],
  ["Einnahmen", "Rente", /rente|pension/],
  ["Einnahmen", "Mieteinnahmen", /mieteinnahmen/],
  ["Einnahmen", "Kapitalerträge", /kapitalertrag|kapitalertraeg/],
  ["Einnahmen", "Erstattung", /erstattung/],
  ["Einnahmen", "Sonstige Einnahmen", /einnahmen/],
  [
    "Umbuchungen",
    "Kreditkartenabrechnung",
    /kreditkartenabrechnung|kartenabrechnung/,
  ],
  ["Umbuchungen", "Haushaltsgeld", /haushaltsgeld/],
  ["Umbuchungen", "Eigene Konten", /umbuchung|ubertrag/],
];
export function classifyCategory(category, merchant = "", amount = 0) {
  const c = norm(category),
    m = norm(merchant);
  if (
    amount < 0 &&
    /bundeskasse|hauptzollamt/.test(m) &&
    /^(auto|kfz steuer|steuern)$/.test(c)
  )
    return { group: "Auto", subcategory: "Kfz-Steuer" };
  if (amount > 0) {
    const income = [
      ["Gehalt", /lohn|gehalt|salary/],
      ["Kindergeld", /kindergeld/],
      ["Elterngeld", /elterngeld/],
      ["Rente", /rente|pension/],
      ["Mieteinnahmen", /mieteinnahmen/],
      ["Kapitalerträge", /kapitalertr/],
    ];
    for (const [subcategory, re] of income)
      if (re.test(c)) return { group: "Einnahmen", subcategory };
  }
  for (const [group, sub, re] of categoryRules)
    if (re.test(c)) {
      if (group === "Versicherungen" && /tierhaftpflicht/.test(c))
        return { group: "Haustiere", subcategory: "Tierhaftpflicht" };
      if (group === "Gesundheit" && /tierarzt|tieraerzt/.test(c))
        return { group: "Haustiere", subcategory: "Tierarzt" };
      if (m === "openai")
        return { group: "Abos & Digitales", subcategory: "Software & KI" };
      if (/adac/.test(m))
        return { group: "Auto", subcategory: "Automobilclub" };
      return { group, subcategory: sub };
    }
  if (amount > 0)
    return { group: "Einnahmen", subcategory: "Sonstige Einnahmen" };
  if (/netflix|disney|wow tv|paramount/.test(m))
    return { group: "Abos & Digitales", subcategory: "Streaming" };
  if (/spotify|apple music/.test(m))
    return { group: "Abos & Digitales", subcategory: "Musik & Podcasts" };
  if (/openai|anthropic|adobe|microsoft 365/.test(m))
    return { group: "Abos & Digitales", subcategory: "Software & KI" };
  if (/adac/.test(m)) return { group: "Auto", subcategory: "Automobilclub" };
  return {
    group: "Sonstiges",
    subcategory:
      c && c !== "nicht zugeordnet" ? String(category) : "Nicht zugeordnet",
  };
}
export function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    accounts: [],
    loans: [],
    budgets: [],
    transactions: [],
    extraTransactions: [],
    recurringOverrides: {},
    manualRecurring: [],
    auditLog: [],
    categoryRules: [],
    balanceHistory: [],
    settings: {},
    month: today().slice(0, 7),
  };
}
export function migrateState(input) {
  const s = { ...emptyState(), ...structuredClone(input || {}) };
  s.settings = { ...s.settings };
  const accountIds = new Set();
  s.accounts = (s.accounts || []).map((a, i) => {
    let id = a.id || "acct_" + hash(ibanKey(a.iban) || a.name || i);
    while (accountIds.has(id)) id += "_" + i;
    accountIds.add(id);
    return {
      ...a,
      id,
      balance: Number(a.balance) || 0,
      includeInNetWorth: a.includeInNetWorth !== false,
      bankLogoId:
        a.bankLogoId ||
        (ibanKey(a.iban).slice(4, 12) === "50010517"
          ? "ing"
          : String(a.name).includes("@")
            ? "paypal"
            : /easybank/i.test(a.name)
              ? "easybank"
              : null),
      displayType:
        a.displayType ||
        (/paypal/.test(norm(a.name)) || String(a.name).includes("@")
          ? "PayPal"
          : /kreditkarte|mastercard/.test(norm(a.name))
            ? "Kreditkarte"
            : /wallet/.test(norm(a.name))
              ? "Wallet"
              : /verrechnung/.test(norm(a.name))
                ? "Verrechnungskonto"
                : "Girokonto"),
    };
  });
  const byIban = new Map(
      s.accounts.filter((a) => a.iban).map((a) => [ibanKey(a.iban), a]),
    ),
    byName = new Map(s.accounts.map((a) => [a.name, a]));
  function tx(t, i, source) {
    const a =
      s.accounts.find((a) => a.id === t.accountId) ||
      byIban.get(ibanKey(t.referenceIban)) ||
      byName.get(t.account);
    const cat = classifyCategory(t.category, t.merchant, Number(t.amount));
    return {
      ...t,
      id:
        t.id ||
        "tx_" +
          hash(
            [
              source,
              i,
              a?.id,
              t.date,
              t.amount,
              t.merchant,
              t.counterpartyIban,
            ].join("|"),
          ),
      accountId: a?.id || t.accountId || "",
      bookingDate: isoDate(t.bookingDate || t.date),
      amount: Number(t.amount) || 0,
      group: t.group || cat.group,
      subcategory: t.subcategory || cat.subcategory,
    };
  }
  s.extraTransactions = (s.extraTransactions || []).map((t, i) =>
    tx(t, i, "import"),
  );
  s.transactions = (s.transactions || []).map((t, i) => tx(t, i, "manual"));
  s.loans = (s.loans || []).map((a, i) => ({
    ...a,
    id: a.id || "loan_" + hash(a.name + "|" + i),
    balance: Math.abs(Number(a.balance) || 0),
  }));
  markSplitOriginals([...s.extraTransactions, ...s.transactions]);
  s.schemaVersion = SCHEMA_VERSION;
  s.recurringOverrides ||= {};
  s.manualRecurring ||= [];
  s.auditLog ||= [];
  s.balanceHistory ||= [];
  s.categoryRules ||= [];
  return s;
}
export const allTransactions = (state) =>
  [...(state.extraTransactions || []), ...(state.transactions || [])]
    .filter((t) => !t.bankDuplicateOf)
    .sort(
      (a, b) =>
        (b.bookingDate || isoDate(b.date)).localeCompare(
          a.bookingDate || isoDate(a.date),
        ) || a.id.localeCompare(b.id),
    );
export function isTransfer(t, state) {
  if (t.transferOverride === "include") return false;
  if (t.transferOverride === "transfer" || t.sourceTransfer === true)
    return true;
  const counterparty = ibanKey(t.counterpartyIban);
  if (
    counterparty &&
    (state.accounts || []).some((a) => ibanKey(a.iban) === counterparty)
  )
    return true;
  if (
    t.group === "Umbuchungen" ||
    /umbuch|ubertrag|eigenuberweisung|kontoausgleich|kreditkartenabrechnung|kartenabrechnung/.test(
      norm(t.category + " " + t.merchant),
    )
  )
    return true;
  return false;
}
export function cashflow(state, month, transactions = allTransactions(state)) {
  const rows = transactions.filter(
    (t) =>
      !t.splitExcluded &&
      (!month || t.bookingDate.startsWith(month)) &&
      !isTransfer(t, state),
  );
  const income = sum(rows.filter((t) => t.amount > 0).map((t) => t.amount)),
    expenses = -sum(rows.filter((t) => t.amount < 0).map((t) => t.amount));
  const groups = {};
  for (const t of rows.filter((t) => t.amount < 0)) {
    const g = t.group || "Sonstiges";
    groups[g] = sum([groups[g] || 0, -t.amount]);
  }
  return { income, expenses, net: sum([income, -expenses]), groups, rows };
}
export function datasetDate(state) {
  return (
    allTransactions(state).find((t) => t.bookingDate)?.bookingDate || today()
  );
}
export function monthlyEquivalent(item) {
  return (
    Math.round(
      (Number(item.amount || 0) / (FREQUENCIES[item.frequency]?.months || 1)) *
        100,
    ) / 100
  );
}
function nextFor(lastDate, frequency, dueDay) {
  return advanceDate(lastDate, frequency, dueDay);
}
function modalCategory(rows) {
  const count = new Map();
  for (const t of rows) {
    const k = t.group + "|" + t.subcategory;
    count.set(k, (count.get(k) || 0) + 1);
  }
  const [key] = [...count].sort((a, b) => b[1] - a[1])[0] || [
    "Sonstiges|Nicht zugeordnet",
  ];
  const [group, subcategory] = key.split("|");
  return { group, subcategory };
}
const FIXED_SUB =
  /^(Miete|Strom|Gas|Wasser|Nebenkosten|Internet & Telefon|Rundfunkbeitrag|Hausratversicherung|Kfz-Versicherung|Kfz-Steuer|Automobilclub|Leasing|Haftpflicht|Rechtsschutz|Krankenversicherung|Lebensversicherung|Sonstige Versicherung|Streaming|Musik & Podcasts|Mobilfunk|Cloud|Software & KI|Prime|Mitgliedschaften|Kinderbetreuung|Essensgeld|Kreditrate|Bankgebühren|Tierhaftpflicht|Hundesteuer)$/;
function recurringGroupKey(t) {
  return [
    t.accountId,
    t.group === "Einnahmen" && t.amount > 0 ? "in" : "out",
    norm(t.merchant)
      .replace(/\b\d{6,}\b/g, "")
      .trim(),
    t.group,
    t.subcategory,
  ].join("|");
}
export function detectRecurring(state, asOf = today()) {
  const txs = allTransactions(state),
    groups = new Map();
  for (const t of txs) {
    if (
      t.splitExcluded ||
      !t.bookingDate ||
      t.amount === 0 ||
      t.bookingDate > asOf ||
      dayDiff(asOf, t.bookingDate) > 800 ||
      isTransfer(t, state) ||
      t.group === "Vermögensaufbau"
    )
      continue;
    if (
      t.amount > 0 &&
      t.group !== "Einnahmen" &&
      !FIXED_SUB.test(t.subcategory)
    )
      continue;
    const k = recurringGroupKey(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const candidates = [];
  for (const [key, all] of groups) {
    const rows = all.toSorted((a, b) =>
      a.bookingDate.localeCompare(b.bookingDate),
    );
    const { group, subcategory } = modalCategory(rows),
      direction = group === "Einnahmen" ? "income" : "expense";
    if (direction === "expense" && !rows.some((t) => t.amount < 0)) continue;
    const salary = direction === "income" && subcategory === "Gehalt",
      benefit =
        direction === "income" &&
        ["Kindergeld", "Elterngeld", "Rente", "Mieteinnahmen"].includes(
          subcategory,
        );
    const fixed = FIXED_SUB.test(subcategory),
      monthMap = new Map();
    const hintMap = {
      wochentlich: "weekly",
      woechentlich: "weekly",
      monatlich: "monthly",
      zweimonatlich: "bimonthly",
      vierteljahrlich: "quarterly",
      vierteljaehrlich: "quarterly",
      halbjahrlich: "semiannual",
      halbjaehrlich: "semiannual",
      jahrlich: "annual",
      jaehrlich: "annual",
    };
    const hints = rows
      .filter((t) => t.sourceContract && hintMap[norm(t.contractFrequency)])
      .map((t) => hintMap[norm(t.contractFrequency)]);
    const hintFrequency =
      hints.length >= 2 &&
      hints.filter((h) => h === hints.at(-1)).length / hints.length >= 0.7
        ? hints.at(-1)
        : "";
    if (group === "Haustiere" && !fixed && !hintFrequency) continue;
    for (const t of rows) {
      const m = t.bookingDate.slice(0, 7);
      if (!monthMap.has(m)) monthMap.set(m, []);
      monthMap.get(m).push(t);
    }
    const months = [...monthMap].sort(([a], [b]) => a.localeCompare(b)),
      initialLast = rows.at(-1),
      lastMonth = initialLast.bookingDate.slice(0, 7),
      asOfMonth = asOf.slice(0, 7);
    const rawDates = [...new Set(rows.map((t) => t.bookingDate))],
      rawGaps = rawDates.slice(1).map((d, i) => dayDiff(d, rawDates[i])),
      rawGap = median(rawGaps);
    const fastCycle =
      !salary &&
      fixed &&
      rows.length >= 4 &&
      [7, 14].some(
        (days) =>
          rawGaps.filter((g) => Math.abs(g - days) <= 2).length /
            rawGaps.length >=
          0.7,
      );
    if (rows.length < 2 || (months.length < 2 && !fastCycle)) continue;
    const recentMonths = months.filter(
        ([m]) => monthIndex(lastMonth) - monthIndex(m) < 6,
      ),
      monthGaps = months
        .slice(1)
        .map(([m], i) => monthIndex(m) - monthIndex(months[i][0]));
    const typicalGap = median(monthGaps),
      monthly = !fastCycle && typicalGap <= 1.4 && recentMonths.length >= 2;
    let frequency,
      amount,
      confidence = "mittel",
      reason = "",
      evidence = rows;
    if (monthly) {
      frequency = "monthly";
      const totals = recentMonths.map(([m, a]) => ({
        month: m,
        value: Math.abs(sum(a.map((t) => t.amount))),
        rows: a,
      }));
      if (salary || benefit) {
        const complete = totals.filter((x) => x.month < asOfMonth).slice(-3),
          basis = complete.length ? complete : totals.slice(-3);
        amount = salary
          ? median(basis.map((x) => x.value))
          : totals.at(-1).value;
        const split = median(recentMonths.map(([, r]) => r.length)) > 1;
        reason = salary
          ? `Gehalt anhand der Kategorie und ${months.length} Zahlungsmonaten erkannt${split ? " · Teilzahlungen zusammengefasst" : ""}. Planbetrag: Median der letzten bis zu drei vollständigen Monate.`
          : `${subcategory} in ${months.length} Monaten erkannt. Letzter Monatsbetrag als Planung.`;
        confidence = months.length >= 3 ? "hoch" : "mittel";
      } else {
        const values = totals.map((x) => x.value),
          mid = median(values),
          deviation = mid
            ? median(values.map((v) => Math.abs(v - mid))) / mid
            : 1;
        if (!fixed && (totals.length < 3 || deviation > 0.1)) continue;
        // Variable everyday shopping is not a subscription merely because it occurs monthly.
        if (!fixed && !["Abos & Digitales", "Versicherungen"].includes(group))
          continue;
        const latest = totals.at(-1),
          previous = totals.at(-2),
          newStable =
            previous &&
            Math.abs(latest.value - previous.value) <=
              Math.max(2, latest.value * 0.08);
        if (totals.length === 2 && !newStable) continue;
        if (
          group === "Abos & Digitales" &&
          !hintFrequency &&
          !newStable &&
          deviation > 0.18
        )
          continue;
        amount = newStable
          ? latest.value
          : fixed
            ? median(values.slice(-3))
            : mid;
        confidence =
          totals.length >= 3 && (fixed || deviation < 0.06) ? "hoch" : "mittel";
        reason = `${totals.length} der letzten sechs Zahlungsmonate${fixed ? " mit passender Fixkostenkategorie" : ""}. ${newStable ? "Zuletzt wiederholter Monatsbetrag." : "Monatlicher Planbetrag aus dem jüngsten Verlauf."}`;
      }
    } else {
      const alternatives = [];
      for (const [f, info] of Object.entries(FREQUENCIES).filter(
        ([f]) => f !== "monthly",
      )) {
        for (let start = 0; start < rows.length; start++) {
          const chain = [rows[start]];
          for (let n = start + 1; n < rows.length; n++) {
            const previous = chain.at(-1),
              gap = dayDiff(rows[n].bookingDate, previous.bookingDate),
              ratio =
                Math.abs(rows[n].amount - previous.amount) /
                Math.max(1, Math.abs(previous.amount));
            if (
              Math.abs(gap - info.days) <=
                Math.max(
                  4,
                  info.days * 0.16,
                  hintFrequency === f ? Math.min(35, info.days * 0.4) : 0,
                ) &&
              ratio <= (fixed ? 0.28 : 0.12)
            )
              chain.push(rows[n]);
          }
          if (chain.length < 2 || (!fixed && chain.length < 3)) continue;
          const age = dayDiff(asOf, chain.at(-1).bookingDate),
            score =
              chain.length * 2 +
              Math.max(0, 4 - age / (info.days + 1)) +
              (hintFrequency === f ? 2 : 0);
          alternatives.push({ f, info, chain, score });
        }
      }
      const best = alternatives.sort((a, b) => b.score - a.score)[0];
      if (!best) continue;
      if (
        !fixed &&
        !["Abos & Digitales", "Versicherungen", "Haustiere"].includes(group)
      )
        continue;
      frequency = best.f;
      evidence = best.chain;
      amount = Math.abs(evidence.at(-1).amount);
      confidence = evidence.length >= 3 ? "hoch" : "mittel";
      reason = `${evidence.length} passende Zahlungen mit ungefähr ${Math.round(best.info.days)} Tagen Abstand. Einzelne abweichende Buchungen werden nicht als neuer Rhythmus gewertet.`;
      rows.splice(0, rows.length, ...evidence);
    }
    if (!amount || !Number.isFinite(amount)) continue;
    const last = rows.at(-1);
    const splitSalary =
      salary && median(recentMonths.map(([, r]) => r.length)) > 1;
    const dueDates = splitSalary
      ? months
          .filter(([m]) => m < asOfMonth)
          .slice(-6)
          .map(([, r]) =>
            Math.max(...r.map((t) => Number(t.bookingDate.slice(8)))),
          )
      : rows.slice(-6).map((t) => Number(t.bookingDate.slice(8)));
    const dueDay = Math.round(median(dueDates)),
      f = FREQUENCIES[frequency];
    let nextDate = nextFor(last.bookingDate, frequency, dueDay),
      nextAmount = amount;
    const currentMonthSum = months.find(([m]) => m === asOfMonth)?.[1];
    if (
      splitSalary &&
      lastMonth === asOfMonth &&
      Number(last.bookingDate.slice(8)) < dueDay - 3
    ) {
      nextDate = addMonths(last.bookingDate, 0, dueDay);
      nextAmount = Math.max(
        0,
        sum([amount, -Math.abs(sum(currentMonthSum.map((t) => t.amount)))]),
      );
    }
    const inactive =
      dayDiff(asOf, last.bookingDate) > f.days + Math.max(12, f.days * 0.5);
    const recentTotals = months.slice(-5).map(([month, items]) => ({
      month,
      amount: Math.abs(sum(items.map((t) => t.amount))),
    }));
    const change =
      recentTotals.length >= 3 && frequency === "monthly" && !salary
        ? (() => {
            const previous = median(
                recentTotals.slice(0, -2).map((x) => x.amount),
              ),
              latest = recentTotals.at(-1).amount;
            return previous &&
              Math.abs(latest - previous) > Math.max(1, previous * 0.03)
              ? {
                  previous,
                  current: latest,
                  difference: sum([latest, -previous]),
                }
              : null;
          })()
        : null;
    const id = "rec_" + hash(key);
    candidates.push({
      id,
      key,
      name: last.merchant,
      merchant: last.merchant,
      accountId: last.accountId,
      direction,
      kind: salary ? "salary" : benefit ? "benefit" : "contract",
      group,
      subcategory,
      amount: Math.round(amount * 100) / 100,
      frequency,
      dueDay,
      nextDate,
      lastDate: last.bookingDate,
      lastAmount: Math.abs(last.amount),
      lastMonthAmount: recentTotals.at(-1).amount,
      confidence,
      reason,
      status: inactive ? "inactive" : "active",
      source: "detected",
      reviewed: false,
      evidenceIds: evidence.map((t) => t.id),
      paymentCount: rows.length,
      monthCount: months.length,
      splitSalary,
      nextAmount,
      change,
      recentTotals,
    });
  }
  const result = candidates.map((item) => ({
    ...item,
    ...state.recurringOverrides?.[item.id],
  }));
  // Retain user-edited records if source bookings change or a rule is adjusted.
  for (const [id, override] of Object.entries(state.recurringOverrides || {}))
    if (override.snapshot && !result.some((x) => x.id === id)) {
      const oldIds = new Set(override.snapshot.evidenceIds || []);
      const relink = result.find((x) => {
        if (
          state.recurringOverrides?.[x.id] ||
          x.accountId !== override.snapshot.accountId ||
          x.direction !== override.snapshot.direction ||
          oldIds.size < 2
        )
          return false;
        const ids = x.evidenceIds || [],
          shared = ids.filter((t) => oldIds.has(t)).length;
        return (
          shared >= 2 &&
          shared / oldIds.size >= 0.8 &&
          shared / Math.max(1, ids.length) >= 0.8
        );
      });
      if (relink) Object.assign(relink, override, { id });
      else result.push({ ...override.snapshot, ...override, id });
    }
  for (const item of state.manualRecurring || [])
    result.push({ ...item, source: "manual", reviewed: true });
  return result
    .map((item) => effectiveRecurring(item, state, txs, asOf))
    .filter((x) => x.status !== "rejected")
    .sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a));
}
function effectiveRecurring(item, state, txs, asOf) {
  const x = { ...item };
  if (
    x.kind === "salary" &&
    x.splitSalary &&
    x.frequency === "monthly" &&
    x.nextDate?.slice(0, 7) === asOf.slice(0, 7) &&
    x.lastDate?.slice(0, 7) === asOf.slice(0, 7) &&
    Number(x.lastDate.slice(8)) < Number(x.dueDay) - 3
  ) {
    const ids = new Set(x.evidenceIds || []);
    const received = sum(
      txs
        .filter(
          (t) => ids.has(t.id) && t.bookingDate.startsWith(asOf.slice(0, 7)),
        )
        .map((t) => t.amount),
    );
    x.nextAmount = Math.max(0, sum([x.amount, -received]));
  }
  if (x.endDate && x.endDate < asOf && x.status === "active")
    x.status = "ended";
  if (x.endDate && Number(x.noticeDays) > 0) {
    const d = new Date(x.endDate + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - Number(x.noticeDays));
    x.noticeDeadline = d.toISOString().slice(0, 10);
  }
  if (x.kind === "loan" && x.loanId) {
    const loan = state.loans.find((l) => l.id === x.loanId);
    if (loan) {
      try {
        const p = loanSchedule(loan, asOf);
        if (p.paidOff || loan.archived) x.status = "ended";
        const upcoming = p.rows.find((r) => r.date > asOf);
        if (upcoming) x.nextDate = upcoming.date;
      } catch {}
    }
  }
  if (x.source === "manual" && x.matchMerchant) {
    const matches = txs.filter(
      (t) =>
        (!x.accountId || t.accountId === x.accountId) &&
        norm(t.merchant).includes(norm(x.matchMerchant)) &&
        t.group === x.group &&
        (x.direction === "income" ? t.amount > 0 : t.amount < 0) &&
        !isTransfer(t, state),
    );
    if (matches.length) {
      x.evidenceIds = matches.map((t) => t.id);
      x.lastDate = matches[0].bookingDate;
      x.paymentCount = matches.length;
    }
  }
  if (
    x.nextDate &&
    x.lastDate &&
    x.lastDate >= x.nextDate &&
    x.status === "active"
  ) {
    let guard = 0;
    while (x.nextDate <= x.lastDate && guard++ < 120)
      x.nextDate = advanceDate(x.nextDate, x.frequency, x.dueDay);
  }
  return x;
}
export function recurringSummary(items) {
  const active = items.filter((x) => x.status === "active");
  const income = sum(
      active.filter((x) => x.direction === "income").map(monthlyEquivalent),
    ),
    expenses = sum(
      active.filter((x) => x.direction === "expense").map(monthlyEquivalent),
    );
  return { income, expenses, available: sum([income, -expenses]), active };
}
export function nextPayments(items, from = today(), days = 35) {
  const out = [];
  for (const item of items.filter((x) => x.status === "active")) {
    let date = item.nextDate || item.lastDate;
    if (!isoDate(date)) continue;
    const firstAmount = item.reviewed
      ? item.amount
      : (item.nextAmount ?? item.amount);
    let guard = 0;
    // A late observed payment is shown as overdue; only future cycles are advanced.
    if (
      dayDiff(from, date) >
      Math.max(14, FREQUENCIES[item.frequency]?.days || 30)
    )
      continue;
    while (dayDiff(date, from) <= days && guard++ < 30) {
      if (
        dayDiff(date, from) >= -7 &&
        (!item.endDate || date <= item.endDate) &&
        (guard !== 1 || firstAmount > 0)
      )
        out.push({
          ...item,
          amount: guard === 1 ? firstAmount : item.amount,
          paymentDate: date,
        });
      date = advanceDate(date, item.frequency, item.dueDay);
    }
  }
  return out.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
}
export function parseCSV(text) {
  const delimiter =
    (text.split(/\r?\n/)[0].match(/;/g) || []).length >
    (text.split(/\r?\n/)[0].match(/,/g) || []).length
      ? ";"
      : ",";
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted)
    throw Error(
      "Ein Anführungszeichen in der CSV-Datei ist nicht geschlossen.",
    );
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw Error("Die Datei enthält keine Buchungen.");
  return parseTabularRows(rows);
}
export function parseTabularRows(inputRows) {
  const rows = inputRows.map((r) => [...r]),
    key = (s) =>
      norm(s).replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u"),
    headers = rows.shift().map(key);
  const find = (names) => {
    for (const name of names) {
      const i = headers.findIndex((h) => h === key(name));
      if (i >= 0) return i;
    }
    return headers.findIndex((h) => names.some((n) => h.includes(key(n))));
  };
  const ix = {
    date: find([
      "Buchungstag",
      "Buchungsdatum",
      "Datum",
      "Booking Date",
      "Date",
    ]),
    merchant: find([
      "Beguenstigter/Auftraggeber",
      "Begünstigter/Auftraggeber",
      "Empfänger",
      "Zahlungspartner",
      "Payee",
      "Merchant",
      "Beschreibung",
      "Name",
    ]),
    amount: find(["Betrag", "Amount", "Umsatz"]),
    category: find([
      "Analyse-Unterkategorie",
      "Unterkategorie",
      "Kategorie",
      "Category",
    ]),
    account: find(["Name Referenzkonto", "Kontoname", "Konto", "Account"]),
    iban: find(["Referenzkonto", "Eigene IBAN", "Konto IBAN", "ReferenceIban"]),
    counterparty: find([
      "IBAN Beguenstigter/Auftraggeber",
      "IBAN Begünstigter/Auftraggeber",
      "Gegenkonto IBAN",
      "IBAN Gegenkonto",
      "CounterpartyIban",
    ]),
    description: find(["Verwendungszweck", "Description", "Memo"]),
    balance: find(["Kontostand", "Balance"]),
    currency: find(["Waehrung", "Währung", "Currency"]),
    sourceId: find(["Buchungs-ID", "Transaction ID"]),
    parentId: find(["Referenz-Original-ID"]),
    splitType: find(["Split-Typ"]),
    contractId: find(["Analyse-Vertrags-ID"]),
    contractFrequency: find(["Analyse-Vertragsturnus"]),
    hasContract: find(["Analyse-Vertrag"]),
    transfer: find(["Analyse-Umbuchung"]),
    excluded: find(["Analyse-Vom frei verfuegbaren Einkommen ausgeschlossen"]),
  };
  if (ix.merchant < 0 && ix.description >= 0) ix.merchant = ix.description;
  if (ix.date < 0 || ix.merchant < 0 || ix.amount < 0)
    throw Error(
      "Benötigt werden Spalten für Datum, Empfänger/Beschreibung und Betrag.",
    );
  const transactions = [],
    errors = [];
  for (const [i, row] of rows.entries()) {
    const date = isoDate(row[ix.date]),
      amount = parseAmount(row[ix.amount]),
      merchant = String(
        row[ix.merchant] || row[ix.description] || "Bankbuchung",
      ).trim();
    if (!date || !Number.isFinite(amount) || !merchant) {
      errors.push(i + 2);
      continue;
    }
    const currency = String(row[ix.currency] || "EUR").toUpperCase();
    if (currency !== "EUR") {
      errors.push(i + 2);
      continue;
    }
    const value = (n) => (n >= 0 ? String(row[n] ?? "") : "");
    const tx = {
      merchant,
      date,
      bookingDate: date,
      amount,
      category: value(ix.category) || "Nicht zugeordnet",
      account: value(ix.account),
      referenceIban: value(ix.iban),
      counterpartyIban: value(ix.counterparty),
      description: value(ix.description),
      currency,
      sourceId: value(ix.sourceId),
      splitParentId: value(ix.parentId),
      splitType: value(ix.splitType),
      contractId: value(ix.contractId),
      contractFrequency: value(ix.contractFrequency),
      sourceTransfer: ["ja", "true", "1"].includes(key(value(ix.transfer))),
      sourceExcluded: ["ja", "true", "1"].includes(key(value(ix.excluded))),
      sourceContract: ["ja", "true", "1"].includes(key(value(ix.hasContract))),
    };
    if (ix.balance >= 0) {
      const balance = parseAmount(row[ix.balance]);
      if (Number.isFinite(balance)) tx.sourceBalance = balance;
    }
    if (ix.contractId >= 0) {
      const metadataColumns = {
        endToEnd: "E-Ref",
        mandate: "Mandatsreferenz",
        creditorId: "Glaeubiger-ID",
        tags: "Tags",
        note: "Notiz",
        originalReference: "Referenz-Original-ID",
        mainCategory: "Analyse-Hauptkategorie",
        revenueType: "Analyse-Umsatzart",
      };
      tx.sourceMetadata = {};
      for (const [key, label] of Object.entries(metadataColumns)) {
        const sourceIndex = headers.indexOf(
          norm(label)
            .replace(/ae/g, "a")
            .replace(/oe/g, "o")
            .replace(/ue/g, "u"),
        );
        if (
          sourceIndex >= 0 &&
          row[sourceIndex] !== "" &&
          row[sourceIndex] !== undefined
        )
          tx.sourceMetadata[key] = row[sourceIndex];
      }
    }

    transactions.push(tx);
  }
  return {
    transactions,
    errors,
    format: ix.contractId >= 0 ? "finanzguru" : "generic",
  };
}

export function transactionFingerprint(t) {
  return hash(
    [
      t.accountId || ibanKey(t.referenceIban) || t.account,
      isoDate(t.bookingDate || t.date),
      cents(t.amount),
      norm(t.merchant),
    ].join("|"),
  );
}
export function mergeTransactions(existing, incoming) {
  const sourceIds = new Set(
    existing
      .filter((t) => t.sourceId)
      .map((t) => (t.accountId || t.account) + "|" + t.sourceId),
  );
  const available = new Map();
  for (const t of existing) {
    const k = transactionFingerprint(t);
    available.set(k, (available.get(k) || 0) + 1);
  }
  const seen = new Map(),
    added = [];
  let duplicates = 0;
  for (const t of incoming) {
    if (
      t.sourceId &&
      sourceIds.has((t.accountId || t.account) + "|" + t.sourceId)
    ) {
      duplicates++;
      continue;
    }
    const k = transactionFingerprint(t),
      n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    if (n <= (available.get(k) || 0)) duplicates++;
    else added.push(t);
  }
  return {
    transactions: [...existing, ...added],
    added: added.length,
    duplicates,
  };
}

export function requiredLoanPayment(balance, annualRate, months) {
  const principal = Number(balance),
    n = Number(months),
    r = Number(annualRate) / 1200;
  if (
    !Number.isFinite(principal) ||
    principal <= 0 ||
    !Number.isInteger(n) ||
    n < 1 ||
    n > 1200 ||
    !Number.isFinite(r) ||
    r < 0
  )
    throw Error("Restschuld, Sollzins und Laufzeit prüfen.");
  return (
    Math.ceil(
      (r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n))) *
        100,
    ) / 100
  );
}
export function loanSchedule(loan, asOf = today()) {
  const opening = Math.max(0, cents(loan.balance)),
    annualRate = Number(loan.annualRate || 0),
    rate = annualRate / 1200,
    payment = cents(loan.monthlyPayment),
    baseDate = isoDate(loan.balanceDate) || asOf;
  const first =
    isoDate(loan.nextDueDate) ||
    addMonths(baseDate, 1, Number(loan.dueDay) || Number(baseDate.slice(8)));
  if (!Number.isFinite(rate) || rate < 0 || annualRate > 100)
    throw Error("Bitte einen Sollzins zwischen 0 und 100 % eintragen.");
  if (first <= baseDate)
    throw Error(
      "Die erste zukünftige Rate muss nach dem Datum der Restschuld liegen.",
    );
  if (opening === 0)
    return {
      rows: [],
      currentBalance: 0,
      interest: 0,
      total: 0,
      endDate: baseDate,
      months: 0,
      paidOff: true,
    };
  if (payment <= Math.round(opening * rate))
    return {
      rows: [],
      currentBalance: opening / 100,
      interest: 0,
      total: 0,
      endDate: null,
      months: null,
      notAmortizing: true,
    };
  const extras = (loan.extraPayments || [])
    .map((x) => ({ id: x.id, date: isoDate(x.date), amount: cents(x.amount) }))
    .filter((x) => x.date > baseDate && x.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  let balance = opening,
    date = first,
    totalInterest = 0,
    totalPaid = 0,
    current = opening,
    extraIndex = 0;
  const rows = [];
  for (let n = 1; balance > 0 && n <= 1200; n++) {
    let extra = 0;
    while (extraIndex < extras.length && extras[extraIndex].date <= date) {
      extra += extras[extraIndex].amount;
      extraIndex++;
    }
    // Monthly nominal interest on the balance at the preceding due date. Extra
    // payments are booked with this instalment; actual lender day counts may differ.
    const interest = Math.round(balance * rate),
      regular = Math.min(payment, balance + interest),
      extraPaid = Math.min(extra, balance + interest - regular),
      principal = regular + extraPaid - interest;
    balance = Math.max(0, balance - principal);
    totalInterest += interest;
    totalPaid += regular + extraPaid;
    rows.push({
      number: n,
      date,
      payment: regular / 100,
      extra: extraPaid / 100,
      interest: interest / 100,
      principal: principal / 100,
      balance: balance / 100,
    });
    if (date <= asOf) current = balance;
    date = addMonths(first, n, Number(loan.dueDay) || Number(first.slice(8)));
  }
  return {
    rows,
    currentBalance: current / 100,
    interest: totalInterest / 100,
    total: totalPaid / 100,
    endDate: balance > 0 ? null : rows.at(-1)?.date,
    months: balance > 0 ? null : rows.length,
    notAmortizing: balance > 0,
    paidOff: current === 0,
  };
}

export function markSplitOriginals(transactions) {
  const children = new Map();
  for (const t of transactions) {
    t.splitExcluded = false;
    delete t.splitExclusionReason;
    delete t.splitMismatch;
    if (t.splitParentId && norm(t.splitType) !== "original") {
      const key = t.accountId + "|" + t.splitParentId;
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(t);
    }
  }
  let reconciled = 0,
    mismatched = 0;
  for (const t of transactions)
    if (norm(t.splitType) === "original" && t.sourceId) {
      const parts = children.get(t.accountId + "|" + t.sourceId) || [];
      if (
        parts.length &&
        cents(sum(parts.map((p) => p.amount))) === cents(t.amount)
      ) {
        t.splitExcluded = true;
        t.splitExclusionReason = "original";
        t.splitChildIds = parts.map((p) => p.id);
        reconciled++;
      } else {
        t.splitMismatch = true;
        for (const part of parts) {
          part.splitExcluded = true;
          part.splitExclusionReason = "incomplete";
        }
        mismatched++;
      }
    }
  return { reconciled, mismatched };
}

export function enrichTransactions(existing, sourceRows) {
  const byKey = new Map(),
    baseKey = (t) =>
      [
        ibanKey(t.referenceIban),
        isoDate(t.bookingDate || t.date),
        cents(t.amount),
      ].join("|"),
    key = (t) => baseKey(t) + "|" + norm(t.merchant),
    used = new Set();
  for (const row of sourceRows) {
    const k = key(row);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(row);
  }
  let matched = 0,
    fallbackMatched = 0;
  const pending = [];
  const apply = (t, row) => {
    for (const field of [
      "description",
      "currency",
      "sourceId",
      "splitParentId",
      "splitType",
      "contractId",
      "contractFrequency",
      "sourceTransfer",
      "sourceExcluded",
      "sourceContract",
      "sourceMetadata",
      "sourceBalance",
    ])
      if (row[field] !== undefined) t[field] = row[field];
    used.add(row);
    matched++;
  };
  for (const t of existing) {
    const row = byKey.get(key(t))?.shift();
    if (row) apply(t, row);
    else pending.push(t);
  }
  for (const t of pending) {
    const candidates = sourceRows.filter(
      (row) => !used.has(row) && baseKey(row) === baseKey(t),
    );
    if (candidates.length === 1) {
      apply(t, candidates[0]);
      fallbackMatched++;
    }
  }
  return { matched, fallbackMatched, unmatched: existing.length - matched };
}
