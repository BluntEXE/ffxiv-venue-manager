"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"

// ── DC / World data ──────────────────────────────────────────────
const DATA_CENTERS = [
  { region: "North America", dcs: ["Aether", "Primal", "Crystal", "Dynamis"] },
  { region: "Europe",        dcs: ["Chaos", "Light"] },
  { region: "Japan",         dcs: ["Elemental", "Gaia", "Mana", "Meteor"] },
  { region: "Oceania",       dcs: ["Materia"] },
]

const WORLDS: Record<string, string[]> = {
  Aether:    ["Adamantoise","Cactuar","Faerie","Gilgamesh","Jenova","Midgardsormr","Sargatanas","Siren"],
  Primal:    ["Behemoth","Excalibur","Exodus","Famfrit","Hyperion","Lamia","Leviathan","Ultros"],
  Crystal:   ["Balmung","Brynhildr","Coeurl","Diabolos","Goblin","Malboro","Mateus","Zalera"],
  Dynamis:   ["Cuchulainn","Golem","Halicarnassus","Kraken","Maduin","Marilith","Rafflesia","Seraph"],
  Chaos:     ["Cerberus","Louisoix","Moogle","Omega","Phantom","Ragnarok","Sagittarius","Spriggan"],
  Light:     ["Alpha","Lich","Odin","Phoenix","Raiden","Shiva","Twintania","Zodiark"],
  Elemental: ["Aegis","Atomos","Carbuncle","Garuda","Gungnir","Kujata","Tonberry","Typhon"],
  Gaia:      ["Alexander","Bahamut","Durandal","Fenrir","Ifrit","Ridill","Tiamat","Ultima"],
  Mana:      ["Anima","Asura","Chocobo","Hades","Ixion","Masamune","Pandaemonium","Titan"],
  Meteor:    ["Belias","Mandragora","Ramuh","Shinryu","Unicorn","Valefor","Yojimbo","Zeromus"],
  Materia:   ["Bismarck","Ravana","Sephirot","Sophia","Zurvan"],
}

const PRESET_TAGS = ["18+","Bar","Lounge","Club","RP","Live Music","DJ","Cabaret","Tavern","Inn"]

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 48)
}

const STEP_META = [
  { label: "Venue basics",     sub: "Tell patrons who you are. You can change all of this later in Settings." },
  { label: "Location & hours", sub: "Where to find you in Eorzea, and when your doors are open." },
  { label: "Review & create",  sub: "Check your details before we create the venue." },
]

// ── Component ────────────────────────────────────────────────────
export function GetStartedWizard({ userName }: { userName: string }) {
  const router = useRouter()

  const [step, setStep]           = useState(1)
  const [done, setDone]           = useState(false)
  const [creating, setCreating]   = useState(false)
  const [error, setError]         = useState("")
  const [createdSlug, setCreatedSlug] = useState("")

  // Step 1
  const [name, setName]       = useState("")
  const [tagline, setTagline] = useState("")
  const [tags, setTags]       = useState<string[]>([])

  // Step 2
  const [dc, setDc]           = useState("")
  const [world, setWorld]     = useState("")
  const [plot, setPlot]       = useState("")
  const [hours, setHours]     = useState("")
  const [nights, setNights]   = useState("")
  const [adult, setAdult]     = useState(false)

  const toggleTag = (t: string) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const goNext = async () => {
    if (step === 1) {
      if (!name.trim()) { setError("Venue name is required."); return }
      setError("")
      setStep(2)
    } else if (step === 2) {
      if (!dc) { setError("Please select a Data Centre."); return }
      if (!world) { setError("Please select a World."); return }
      setError("")
      setStep(3)
    } else {
      // Create venue
      setCreating(true)
      setError("")
      const slug = slugify(name)
      try {
        const res = await fetch("/api/venues", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            slug,
            description: tagline.trim() || null,
            dataCenter: dc,
            world,
            location: plot.trim() || null,
            settings: {
              tagline: tagline.trim() || undefined,
              tags: adult ? ["18+", ...tags.filter(t => t !== "18+")] : tags.filter(t => t !== "18+"),
              defaultHours: hours.trim() || undefined,
              openNights: nights.trim() || undefined,
              isAdult: adult,
            },
          }),
        })
        if (!res.ok) {
          const d = await res.json()
          // Slug collision — append timestamp suffix and retry
          if (d.error?.includes("slug")) {
            const slugRetry = slug + "-" + Date.now().toString(36).slice(-4)
            const res2 = await fetch("/api/venues", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: name.trim(), slug: slugRetry, description: tagline.trim() || null,
                dataCenter: dc, world, location: plot.trim() || null,
              }),
            })
            if (!res2.ok) { const d2 = await res2.json(); throw new Error(d2.error || "Failed") }
            const v2 = await res2.json()
            setCreatedSlug(v2.slug)
          } else {
            throw new Error(d.error || "Failed to create venue")
          }
        } else {
          const v = await res.json()
          setCreatedSlug(v.slug)
        }
        setDone(true)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to create venue")
      } finally {
        setCreating(false)
      }
    }
  }

  // ── Done state ────────────────────────────────────────────────
  if (done) {
    return (
      <div className="gs-wrap">
        <div className="gs-bg" />
        <main className="gs-main">
          <div className="gs-card">
            <div style={{ textAlign: "center", padding: "44px 38px" }}>
              <div style={{ width: 68, height: 68, borderRadius: 999, margin: "0 auto 22px", display: "grid", placeItems: "center", background: "var(--success-soft)", border: "1px solid rgba(16,185,129,0.3)" }}>
                <Check style={{ width: 32, height: 32, color: "var(--success-text)" }} />
              </div>
              <h1 className="font-cinzel" style={{ fontWeight: 700, fontSize: "1.7rem", letterSpacing: "0.02em" }}>{name} is live</h1>
              <p style={{ color: "var(--muted-foreground)", fontSize: "0.96rem", lineHeight: 1.6, margin: "14px auto 26px", maxWidth: "36ch" }}>
                Your venue is ready. Open the dashboard to schedule events, invite staff, and go live.
              </p>
              <button
                onClick={() => router.push(`/dashboard/${createdSlug}`)}
                className="xiv-btn-shimmer xiv-cta"
                style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 24px", borderRadius: "var(--radius-md)", fontWeight: 600, fontSize: "1rem", border: "none", cursor: "pointer" }}
              >
                Enter dashboard <ArrowRight style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </div>
        </main>
        <GsFooter />
      </div>
    )
  }

  const meta = STEP_META[step - 1]

  return (
    <div className="gs-wrap">
      <div className="gs-bg" />
      <main className="gs-main">
        <div className="gs-card">
          {/* Progress + head */}
          <div className="gs-wiz-head">
            <div className="gs-progress">
              {[1, 2, 3].map(n => (
                <div key={n} className={`gs-pstep${step > n ? " done" : step === n ? " active" : ""}`}>
                  <span className="gs-pf" />
                </div>
              ))}
            </div>
            <div className="gs-wiz-meta">Step {step} of 3</div>
            <div className="gs-wiz-title">{meta.label}</div>
            <div className="gs-wiz-sub">{meta.sub}</div>
          </div>

          {/* Body */}
          <div className="gs-wiz-body">
            {error && (
              <p style={{ fontSize: "0.82rem", color: "var(--destructive)", marginBottom: 14, padding: "10px 13px", background: "var(--destructive-soft)", border: "1px solid rgba(243,139,168,0.2)", borderRadius: "var(--radius-md)" }}>
                {error}
              </p>
            )}

            {step === 1 && (
              <>
                <div className="gs-field">
                  <label>Venue name</label>
                  <input className="gs-inp" placeholder="e.g. The Drowning Wench" value={name} onChange={e => setName(e.target.value)} autoFocus />
                </div>
                <div className="gs-field">
                  <label>Tagline <span style={{ color: "var(--fg-faint)", fontWeight: 400 }}>(optional)</span></label>
                  <input className="gs-inp" placeholder="A dockside tavern for wayward souls" value={tagline} onChange={e => setTagline(e.target.value)} />
                </div>
                <div className="gs-field">
                  <label>Tags</label>
                  <div className="gs-tagpick">
                    {PRESET_TAGS.map(t => (
                      <span
                        key={t}
                        onClick={() => toggleTag(t)}
                        className={`gs-tg${tags.includes(t) ? " sel" : ""}${t === "18+" ? " adult" : ""}`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="gs-hint">Pick a few that describe your venue.</div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="gs-field-2">
                  <div className="gs-field">
                    <label>Data Centre</label>
                    <select className="gs-sel" value={dc} onChange={e => { setDc(e.target.value); setWorld("") }}>
                      <option value="">Select…</option>
                      {DATA_CENTERS.map(({ region, dcs }) => (
                        <optgroup key={region} label={region}>
                          {dcs.map(d => <option key={d} value={d}>{d}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="gs-field">
                    <label>World</label>
                    <select className="gs-sel" value={world} onChange={e => setWorld(e.target.value)} disabled={!dc}>
                      <option value="">Select…</option>
                      {(WORLDS[dc] ?? []).map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                </div>
                <div className="gs-field">
                  <label>District, Ward &amp; Plot <span style={{ color: "var(--fg-faint)", fontWeight: 400 }}>(optional)</span></label>
                  <input className="gs-inp" placeholder="e.g. Goblet · Ward 5 · Plot 31" value={plot} onChange={e => setPlot(e.target.value)} />
                </div>
                <div className="gs-field-2">
                  <div className="gs-field">
                    <label>Opening hours <span style={{ color: "var(--fg-faint)", fontWeight: 400 }}>(ST)</span></label>
                    <input className="gs-inp" placeholder="10PM – 2AM" value={hours} onChange={e => setHours(e.target.value)} />
                  </div>
                  <div className="gs-field">
                    <label>Open nights</label>
                    <input className="gs-inp" placeholder="Fri &amp; Sat" value={nights} onChange={e => setNights(e.target.value)} />
                  </div>
                </div>
                <div className="gs-toggle-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.88rem" }}>Adult (18+) venue</div>
                    <div style={{ fontSize: "0.74rem", color: "var(--fg-faint)", marginTop: 2 }}>Shows the 18+ badge on your public listing.</div>
                  </div>
                  <button type="button" onClick={() => setAdult(!adult)} className={`toggle${adult ? " on" : ""}`} />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                {[
                  { k: "Venue",    v: name || "—" },
                  { k: "Location", v: [dc, world, plot].filter(Boolean).join(" · ") || "—" },
                  { k: "Hours",    v: [hours, nights].filter(Boolean).join(" · ") || "TBD" },
                  { k: "Tags",     v: tags.length ? null : "None" },
                ].map(({ k, v }) => (
                  <div key={k} className="gs-review-row">
                    <span style={{ color: "var(--fg-faint)" }}>{k}</span>
                    <span style={{ fontWeight: 500, textAlign: "right" }}>
                      {v ?? (
                        <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {tags.map(t => <span key={t} className={`tag${t === "18+" ? " adult" : ""}`}>{t}</span>)}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                <p style={{ color: "var(--muted-foreground)", fontSize: "0.9rem", marginTop: 16, lineHeight: 1.55 }}>
                  Ready? We'll create your venue and take you straight to the dashboard. Install the Dalamud plugin and invite staff from there.
                </p>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="gs-wiz-foot">
            {step > 1
              ? <button className="btn btn-outline gs-btn" onClick={() => { setError(""); setStep(step - 1) }}><ArrowLeft style={{ width: 16, height: 16 }} /> Back</button>
              : <span />
            }
            <button
              className="xiv-btn-shimmer xiv-cta gs-btn"
              onClick={goNext}
              disabled={creating}
              style={{ border: "none", cursor: creating ? "not-allowed" : "pointer" }}
            >
              {creating ? "Creating…" : step === 3 ? "Create venue" : "Continue"}
              {!creating && (step === 3 ? <Check style={{ width: 16, height: 16 }} /> : <ArrowRight style={{ width: 16, height: 16 }} />)}
            </button>
          </div>
        </div>
      </main>
      <GsFooter />
    </div>
  )
}

function GsFooter() {
  return (
    <footer style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "22px", fontSize: "0.74rem", color: "var(--fg-faint)", lineHeight: 1.6 }}>
      XIV Venue Manager is not affiliated with SQUARE ENIX CO., LTD. · FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd.
    </footer>
  )
}
