// SyncWatch Relay Server
// Deploy free on Render.com or Railway.app

const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// rooms: { roomCode: Set<WebSocket> }
const rooms = new Map();

function getRoomCode(ws) {
  for (const [code, members] of rooms) {
    if (members.has(ws)) return code;
  }
  return null;
}

function broadcastMembers(code) {
  const members = rooms.get(code);
  if (!members) return;
  const msg = JSON.stringify({ type: 'MEMBERS', count: members.size });
  members.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

wss.on('connection', (ws) => {
  console.log('[+] New connection');

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'JOIN') {
      const code = (msg.room || '').toUpperCase().trim();
      if (!code) return;

      if (!rooms.has(code)) rooms.set(code, new Set());
      rooms.get(code).add(ws);
      ws.currentRoom = code;

      console.log(`[~] ${code} — ${rooms.get(code).size} members`);
      broadcastMembers(code);
      return;
    }

    // Relay sync actions to everyone else in the room
    if (['PLAY', 'PAUSE', 'SEEK'].includes(msg.type)) {
      const code = ws.currentRoom || getRoomCode(ws);
      if (!code || !rooms.has(code)) return;

      const payload = JSON.stringify({ type: msg.type, time: msg.time });
      rooms.get(code).forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    }
  });

  ws.on('close', () => {
    const code = ws.currentRoom || getRoomCode(ws);
    if (code && rooms.has(code)) {
      rooms.get(code).delete(ws);
      if (rooms.get(code).size === 0) {
        rooms.delete(code);
        console.log(`[-] Room ${code} closed`);
      } else {
        broadcastMembers(code);
      }
    }
    console.log('[-] Connection closed');
  });

  ws.on('error', (err) => console.error('[!] WS error:', err.message));
});

console.log(`SyncWatch server running on ws://localhost:${PORT}`);
