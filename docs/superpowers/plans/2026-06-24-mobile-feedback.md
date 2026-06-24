# Mobile Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a feedback screen accessible from Settings and wire it to the existing web feedback system via a new mobile API endpoint.

**Architecture:** New `POST /api/mobile/feedback` route uses `requireMobileAuth` and mirrors the existing `/api/feedback` web route (same Prisma model, same Discord webhook). New `feedback.tsx` screen is a standalone Expo Router route (not in tab nav). Settings page gets a subtle link in the About section. GlitchTip crash reporting is already live via `src/lib/error-reporter.ts` -- nothing to add.

**Tech Stack:** Next.js 15 API route, Prisma, React Native / Tamagui, Expo Router, existing `apiFetch` / `ScreenHeader` patterns.

---

## Files

| File | Action |
|------|--------|
| `apps/web/app/api/mobile/feedback/route.ts` | Create |
| `apps/mobile/app/feedback.tsx` | Create |
| `apps/mobile/app/(app)/settings.tsx` | Modify — add feedback link in About section |

---

### Task 1: POST /api/mobile/feedback

**Files:**
- Create: `apps/web/app/api/mobile/feedback/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// apps/web/app/api/mobile/feedback/route.ts
import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"
import { sendDiscordWebhook, formatFeedbackSubmittedEmbed } from "@/lib/discord-webhook"

const VALID_CATEGORIES = ["BUG_REPORT", "FEATURE_REQUEST", "IMPROVEMENT", "GENERAL"] as const

export async function POST(req: Request) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const body = await req.json().catch(() => ({}))
  const { category, subject, description } = body

  if (!category || !subject || !description) {
    return NextResponse.json({ error: "Missing required fields: category, subject, description" }, { status: 400 })
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 })
  }

  const userAgent = req.headers.get("user-agent") ?? undefined

  const feedback = await prisma.feedback.create({
    data: {
      userId,
      category,
      subject: String(subject).trim(),
      description: String(description).trim(),
      url: "mobile-app",
      userAgent,
    },
    include: {
      user: { select: { id: true, name: true, displayName: true, email: true } },
    },
  })

  const adminWebhookUrl = process.env.FEEDBACK_DISCORD_WEBHOOK_URL
  if (adminWebhookUrl) {
    const embed = formatFeedbackSubmittedEmbed({
      category: feedback.category,
      subject: feedback.subject,
      description: feedback.description,
      url: feedback.url,
      user: feedback.user,
    })
    void sendDiscordWebhook(adminWebhookUrl, { embeds: [embed] }).catch(() => {})
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/ehno/xiv-app && pnpm --filter @xiv-venue-manager/web exec tsc --noEmit 2>&1 | grep -v "node_modules" | grep "error" | head -10 || echo "clean"
```

Expected: `clean`

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/mobile/feedback/route.ts
git commit -m "feat(api): add POST /api/mobile/feedback endpoint"
```

---

### Task 2: Feedback screen

**Files:**
- Create: `apps/mobile/app/feedback.tsx`

- [ ] **Step 1: Create the screen file**

```typescript
// apps/mobile/app/feedback.tsx
"use client"
import { useState } from 'react'
import { ScrollView, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { useRouter } from 'expo-router'
import { apiFetch } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'

type Category = 'BUG_REPORT' | 'FEATURE_REQUEST' | 'IMPROVEMENT' | 'GENERAL'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'BUG_REPORT', label: 'Bug Report' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'IMPROVEMENT', label: 'Improvement' },
  { value: 'GENERAL', label: 'General' },
]

export default function FeedbackScreen() {
  const router = useRouter()
  const [category, setCategory] = useState<Category>('GENERAL')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isValid = subject.trim().length > 0 && description.trim().length >= 10

  async function submit() {
    if (!isValid) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await apiFetch('/api/mobile/feedback', {
        method: 'POST',
        body: JSON.stringify({ category, subject: subject.trim(), description: description.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to submit feedback')
        return
      }
      setSuccess(true)
      setTimeout(() => router.back(), 1500)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <YStack flex={1} backgroundColor="$base">
        <ScreenHeader>
          <Button size="$3" backgroundColor="$surface0" color="$text" borderRadius="$4" onPress={() => router.back()}>
            ‹ Back
          </Button>
          <Text fontFamily="Outfit_700Bold" fontSize={20} color="$text" flex={1}>
            Send Feedback
          </Text>
        </ScreenHeader>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>

          {success ? (
            <YStack flex={1} alignItems="center" justifyContent="center" padding="$8" gap="$3">
              <Text fontSize={32}>✓</Text>
              <Text fontFamily="Outfit_600SemiBold" fontSize={18} color="$success" textAlign="center">
                Thanks for your feedback!
              </Text>
              <Text color="$subtext0" fontSize={13} textAlign="center">
                We'll review it and get back to you if needed.
              </Text>
            </YStack>
          ) : (
            <>
              <YStack gap="$1">
                <Text color="$subtext0" fontSize={12}>CATEGORY</Text>
                <XStack flexWrap="wrap" gap="$2">
                  {CATEGORIES.map((c) => (
                    <Button
                      key={c.value}
                      size="$2"
                      borderRadius="$4"
                      backgroundColor={category === c.value ? 'rgba(0,180,255,0.12)' : 'transparent'}
                      color={category === c.value ? '$primary' : '$subtext0'}
                      borderWidth={1}
                      borderColor={category === c.value ? 'rgba(0,180,255,0.3)' : 'rgba(0,180,255,0.12)'}
                      onPress={() => setCategory(c.value)}
                      pressStyle={{ opacity: 0.85 }}
                    >
                      {c.label}
                    </Button>
                  ))}
                </XStack>
              </YStack>

              <YStack gap="$1">
                <Text color="$subtext0" fontSize={12}>SUBJECT</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Brief summary..."
                  placeholderTextColor="#6c7086"
                  value={subject}
                  onChangeText={setSubject}
                  maxLength={100}
                />
              </YStack>

              <YStack gap="$1">
                <Text color="$subtext0" fontSize={12}>DESCRIPTION</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  placeholder="Describe the issue or suggestion in detail (min 10 characters)..."
                  placeholderTextColor="#6c7086"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  textAlignVertical="top"
                />
              </YStack>

              {error && (
                <Text color="$danger" fontSize={13}>{error}</Text>
              )}

              <Button
                size="$4"
                backgroundColor={isValid ? '$primary' : '$surface1'}
                color={isValid ? '#070b14' : '$subtext0'}
                borderRadius="$3"
                onPress={submit}
                disabled={!isValid || submitting}
                icon={submitting ? <Spinner color={isValid ? '#070b14' : '$subtext0'} size="small" /> : undefined}
                pressStyle={{ opacity: 0.85 }}
              >
                {submitting ? '' : 'Submit Feedback'}
              </Button>
            </>
          )}
        </ScrollView>
      </YStack>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: '#0a0f1e',
    color: '#cdd6f4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,180,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: 'Inter',
  },
  multiline: {
    height: 120,
    textAlignVertical: 'top',
  },
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/ehno/xiv-app && pnpm --filter @xiv-venue-manager/mobile exec tsc --noEmit 2>&1 | grep -v "node_modules\|WARN\|vector-icons\|process\|TamaguiCustomConfig\|TamaguiInternalConfig\|defaultConfig\|_layout" | grep "error" | head -10 || echo "clean"
```

Expected: `clean`

- [ ] **Step 3: Sync corpus and commit**

```bash
cp "/home/ehno/xiv-app/apps/mobile/app/feedback.tsx" \
   "/home/ehno/xiv-graphify-corpus/mobile/app/feedback.tsx" 2>/dev/null || true
git add apps/mobile/app/feedback.tsx
git commit -m "feat(mobile): add feedback screen"
```

---

### Task 3: Add feedback link to Settings

**Files:**
- Modify: `apps/mobile/app/(app)/settings.tsx`

The About section currently ends with a Website row. Add a Divider and feedback link after it.

- [ ] **Step 1: Add router import and feedback link**

First check if `useRouter` is already imported -- it is (`import { useRouter, useFocusEffect } from 'expo-router'`).

Find the About section closing `</SectionCard>`:

```tsx
          <XStack
            padding="$4"
            alignItems="center"
            justifyContent="space-between"
            pressStyle={{ opacity: 0.7 }}
            onPress={() => WebBrowser.openBrowserAsync('https://xivvenuemanager.com')}
          >
            <Text color="$subtext0" fontSize={13}>Website</Text>
            <Text color="$primary" fontSize={13}>xivvenuemanager.com</Text>
          </XStack>
        </SectionCard>
```

Replace with:

```tsx
          <XStack
            padding="$4"
            alignItems="center"
            justifyContent="space-between"
            pressStyle={{ opacity: 0.7 }}
            onPress={() => WebBrowser.openBrowserAsync('https://xivvenuemanager.com')}
          >
            <Text color="$subtext0" fontSize={13}>Website</Text>
            <Text color="$primary" fontSize={13}>xivvenuemanager.com</Text>
          </XStack>
          <Divider />
          <XStack
            padding="$4"
            alignItems="center"
            justifyContent="space-between"
            pressStyle={{ opacity: 0.7 }}
            onPress={() => router.push('/feedback' as any)}
          >
            <Text color="$subtext0" fontSize={13}>Send Feedback</Text>
            <Text color="$overlay" fontSize={13}>›</Text>
          </XStack>
        </SectionCard>
```

- [ ] **Step 2: Ensure router is used in the component**

The `router` variable from `useRouter()` is already declared in `SettingsScreen`. No changes needed to declaration.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/ehno/xiv-app && pnpm --filter @xiv-venue-manager/mobile exec tsc --noEmit 2>&1 | grep -v "node_modules\|WARN\|vector-icons\|process\|TamaguiCustomConfig\|TamaguiInternalConfig\|defaultConfig\|_layout" | grep "error" | head -10 || echo "clean"
```

Expected: `clean`

- [ ] **Step 4: Sync corpus and commit**

```bash
cp "/home/ehno/xiv-app/apps/mobile/app/(app)/settings.tsx" \
   "/home/ehno/xiv-graphify-corpus/mobile/app/(app)/settings.tsx"
git add "apps/mobile/app/(app)/settings.tsx"
git commit -m "feat(mobile): add Send Feedback link in Settings"
```

---

### Task 4: Deploy web + push

- [ ] **Step 1: Push and deploy web**

```bash
git push && ssh server@192.168.1.122 "cd ~/xiv-app && git pull && docker compose build venue-manager && docker compose up -d venue-manager"
```

Expected: container restarts with new feedback API route live.

> **Note:** Do NOT trigger an EAS build in this task -- the user will queue it manually when ready.
