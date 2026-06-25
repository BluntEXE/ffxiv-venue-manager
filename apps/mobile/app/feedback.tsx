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
          <Button size="$4" backgroundColor="$surface0" color="$text" borderRadius="$4" fontFamily="Inter" onPress={() => router.back()}>
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
                      size="$3"
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
