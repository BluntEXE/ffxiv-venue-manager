import { useState } from 'react'
import { ScrollView, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { apiFetch } from '@/lib/api'

const EVENT_TYPES = ['PERFORMANCE', 'GAME_NIGHT', 'SPECIAL', 'SOCIAL', 'PRIVATE', 'OTHER'] as const

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <YStack gap="$1">
      <Text color="$subtext0" fontSize={12}>{label}</Text>
      {children}
    </YStack>
  )
}

function StyledInput({ value, onChangeText, placeholder, multiline }: {
  value: string; onChangeText: (v: string) => void; placeholder?: string; multiline?: boolean
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#6c7086"
      multiline={multiline}
      style={[styles.input, multiline && styles.multiline]}
    />
  )
}

// Format a Date to local datetime-local string for display
function toLocalInput(d: Date) {
  return d.toISOString().slice(0, 16)
}

export default function NewEventScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>()
  const router = useRouter()

  const now = new Date()
  const later = new Date(now.getTime() + 2 * 60 * 60 * 1000)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState<typeof EVENT_TYPES[number]>('PERFORMANCE')
  const [startTime, setStartTime] = useState(toLocalInput(now))
  const [endTime, setEndTime] = useState(toLocalInput(later))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/mobile/operator/events', {
        method: 'POST',
        body: JSON.stringify({
          venueId,
          title: title.trim(),
          description: description.trim() || undefined,
          eventType,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Failed to create event')
      }
      router.back()
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <YStack flex={1} backgroundColor="$base">
      <ScreenHeader>
        <Button size="$4" backgroundColor="$surface0" color="$text" borderRadius="$4" fontFamily="Inter" onPress={() => router.back()}>
          Cancel
        </Button>
        <Text fontFamily="Outfit_700Bold" fontSize={18} color="$text" flex={1}>New Event</Text>
        <Button
          size="$3"
          backgroundColor="$primary"
          color="$base"
          borderRadius="$3"
          onPress={save}
          disabled={saving}
          icon={saving ? <Spinner color="$base" size="small" /> : undefined}
        >
          {saving ? '' : 'Create'}
        </Button>
      </ScreenHeader>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
        {error && (
          <YStack backgroundColor="$surface0" borderRadius="$2" padding="$3" borderLeftWidth={3} borderLeftColor="$danger">
            <Text color="$danger" fontSize={13}>{error}</Text>
          </YStack>
        )}

        <Field label="TITLE">
          <StyledInput value={title} onChangeText={setTitle} placeholder="Event name" />
        </Field>

        <Field label="TYPE">
          <XStack flexWrap="wrap" gap="$2">
            {EVENT_TYPES.map((t) => (
              <Button
                key={t}
                size="$2"
                borderRadius="$4"
                backgroundColor={eventType === t ? '$primary' : '$surface0'}
                color={eventType === t ? '$base' : '$subtext0'}
                onPress={() => setEventType(t)}
              >
                {t.replace('_', ' ')}
              </Button>
            ))}
          </XStack>
        </Field>

        <Field label="START (UTC / Server Time)">
          <StyledInput value={startTime} onChangeText={setStartTime} placeholder="YYYY-MM-DDTHH:MM" />
        </Field>

        <Field label="END (UTC / Server Time)">
          <StyledInput value={endTime} onChangeText={setEndTime} placeholder="YYYY-MM-DDTHH:MM" />
        </Field>

        <Field label="DESCRIPTION (optional)">
          <StyledInput value={description} onChangeText={setDescription} placeholder="Details about the event..." multiline />
        </Field>
      </ScrollView>
    </YStack>
  )
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: '#0a0f1e',
    color: '#cdd6f4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,180,255,0.15)',
    padding: 12,
    fontSize: 14,
    fontFamily: 'Inter',
  },
  multiline: {
    height: 100,
    textAlignVertical: 'top',
  },
})
