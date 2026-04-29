import { Fragment, type ReactNode } from "react"

/**
 * Render a Partake prose body (already stripped of flyer images and empty
 * `****` placeholders) into safe React nodes. Supports the markdown subset
 * that Partake emits in practice: `**bold**`, `*italic*` / `_italic_`,
 * `` `code` ``, and `[text](url)` links. Newlines become <br>.
 *
 * URLs are restricted to http/https to prevent javascript: injection.
 */
export function renderPartakeProse(text: string | null | undefined): ReactNode {
  if (!text) return null
  const lines = text.split("\n")
  return lines.map((line, i) => (
    <Fragment key={i}>
      {renderInline(line)}
      {i < lines.length - 1 && <br />}
    </Fragment>
  ))
}

const TOKEN_RE =
  /(`[^`]+`)|(\[[^\]]+\]\((?:https?:\/\/)[^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*|_[^_]+_)/

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let rest = text
  let key = 0
  while (rest.length > 0) {
    const match = rest.match(TOKEN_RE)
    if (!match || match.index === undefined) {
      out.push(rest)
      break
    }
    if (match.index > 0) {
      out.push(rest.slice(0, match.index))
    }
    const [, code, link, bold, italic] = match
    if (code) {
      out.push(
        <code key={key++} className="rounded bg-white/10 px-1 py-0.5 text-xs font-mono">
          {code.slice(1, -1)}
        </code>
      )
    } else if (link) {
      const close = link.indexOf("](")
      const label = link.slice(1, close)
      const url = link.slice(close + 2, -1)
      out.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:underline"
        >
          {renderInline(label)}
        </a>
      )
    } else if (bold) {
      out.push(
        <strong key={key++} className="font-semibold">
          {renderInline(bold.slice(2, -2))}
        </strong>
      )
    } else if (italic) {
      out.push(
        <em key={key++} className="italic">
          {italic.slice(1, -1)}
        </em>
      )
    }
    rest = rest.slice(match.index + match[0].length)
  }
  return out
}
