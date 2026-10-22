import { spawn } from "node:child_process";
import crypto from "node:crypto";
import readline from "node:readline";
export class FinTSService {
  constructor({ python, script, spawnProcess = spawn }) {
    Object.assign(this, { python, script, spawnProcess });
    this.active = null;
  }
  start(credentials) {
    if (this.active)
      throw Object.assign(
        Error(
          "Eine ING-Anmeldung läuft bereits. Bitte zuerst abschließen oder abbrechen.",
        ),
        { status: 409 },
      );
    const child = this.spawnProcess(this.python, ["-u", this.script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: "de_DE.UTF-8",
      },
    });
    const session = {
      id: crypto.randomUUID(),
      child,
      event: { type: "waiting" },
      sequence: 0,
      startedAt: Date.now(),
    };
    this.active = session;
    session.timer = setTimeout(() => this.cancel(session.id), 10 * 60000);
    session.timer.unref();
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const event = JSON.parse(line);
        if (
          ![
            "challenge",
            "methods",
            "media",
            "accounts",
            "result",
            "error",
          ].includes(event.type)
        )
          return;
        session.event = event;
        session.sequence++;
        if (["result", "error"].includes(event.type)) {
          clearTimeout(session.timer);
          session.timer = setTimeout(() => this.cancel(session.id), 10 * 60000);
          session.timer.unref();
        }
      } catch {}
    });
    child.stderr.on("data", () => {}); // Never log library messages containing bank payloads.
    const fail = () => {
      if (!["result", "error"].includes(session.event.type)) {
        session.event = {
          type: "error",
          message: "ING-Verbindung beendet. Bitte erneut anmelden.",
        };
        session.sequence++;
      }
    };
    child.on("error", fail);
    child.on("exit", fail);
    child.stdin.on("error", () => {});
    child.stdin.write(JSON.stringify(credentials) + "\n");
    return { id: session.id };
  }
  get(id) {
    const s = this.active;
    if (!s || s.id !== id)
      throw Object.assign(
        Error("Die ING-Anmeldung ist abgelaufen. Bitte neu starten."),
        { status: 404 },
      );
    return s;
  }
  respond(id, input) {
    const s = this.get(id);
    if (["waiting", "result", "error"].includes(s.event.type))
      throw Object.assign(Error("Hier ist keine Eingabe erforderlich."), {
        status: 409,
      });
    const type = s.event.type;
    if (
      type === "accounts" &&
      (!Array.isArray(input.accounts) ||
        !input.accounts.length ||
        input.accounts.some((a) => !s.event.choices.some((x) => x.id === a)))
    )
      throw Object.assign(Error("Bitte gültige Konten auswählen."), {
        status: 400,
      });
    if (
      ["methods", "media"].includes(type) &&
      !s.event.choices.some((x) => x.id === input.choice)
    )
      throw Object.assign(Error("Bitte ein Freigabeverfahren auswählen."), {
        status: 400,
      });
    if (
      type === "challenge" &&
      !s.event.decoupled &&
      (!input.tan || String(input.tan).length > 100)
    )
      throw Object.assign(Error("Bitte eine TAN eingeben."), { status: 400 });
    s.child.stdin.write(
      JSON.stringify({
        accounts: input.accounts,
        choice: input.choice,
        tan: input.tan,
      }) + "\n",
    );
    s.event = { type: "waiting" };
    s.sequence++;
  }
  cancel(id) {
    const s = this.get(id);
    clearTimeout(s.timer);
    s.child.kill();
    this.active = null;
  }
}
