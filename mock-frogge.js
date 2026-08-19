const http = require('http');

const PORT = 3333;

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
      res.end(JSON.stringify({ token: 'mock-bearer-token-xyz', froggeVenueId: 'mock-venue-1' }));
    } else if (req.method === 'GET' && req.url?.startsWith('/v2/venues/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 1,
            name: 'VIP Lounge',
            room_number: 1,
            locked: false,
            disabled: false,
            owner_discord_id: null,
            images: [],
            reservations: [],
          },
          {
            id: 2,
            name: 'Main Hall',
            room_number: 2,
            locked: true,
            disabled: false,
            owner_discord_id: '123456789',
            images: [{ image_url: 'https://placekitten.com/200/200', sort_order: 0 }],
            reservations: [],
          },
        ])
      );
    } else if (req.method === 'POST' && req.url?.includes('/reserve')) {
      res.writeHead(204);
      res.end();
    } else if (req.method === 'POST' && req.url?.includes('/release')) {
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
