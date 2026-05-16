const API = 'https://xivvenuemanager.com/api/feedback'

export type FeedbackCategory = 'BUG_REPORT' | 'FEATURE_REQUEST' | 'IMPROVEMENT' | 'GENERAL'

export async function submitFeedback(data: {
  category: FeedbackCategory
  subject: string
  description: string
}): Promise<void> {
  const res = await fetch(API, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...data,
      url: 'https://shout.xivvenuemanager.com',
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to submit feedback.')
  }
}
