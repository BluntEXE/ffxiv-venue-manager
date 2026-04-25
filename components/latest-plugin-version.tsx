// Server Component that renders the "what's the latest plugin version"
// badge on the homepage. Fetches the latest GitHub release once per hour
// (ISR via `next: { revalidate }`) so a new plugin release auto-shows up
// on xivvenuemanager.com without anyone editing this file.
//
// Hardcoded fallback exists for two cases: GitHub API outage and the
// initial cold render before the cache populates. Bump the fallback when
// you ship a new plugin version so the worst-case display still looks
// current.

const FALLBACK_TAG = "v3.5.0"
const FALLBACK_NAME = "v3.5.0 — Auto-load venues on startup"

type LatestRelease = {
  tag_name?: string
  name?: string
}

async function fetchLatest(): Promise<{ tag: string; title: string }> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/BluntEXE/XIVVenueManagerSync/releases/latest",
      {
        next: { revalidate: 3600 },
        headers: { Accept: "application/vnd.github+json" },
      }
    )
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const data: LatestRelease = await res.json()
    const tag = data.tag_name?.trim() || FALLBACK_TAG
    const title = (data.name?.trim() || tag).replace(/—/g, "-")
    return { tag, title }
  } catch (err) {
    // Swallowed: a GitHub outage must not break the homepage.
    console.warn("[LatestPluginVersion] fetch failed, using fallback:", err)
    return { tag: FALLBACK_TAG, title: FALLBACK_NAME.replace(/—/g, "-") }
  }
}

export async function LatestPluginVersion() {
  const { title } = await fetchLatest()
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
      {title}
    </span>
  )
}
