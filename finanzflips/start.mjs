import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';

const importTargets = new Map([
  ['master-key', '.finanzflips-master.key'],
  ['data', '.finanzflips-data.json'],
  ['environment', '.env'],
  ['bank-private-key', 'secrets/enable-banking-private.key'],
  ['bank-public-certificate', 'secrets/enable-banking-public.crt'],
]);
const importState = new Map();
const importRoot = '/data/finanzflips';

function handleImport(message) {
  const target = importTargets.get(message.file);
  if (!target) throw Error('Unbekanntes Importziel.');
  const finalPath = path.join(importRoot, target);
  const tempPath = `${finalPath}.importing`;
  if (message.command === 'finanzflips_import_begin') {
    fs.mkdirSync(path.dirname(finalPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(tempPath, '', { mode: 0o600 });
    importState.set(message.file, {
      finalPath,
      tempPath,
      size: Number(message.size),
      sha256: String(message.sha256 || ''),
      received: 0,
    });
    console.log(`[migration] ${message.file}: vorbereitet`);
    return;
  }
  const state = importState.get(message.file);
  if (!state) throw Error('Import wurde nicht vorbereitet.');
  if (message.command === 'finanzflips_import_chunk') {
    const chunk = Buffer.from(String(message.data || ''), 'base64');
    if (Number(message.offset) !== state.received || chunk.length > 262144)
      throw Error('Ungültige Importreihenfolge oder Blockgröße.');
    fs.appendFileSync(state.tempPath, chunk);
    state.received += chunk.length;
    return;
  }
  if (message.command === 'finanzflips_import_finish') {
    const payload = fs.readFileSync(state.tempPath);
    const digest = crypto.createHash('sha256').update(payload).digest('hex');
    if (payload.length !== state.size || digest !== state.sha256)
      throw Error('Größe oder Prüfsumme stimmt nicht.');
    fs.chmodSync(state.tempPath, 0o600);
    fs.renameSync(state.tempPath, state.finalPath);
    importState.delete(message.file);
    console.log(`[migration] ${message.file}: vollständig geprüft`);
    if (message.file === 'master-key') {
      // Stop inside the same synchronous turn that installs the matching key.
      // This prevents any timer in the old process from writing with its
      // in-memory key before Home Assistant starts a fresh process.
      process.exit(0);
    }
  }
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  try {
    const message = JSON.parse(line);
    if (String(message.command || '').startsWith('finanzflips_import_'))
      handleImport(message);
  } catch (error) {
    console.error(`[migration] abgelehnt: ${error.message}`);
  }
});

const options=JSON.parse(fs.readFileSync('/data/options.json','utf8'));
if(!/^[a-f0-9]{32}$/.test(options.owner_id||''))throw Error('Bitte die Home-Assistant-Benutzer-ID des Eigentümers konfigurieren.');
process.env.FINANZFLIPS_HA_OWNER_ID=options.owner_id;
process.env.FINANZFLIPS_NOTIFY_SERVICE=options.notify_service||'';
try{const r=await fetch('http://supervisor/addons/self/info',{headers:{Authorization:'Bearer '+process.env.SUPERVISOR_TOKEN},signal:AbortSignal.timeout(10000)});const {data}=await r.json();if(data?.slug)process.env.FINANZFLIPS_HA_PANEL='/hassio/ingress/'+data.slug;}catch{}
try {
  const { localVault } = await import('./local-vault.mjs');
  const vault = localVault(importRoot);
  const stored = JSON.parse(vault.read(path.join(importRoot, '.finanzflips-data.json')));
  console.log(
    `[storage] app-konten=${stored.appState?.accounts?.length || 0} bank-konten=${stored.accounts?.length || 0} sitzungen=${stored.sessions?.length || 0}`,
  );
} catch (error) {
  console.error(`[storage] nicht lesbar: ${error.name}`);
}
await import('./server.mjs');
