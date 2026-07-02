import express from 'express';
import { Client } from 'discord.js';
import { postEmbed } from '../utils/channels.js';
import { awardXp } from './xpWebhook.js';
import {
  newVenueEmbed,
  weeklySummaryEmbed,
  venueGraduationEmbed,
  partakeDigestEmbed,
  eventLiveEmbed,
  tonightListEmbed,
  type VenueInfo,
} from '../utils/embeds.js';

export function startWebhookServer(client: Client) {
  const app = express();
  app.use(express.json());

  const FEED_CHANNEL = process.env.ACTIVITY_FEED_CHANNEL_ID!;
  const EVENTS_CHANNEL = process.env.EVENTS_FEED_CHANNEL_ID!;
  const TONIGHT_CHANNEL = process.env.TONIGHT_CHANNEL_ID!;
  const SECRET = process.env.WEBHOOK_SECRET;

  // Simple shared-secret auth
  app.use((req, res, next) => {
    if (SECRET && req.headers['x-webhook-secret'] !== SECRET) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });

  app.post('/webhook/new-venue', async (req, res) => {
    const venue: VenueInfo = req.body;
    await postEmbed(client, FEED_CHANNEL, newVenueEmbed(venue));
    res.json({ ok: true });
  });

  app.post('/webhook/tonight', async (req, res) => {
    const venues = req.body as (VenueInfo & { scheduledStart: string; scheduledEnd: string })[];
    const parsed = venues.map(v => ({
      ...v,
      scheduledStart: new Date(v.scheduledStart),
      scheduledEnd: new Date(v.scheduledEnd),
    }));
    await postEmbed(client, TONIGHT_CHANNEL, tonightListEmbed(parsed));
    res.json({ ok: true });
  });

  app.post('/webhook/weekly-summary', async (req, res) => {
    const { newVenues, eventsHosted, patronVisits, newStaff, weekStart } = req.body;
    await postEmbed(client, FEED_CHANNEL, weeklySummaryEmbed({
      newVenues, eventsHosted, patronVisits, newStaff,
      weekStart: new Date(weekStart),
    }));
    res.json({ ok: true });
  });

  app.post('/webhook/venue-graduation', async (req, res) => {
    const { venue, milestone }: { venue: VenueInfo; milestone: number } = req.body;
    await postEmbed(client, FEED_CHANNEL, venueGraduationEmbed(venue, milestone));
    res.json({ ok: true });
  });

  app.post('/webhook/partake-digest', async (req, res) => {
    const events = req.body as { title: string; startTime: string; venue: { name: string; slug: string } }[];
    await postEmbed(client, FEED_CHANNEL, partakeDigestEmbed(
      events.map(e => ({ ...e, startTime: new Date(e.startTime) }))
    ));
    res.json({ ok: true });
  });

  app.post('/webhook/patron-visit-xp', async (req, res) => {
    const { discordId, venueName } = req.body as { discordId: string; venueName: string };
    if (!discordId) { res.status(400).json({ error: 'discordId required' }); return; }
    await awardXp(client, discordId, 100, `visited ${venueName}`);
    res.json({ ok: true });
  });

  app.post('/webhook/shift-xp', async (req, res) => {
    const { discordId, venueName } = req.body as { discordId: string; venueName: string };
    if (!discordId) { res.status(400).json({ error: 'discordId required' }); return; }
    await awardXp(client, discordId, 200, `worked a shift at ${venueName}`);
    res.json({ ok: true });
  });

  app.post('/webhook/event-live', async (req, res) => {
    const { event } = req.body as { event: { title: string; startTime: string; endTime: string; venue: VenueInfo } };
    const parsed = { ...event, startTime: new Date(event.startTime), endTime: new Date(event.endTime) };
    await postEmbed(client, FEED_CHANNEL, eventLiveEmbed(parsed));
    if (EVENTS_CHANNEL) await postEmbed(client, EVENTS_CHANNEL, eventLiveEmbed(parsed));
    res.json({ ok: true });
  });

  const port = parseInt(process.env.WEBHOOK_PORT ?? '4567');
  const host = process.env.WEBHOOK_HOST ?? '127.0.0.1';
  const server = app.listen(port, host, () => console.log(`[Webhook] Listening on ${host}:${port}`));
  server.unref(); // allow process to exit cleanly on SIGTERM without hanging

  const shutdown = () => {
    server.close();
    client.destroy();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
