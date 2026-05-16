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

const inputClass = 'w-full bg-[#1e1e2e] text-[#cdd6f4] placeholder-[#6c7086] rounded px-3 py-2 text-sm border border-[#45475a] focus:border-[#cba6f7] focus:outline-none'

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
      <div className="w-full max-w-lg bg-[#313244] rounded-lg shadow-2xl overflow-hidden animate-[fadeSlideUp_200ms_ease-out]">
        <div className="px-5 py-4 border-b border-[#45475a] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#cdd6f4]">Send Feedback</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[#6c7086] hover:text-[#cdd6f4] transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {success ? (
          <div className="px-5 py-10 flex flex-col items-center gap-2 text-center">
            <span className="text-2xl text-[#a6e3a1]">✓</span>
            <p className="text-sm text-[#cdd6f4]">Feedback sent.</p>
            <p className="text-xs text-[#6c7086]">Thanks for helping improve Shout Crafter.</p>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Category */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#a6adc8] uppercase tracking-wide">Category</label>
              <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      category === c.id
                        ? 'bg-[#cba6f7] text-[#1e1e2e]'
                        : 'bg-[#45475a] text-[#cdd6f4] hover:bg-[#585b70]'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#a6adc8] uppercase tracking-wide">
                Subject <span className="text-[#f38ba8]">*</span>
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
              <label className="block text-xs font-medium text-[#a6adc8] uppercase tracking-wide">
                Description <span className="text-[#f38ba8]">*</span>
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
              <p className="text-xs text-[#f38ba8]">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSubmit}
                disabled={submitting || !subject.trim() || !description.trim()}
                className="flex-1 px-4 py-2 bg-[#cba6f7] text-[#1e1e2e] text-sm font-semibold rounded hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {submitting ? 'Sending…' : 'Send Feedback'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-[#45475a] text-[#cdd6f4] text-sm rounded hover:bg-[#585b70] transition-colors"
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
