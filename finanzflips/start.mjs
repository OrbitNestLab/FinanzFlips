import fs from 'node:fs';
const options=JSON.parse(fs.readFileSync('/data/options.json','utf8'));
if(!/^[a-f0-9]{32}$/.test(options.owner_id||''))throw Error('Bitte die Home-Assistant-Benutzer-ID des Eigentümers konfigurieren.');
process.env.FINANZFLIPS_HA_OWNER_ID=options.owner_id;
process.env.FINANZFLIPS_NOTIFY_SERVICE=options.notify_service||'';
try{const r=await fetch('http://supervisor/addons/self/info',{headers:{Authorization:'Bearer '+process.env.SUPERVISOR_TOKEN},signal:AbortSignal.timeout(10000)});const {data}=await r.json();if(data?.slug)process.env.FINANZFLIPS_HA_PANEL='/hassio/ingress/'+data.slug;}catch{}
await import('./server.mjs');
