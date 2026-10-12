const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const rooms = new Map();

const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  if (pathname === '/') pathname = '/index.html';
  const file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
});
const wss = new WebSocket.Server({ server, maxPayload: 1024 * 1024 });
function send(ws, obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function broadcast(room, obj, except) {
  for (const c of wss.clients) if (c !== except && c.readyState === WebSocket.OPEN && c.room === room) send(c, obj);
}
function roster(room) {
  const out = {};
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN && c.room === room && c.player) out[c.player.id] = c.player;
  return out;
}
wss.on('connection', ws => {
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'join') {
      const room = String(msg.room || 'SHIMA').replace(/[^A-Z0-9_-]/gi, '').slice(0, 8) || 'SHIMA';
      ws.room = room; ws.player = { id: String(msg.id || '').slice(0, 32), name: String(msg.name || '風来人').slice(0, 12), x: 2, y: 2, hp: 30 };
      send(ws, { type: 'players', players: roster(room) });
      broadcast(room, { type: 'players', players: roster(room) }, ws);
      return;
    }
    if (!ws.room || !ws.player) return;
    if (msg.type === 'state') {
      // Relay only a compact player record and current game snapshot for this prototype.
      ws.player = { id: ws.player.id, name: String(msg.name || ws.player.name).slice(0, 12),
        x: Number(msg.x) || 0, y: Number(msg.y) || 0, hp: Math.max(0, Math.min(999, Number(msg.hp) || 0)) };
      const safe = { type: 'state', id: ws.player.id, name: ws.player.name, x: ws.player.x, y: ws.player.y, hp: ws.player.hp };
      if (msg.map && Array.isArray(msg.map) && msg.map.length <= 30) {
        safe.snapshot = { map: msg.map, enemies: msg.enemies, items: msg.items, stairs: msg.stairs,
          floor: msg.floor, turn: msg.turn, money: msg.money, player: msg.player, inv: msg.inv, logs: msg.logs };
      }
      broadcast(ws.room, safe, ws);
    }
  });
  ws.on('close', () => {
    if (ws.room) broadcast(ws.room, { type: 'players', players: roster(ws.room) });
  });
});
server.listen(PORT, '0.0.0.0', () => console.log(`風来の島 server: http://localhost:${PORT}`));
