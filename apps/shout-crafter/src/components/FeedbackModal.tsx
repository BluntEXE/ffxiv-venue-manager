import { useState, useEffect } from 'react'
import { submitFeedback } from '../lib/feedback'
import type { FeedbackCategory } from '../lib/feedback'

interface Props {
  onClose: () => void
}

const CATEGORIES: { id: FeedbackCategory; label: string }[] = [
  { id: 'BUG_REPORT',      label: 'Bug Report' },
  { id: 'FEATURE_REQUEST', label: 'Feature Request' },
  { id: 'IMPROVEMENT',     label: 'Improvement' },
  { id: 'GENERAL',         label: 'General' },
]

const inputClass =
  'w-full bg-[var(--blue-004)] text-[var(--foreground)] placeholder-[var(--fg-faint)] rounded-[0.5rem] px-3 py-2 text-sm border border-[var(--blue-015)] focus:border-[var(--xiv-blue)] focus:outline-none focus:shadow-[0_0_0_3px_rgba(0,180,255,0.12)] transition-colors'

const pillBase = 'px-3 py-1.5 rounded-full text-sm font-medium transition-colors'
const pillActive = 'bg-[var(--xiv-blue)] text-[var(--xiv-navy)] font-semibold'
const pillInactive = 'bg-[var(--blue-006)] text-[var(--muted-foreground)] hover:bg-[var(--blue-010)]'

export function FeedbackModal({ onClose }: Props) {
  const [category, setCategory] = useState<FeedbackCategory>('BUG_REPORT')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Auto-close after success
  useEffect(() => {
    if (!success) return
    const t = setTimeout(onClose, 2000)
    return () => clearTimeout(t)
  }, [success, onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSubmit() {
    if (!subject.trim() || !description.trim()) {
      setError('Subject and description are required.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await submitFeedback({ category, subject: subject.trim(), description: description.trim() })
      setSuccess(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    // Scrim
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Modal panel */}
      <div className="w-full max-w-lg xiv-card !p-0 overflow-hidden animate-[fadeSlideUp_200ms_ease-out]">
        <div className="px-5 py-4 border-b border-[var(--blue-010)] flex items-center justify-between">
          <h2 className="font-semibold text-[1.02rem] text-[var(--foreground)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Send Feedback
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--fg-faint)] hover:text-[var(--foreground)] transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {success ? (
          <div className="px-5 py-10 flex flex-col items-center gap-2 text-center">
            <span className="text-2xl text-[var(--xiv-blue)]">✓</span>
            <p className="text-sm text-[var(--foreground)]">Feedback sent.</p>
            <p className="text-xs text-[var(--fg-faint)]">Thanks for helping improve Shout Crafter.</p>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Category */}
            <div className="space-y-1.5">
              <label className="block text-[0.68rem] font-semibold text-[var(--muted-foreground)] uppercase tracking-[0.07em]">Category</label>
              <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`${pillBase} ${category === c.id ? pillActive : pillInactive}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <label className="block text-[0.68rem] font-semibold text-[var(--muted-foreground)] uppercase tracking-[0.07em]">
                Subject <span className="text-[var(--destructive)]">*</span>
              </label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Brief summary"
                maxLength={120}
                className={inputClass}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="block text-[0.68rem] font-semibold text-[var(--muted-foreground)] uppercase tracking-[0.07em]">
                Description <span className="text-[var(--destructive)]">*</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What happened, or what would you like to see?"
                rows={4}
                className={`${inputClass} resize-y`}
              />
            </div>

            {error && (
              <p className="text-xs text-[var(--destructive)]">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSubmit}
                disabled={submitting || !subject.trim() || !description.trim()}
                className="flex-1 xiv-btn-shimmer px-4 py-2 bg-[var(--xiv-blue)] text-[var(--xiv-navy)] text-sm font-bold rounded-[0.5rem] disabled:opacity-40 transition-opacity"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {submitting ? 'Sending…' : 'Send Feedback'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-[var(--blue-006)] text-[var(--muted-foreground)] text-sm font-medium rounded-[0.5rem] hover:bg-[var(--blue-010)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
