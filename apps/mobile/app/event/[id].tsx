import { useEffect, useState } from 'react'
import { ScrollView, TextInput, StyleSheet, Alert } from 'react-native'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { apiFetch } from '@/lib/api'
import { formatST } from '@/lib/server-time'

type EventDetail = {
  id: string
  title: string
  description: string | null
  eventType: string
  status: string
  startTime: string
  endTime: string
}

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        // Reuse public venue endpoint isn't available for events directly,
        // so load from the operator dashboard cache via a lightweight fetch
        const res = await apiFetch(`/api/mobile/operator/events/${id}`)
        if (res.ok) {
          const data = await res.json()
          setEvent(data)
          setTitle(data.title)
          setDescription(data.description ?? '')
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [id])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/mobile/operator/events/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null }),
      })
      if (!res.ok) throw new Error('Failed to save')
      router.back()
    } catch {
      setError('Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  function confirmCancel() {
    Alert.alert(
      'Cancel Event',
      'This will cancel the event. Staff and patrons will no longer see it. Continue?',
      [
        { text: 'Keep Event', style: 'cancel' },
        { text: 'Cancel Event', style: 'destructive', onPress: doCancel },
      ]
    )
  }

  async function doCancel() {
    setCancelling(true)
    try {
      const res = await apiFetch(`/api/mobile/operator/events/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      router.back()
    } catch {
      setError('Could not cancel event.')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$base" alignItems="center" justifyContent="center">
        <Spinner color="$primary" size="large" />
      </YStack>
    )
  }

  const isCancelled = event?.status === 'CANCELLED'

  return (
    <YStack flex={1} backgroundColor="$base">
      <ScreenHeader>
        <Button size="$3" backgroundColor="$surface0" color="$text" borderRadius="$4" onPress={() => router.back()}>
          ‹ Back
        </Button>
        <Text fontFamily="Outfit_700Bold" fontSize={18} color="$text" flex={1} numberOfLines={1}>
          {event?.title ?? 'Event'}
        </Text>
        {!isCancelled && (
          <Button
            size="$3" backgroundColor="$primary" color="$base" borderRadius="$3"
            onPress={save} disabled={saving}
            icon={saving ? <Spinner color="$base" size="small" /> : undefined}
          >
            {saving ? '' : 'Save'}
          </Button>
        )}
      </ScreenHeader>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
        {event && (
          <XStack gap="$2" alignItems="center">
            <Text color="$subtext0" fontSize={13}>
              {formatST(event.startTime)} – {formatST(event.endTime)} ST · {event.eventType.replace('_', ' ')}
            </Text>
            <XStack
              backgroundColor={isCancelled ? '#f38ba820' : '#89b4fa20'}
              borderRadius="$4" paddingHorizontal="$2" paddingVertical={2}
            >
              <Text fontSize={11} color={isCancelled ? '$danger' : '$info'}>{event.status}</Text>
            </XStack>
          </XStack>
        )}

        {error && (
          <YStack backgroundColor="$surface0" borderRadius="$2" padding="$3" borderLeftWidth={3} borderLeftColor="$danger">
            <Text color="$danger" fontSize={13}>{error}</Text>
          </YStack>
        )}

        {isCancelled ? (
          <Text color="$subtext0" textAlign="center" padding="$6">This event has been cancelled.</Text>
        ) : (
          <>
            <YStack gap="$1">
              <Text color="$subtext0" fontSize={12}>TITLE</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                style={styles.input}
                placeholderTextColor="#6c7086"
              />
            </YStack>

            <YStack gap="$1">
              <Text color="$subtext0" fontSize={12}>DESCRIPTION</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                multiline
                style={[styles.input, styles.multiline]}
                placeholderTextColor="#6c7086"
                placeholder="Event details..."
              />
            </YStack>

            <Button
              size="$4"
              backgroundColor="$surface0"
              color="$danger"
              borderRadius="$3"
              borderWidth={1}
              borderColor="$danger"
              onPress={confirmCancel}
              disabled={cancelling}
              icon={cancelling ? <Spinner color="$danger" size="small" /> : undefined}
              marginTop="$4"
            >
              {cancelling ? 'Cancelling…' : 'Cancel Event'}
            </Button>
          </>
        )}
      </ScrollView>
    </YStack>
  )
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: '#313244',
    color: '#cdd6f4',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    fontFamily: 'Inter',
  },
  multiline: { height: 100, textAlignVertical: 'top' },
})
