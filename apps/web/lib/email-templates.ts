const SITE_URL = process.env.NEXTAUTH_URL ?? "https://xivvenuemanager.com"

const p = (content: string, extra = "") =>
  `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #1a1a1a;${extra}">${content}</p>`

const wrapper = (body: string) => `
<div style="font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
  <div style="margin-bottom: 24px;">
    <span style="display: inline-block; padding: 4px 10px; background: #00b4ff; color: #fff; font-weight: 600; font-size: 12px; letter-spacing: 0.5px; border-radius: 4px;">XIV VENUE MANAGER</span>
  </div>
  ${body}
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0 16px;">
  <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #888;">
    XIV Venue Manager &middot; <a href="${SITE_URL}" style="color: #00b4ff;">${SITE_URL.replace(/^https?:\/\//, "")}</a>
  </p>
</div>
`

interface VenueWelcomeInput {
  venueName: string
  slug: string
  ownerName?: string | null
}

export function venueWelcomeEmail({ venueName, slug, ownerName }: VenueWelcomeInput) {
  const dashboardUrl = `${SITE_URL}/dashboard/${slug}`
  const guideUrl = `${SITE_URL}/guide/getting-started`
  const greeting = ownerName ? `Hi ${ownerName},` : "Hi,"

  return {
    subject: `${venueName} is ready on XIV Venue Manager`,
    html: wrapper(`
      <h2 style="margin: 0 0 20px; font-size: 22px; line-height: 1.3; color: #1a1a1a;">${venueName} is live</h2>
      ${p(greeting)}
      ${p("Your dashboard is ready. Add staff and start tracking sales.")}
      <p style="margin: 0 0 24px;">
        <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background: #00b4ff; color: #fff; font-weight: 600; text-decoration: none; border-radius: 6px;">Open dashboard</a>
      </p>
      ${p(`New here? The <a href="${guideUrl}" style="color: #00b4ff;">getting started guide</a> walks through setup.`)}
      ${p("Questions or something not working? Reply to this email and we'll help.")}
      ${p("- Ehno", " margin-bottom: 0;")}
    `),
    text: [
      `${greeting}`,
      ``,
      `${venueName} is live on XIV Venue Manager. Your dashboard is ready, add staff and start tracking sales.`,
      ``,
      `Dashboard: ${dashboardUrl}`,
      `Getting started guide: ${guideUrl}`,
      ``,
      `Questions or something not working? Reply to this email and we'll help.`,
      ``,
      `- Ehno`,
    ].join("\n"),
  }
}

interface NewVenueAlertInput {
  venueName: string
  slug: string
  ownerEmail: string
  dataCenter: string
  world: string
}

export function newVenueAlertEmail({ venueName, slug, ownerEmail, dataCenter, world }: NewVenueAlertInput) {
  return {
    subject: `New venue: ${venueName}`,
    html: wrapper(`
      <h2 style="margin: 0 0 20px; font-size: 22px; line-height: 1.3; color: #1a1a1a;">New venue signup</h2>
      ${p(`${ownerEmail} registered <strong>${venueName}</strong> (${dataCenter} - ${world}).`)}
      ${p(`<a href="${SITE_URL}/dashboard/${slug}" style="color: #00b4ff;">View venue dashboard</a>`, " margin-bottom: 0;")}
    `),
  }
}
