export const SCHEDULES = { off: [], twice: [8, 18], four: [8, 12, 16, 20] };
const calendar = (date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
export function scheduleSlot(now, mode = "twice") {
  const p = calendar(now),
    hours = SCHEDULES[mode] || [];
  const h = hours.filter((h) => h <= Number(p.hour)).at(-1);
  return h === undefined
    ? null
    : `${p.year}-${p.month}-${p.day}T${String(h).padStart(2, "0")}:00`;
}
export function scheduleDue(settings, now = new Date()) {
  const slot = scheduleSlot(now, settings.mode);
  return !!slot && slot !== settings.lastSlot;
}
export function createSingleFlight(fn) {
  let active;
  const run = (...args) => {
    if (!active)
      active = Promise.resolve()
        .then(() => fn(...args))
        .finally(() => {
          active = null;
        });
    return active;
  };
  run.busy = () => !!active;
  return run;
}
