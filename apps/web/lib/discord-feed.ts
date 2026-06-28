const WEBHOOK_URL = process.env.DISCORD_ACTIVITY_FEED_WEBHOOK

const XIV_BLUE = 0x00b4ff

type Embed = {
  title: string
  description: string
  color: number
  fields?: { name: string; value: string; inline?: boolean }[]
  url?: string
  footer?: { text: string }
  timestamp?: string
}

async function postActivityFeed(embed: Embed) {
  if (!WEBHOOK_URL) return
  fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  }).catch(() => {})
}

export function postNewVenue(venue: {
  name: string
  slug: string
  dataCenter: string
  world: string
  district?: string | null
  ward?: number | null
  plot?: number | null
}) {
  const location = [
    venue.dataCenter,
    venue.world,
    venue.district,
    venue.ward != null ? `W${venue.ward}` : null,
    venue.plot != null ? `P${venue.plot}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  postActivityFeed({
    title: "🏛️ New Venue Joined",
    description: `**${venue.name}** has joined XIV Venue Manager!`,
    color: XIV_BLUE,
    fields: [{ name: "Location", value: location, inline: true }],
    url: `https://xivvenuemanager.com/venues/${venue.slug}`,
    footer: { text: "XIV Venue Manager" },
    timestamp: new Date().toISOString(),
  })
}

export function postPartakeDigest(
  events: { title: string; startTime: Date; endTime: Date; venue: { name: string; slug: string } }[]
) {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) +
    " · " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) +
    " ST"

  const fields = events.map((e) => ({
    name: `${e.venue.name}`,
    value: `[${e.title}](https://xivvenuemanager.com/venues/${e.venue.slug}) · ${fmt(e.startTime)}`,
    inline: false,
  }))

  postActivityFeed({
    title: "📅 Upcoming Events This Week",
    description: "Events from our partner venues on [Partake.gg](https://partake.gg) coming up in the next 7 days:",
    color: XIV_BLUE,
    fields,
    url: "https://xivvenuemanager.com/discover",
    footer: { text: "XIV Venue Manager · Powered by Partake.gg" },
    timestamp: new Date().toISOString(),
  })
}

export function postWeeklySummary(stats: {
  newVenues: number
  eventsHosted: number
  patronVisits: number
  newStaff: number
  weekStart: Date
}) {
  const weekLabel = stats.weekStart.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })

  const lines = [
    `🏛️ **${stats.newVenues}** new venue${stats.newVenues !== 1 ? "s" : ""} joined`,
    `🟢 **${stats.eventsHosted}** event${stats.eventsHosted !== 1 ? "s" : ""} hosted`,
    `👥 **${stats.patronVisits}** patron visit${stats.patronVisits !== 1 ? "s" : ""} logged`,
    `✨ **${stats.newStaff}** new staff member${stats.newStaff !== 1 ? "s" : ""} joined`,
  ]

  postActivityFeed({
    title: "📋 Weekly Summary",
    description: `Here's what happened in the realm this week (w/c ${weekLabel}):\n\n${lines.join("\n")}`,
    color: XIV_BLUE,
    url: "https://xivvenuemanager.com/discover",
    footer: { text: "XIV Venue Manager" },
    timestamp: new Date().toISOString(),
  })
}

export function postEventLive(event: {
  title: string
  startTime: Date
  endTime: Date
  venue: { name: string; slug: string }
}) {
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })

  postActivityFeed({
    title: "🟢 Now Open",
    description: `**${event.venue.name}** is open tonight!`,
    color: XIV_BLUE,
    fields: [
      { name: "Event", value: event.title, inline: true },
      {
        name: "Hours (ST)",
        value: `${fmt(event.startTime)} – ${fmt(event.endTime)}`,
        inline: true,
      },
    ],
    url: `https://xivvenuemanager.com/venues/${event.venue.slug}`,
    footer: { text: "XIV Venue Manager" },
    timestamp: new Date().toISOString(),
  })
}
