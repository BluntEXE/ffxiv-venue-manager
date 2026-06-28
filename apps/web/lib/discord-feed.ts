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
