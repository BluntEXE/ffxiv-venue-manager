const http = require('http');

const PORT = 3333;

const rooms = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'VIP Lounge',
    room_number: 1,
    locked: false,
    disabled: false,
    status: 'available',
    owner_discord_id: null,
    images: [],
    current_reservation: null,
  },
  {
    id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    name: 'Main Hall',
    room_number: 2,
    locked: false,
    disabled: false,
    status: 'reserved',
    owner_discord_id: null,
    images: [{ image_url: 'https://placekitten.com/200/200', sort_order: 0 }],
    current_reservation: {
      id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
      reserved_discord_id: '999999999',
      room_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      start_at: new Date().toISOString(),
      end_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      source: 'plugin_manual',
    },
  },
  {
    id: 'd4e5f6a7-b8c9-0123-def0-123456789012',
    name: 'Back Room',
    room_number: 3,
    locked: false,
    disabled: false,
    status: 'available',
    owner_discord_id: '123456789',
    images: [],
    current_reservation: null,
  },
];

const venues = [
  { id: 'mock-venue-1', name: 'VIP Lounge Venue', discord_guild_id: '111111111' },
];

function findRoom(roomId) {
  return rooms.find((r) => r.id === roomId);
}

function reserveRoomForDiscord(roomId, discordId) {
  const room = findRoom(roomId);
  if (!room) return null;
  if (room.status === 'reserved') return { conflict: true };
  room.status = 'reserved';
  room.current_reservation = {
    id: `r-${Date.now()}`,
    reserved_discord_id: discordId,
    room_id: roomId,
    start_at: new Date().toISOString(),
    end_at: null,
    source: 'plugin_auto',
  };
  return { conflict: false };
}

function bookRoom(roomId, params) {
  const room = findRoom(roomId);
  if (!room) return null;
  if (room.status === 'reserved') return { conflict: true };
  room.status = 'reserved';
  room.current_reservation = {
    id: `r-${Date.now()}`,
    reserved_discord_id: params.reserved_discord_id,
    room_id: roomId,
    start_at: params.start_at,
    end_at: params.end_at,
    source: params.source,
  };
  return { conflict: false };
}

function releaseRoomById(roomId) {
  const room = findRoom(roomId);
  if (!room) return false;
  room.status = 'available';
  room.current_reservation = null;
  return true;
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (body) console.log('  Body:', body);

    if (req.method === 'POST' && req.url === '/plugin-auth/redeem') {
      const { code } = JSON.parse(body);
      if (code === 'invalid' || code === 'expired') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or expired code' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        token: 'mock-bearer-token-xyz',
        discord_user_id: '123456789',
        discord_username: 'testuser',
        client: 'xvm',
        scopes: ['venues:read', 'venues:write'],
      }));
    } else if (req.method === 'GET' && req.url === '/v2/venues') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(venues));
    } else if (req.method === 'GET' && req.url?.startsWith('/v2/venues/') && req.url?.endsWith('/rooms')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rooms));
    } else if (req.method === 'POST' && req.url?.includes('/reservations')) {
      const match = req.url.match(/rooms\/([^/]+)\/reservations/);
      if (!match) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing room ID' }));
        return;
      }
      const params = JSON.parse(body);
      const result = bookRoom(match[1], params);
      if (!result) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Room not found' }));
        return;
      }
      if (result.conflict) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Room already reserved' }));
        return;
      }
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } else if (req.method === 'POST' && req.url?.includes('/reserve')) {
      const match = req.url.match(/rooms\/([^/]+)\/reserve/);
      if (!match) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing room ID' }));
        return;
      }
      const params = JSON.parse(body);
      const result = reserveRoomForDiscord(match[1], params.discord_user_id);
      if (!result) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Room not found' }));
        return;
      }
      if (result.conflict) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Room already occupied' }));
        return;
      }
      res.writeHead(204);
      res.end();
    } else if (req.method === 'POST' && req.url?.includes('/release')) {
      const match = req.url.match(/rooms\/([^/]+)\/release/);
      if (match) releaseRoomById(match[1]);
      res.writeHead(204);
      res.end();
    } else if (req.method === 'POST' && req.url?.includes('/post')) {
      res.writeHead(204);
      res.end();
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
});

server.listen(PORT, () => console.log(`Frogge mock running on http://localhost:${PORT}`));
