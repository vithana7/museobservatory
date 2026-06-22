// Dev-only beacon sink for the Safari sharpness probe (round 4).
//
// The host can't screencapture Safari, so the probe POSTs its readPixels numbers
// here and we read them off disk. CORS is wide-open (dev localhost only). Run:
//   node scripts/observatory/probe-logger.mjs
// Beacons land in scripts/observatory/probe-log.json (one record per run) and stdout.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(HERE, 'probe-log.json');
const PORT = 7777;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const records = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8') || '[]') : [];

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  if (req.method === 'GET') { res.writeHead(200, CORS); res.end('probe-logger ok'); return; }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch { parsed = { raw: body }; }
      parsed._at = new Date().toISOString();
      records.push(parsed);
      fs.writeFileSync(LOG, JSON.stringify(records, null, 2));
      console.log(`\n=== beacon @ ${parsed._at} — ${parsed.browser || '?'} ===`);
      console.log(JSON.stringify(parsed, null, 2));
      res.writeHead(200, CORS); res.end('logged');
    });
    return;
  }
  res.writeHead(405, CORS); res.end();
}).listen(PORT, () => console.log(`probe-logger listening on http://localhost:${PORT}  (log: ${LOG})`));
