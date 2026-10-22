import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
export function localVault(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(dir, ".finanzflips-master.key");
  if (!fs.existsSync(keyPath))
    fs.writeFileSync(keyPath, crypto.randomBytes(32), {
      flag: "wx",
      mode: 0o600,
    });
  const key = fs.readFileSync(keyPath);
  if (key.length !== 32) throw Error("Lokaler Datenschlüssel ungültig.");
  const prefix = "FFVAULT1:";
  function seal(value) {
    const iv = crypto.randomBytes(12),
      c = crypto.createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([c.update(value, "utf8"), c.final()]);
    return (
      prefix + Buffer.concat([iv, c.getAuthTag(), data]).toString("base64")
    );
  }
  function open(value) {
    if (!value.startsWith(prefix)) return value;
    const b = Buffer.from(value.slice(prefix.length), "base64"),
      d = crypto.createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString(
      "utf8",
    );
  }
  function write(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = file + ".tmp";
    fs.writeFileSync(temp, seal(value), { mode: 0o600 });
    fs.chmodSync(temp, 0o600);
    fs.renameSync(temp, file);
  }
  function read(file) {
    return open(fs.readFileSync(file, "utf8"));
  }
  return { seal, open, write, read };
}
