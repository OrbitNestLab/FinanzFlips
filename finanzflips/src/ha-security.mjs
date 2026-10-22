export function validateIngress(req, owner) {
  const peer = req.socket.remoteAddress?.replace(/^::ffff:/, "");
  if (
    peer !== "172.30.32.2" ||
    !owner ||
    req.headers["x-remote-user-id"] !== owner
  ) {
    throw Object.assign(
      new Error(
        "Zugriff nur über Home Assistant mit deinem freigegebenen Benutzerkonto.",
      ),
      { status: 403 },
    );
  }
  if (req.headers.origin) {
    const forwarded = req.headers["x-forwarded-host"] || req.headers.host;
    let host;
    try {
      host = new URL(req.headers.origin).host;
    } catch {}
    if (host !== forwarded)
      throw Object.assign(new Error("Fremde Website abgelehnt."), {
        status: 403,
      });
  }
}
