import { useState, useEffect } from 'react'
import { ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { YStack, XStack, Text, Button, Spinner, Input } from 'tamagui'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { apiFetch } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'

type Service = { id: string; name: string; price: string }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <YStack gap="$1">
      <Text color="$subtext0" fontSize={12}>{label}</Text>
      {children}
    </YStack>
  )
}

function formatGil(price: string | number): string {
  return `${Number(price).toLocaleString()} gil`
}

export default function LogSaleScreen() {
  const router = useRouter()
  const { venueId, venueName } = useLocalSearchParams<{ venueId: string; venueName: string }>()

  const [services, setServices] = useState<Service[]>([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [amount, setAmount] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch(`/api/mobile/venues/${venueId}/services`)
      .then((r) => r.json())
      .then((data) => setServices(Array.isArray(data) ? data : []))
      .catch(() => setServices([]))
      .finally(() => setServicesLoading(false))
  }, [venueId])

  function selectService(s: Service | null) {
    setSelectedService(s)
    if (s) setAmount(Number(s.price).toFixed(0))
    else setAmount('')
  }

  async function submit() {
    const parsedAmount = parseFloat(amount)
    if (!customerName.trim()) { setError('Customer name is required.'); return }
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setError('Enter a valid amount.'); return }
    setError(null)
    setSubmitting(true)
    try {
      const res = await apiFetch(`/api/mobile/venues/${venueId}/transactions`, {
        method: 'POST',
        body: JSON.stringify({
          serviceId: selectedService?.id,
          amount: parsedAmount,
          customerName: customerName.trim(),
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to log sale.'); return }
      router.back()
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
          <Button
            size="$3"
            backgroundColor="$surface0"
            color="$text"
            borderRadius="$4"
            onPress={() => router.back()}
          >
            Cancel
          </Button>
          <YStack flex={1}>
            <Text fontFamily="Outfit_700Bold" fontSize={18} color="$text">Log Sale</Text>
            {venueName ? <Text color="$subtext0" fontSize={12}>{venueName}</Text> : null}
          </YStack>
          <Button
            size="$3"
            backgroundColor="$primary"
            color="$base"
            borderRadius="$3"
            onPress={submit}
            disabled={submitting}
            icon={submitting ? <Spinner color="$base" size="small" /> : undefined}
          >
            {submitting ? '' : 'Log'}
          </Button>
        </ScreenHeader>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>

          {error && (
            <YStack backgroundColor="$surface0" borderRadius="$2" padding="$3" borderLeftWidth={3} borderLeftColor="$danger">
              <Text color="$danger" fontSize={13}>{error}</Text>
            </YStack>
          )}

          <Field label="SERVICE (OPTIONAL)">
            {servicesLoading ? (
              <Spinner color="$primary" />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <XStack gap="$2">
                  <Button
                    size="$2"
                    borderRadius="$4"
                    backgroundColor={!selectedService ? '$primary' : '$surface0'}
                    color={!selectedService ? '$base' : '$subtext0'}
                    onPress={() => selectService(null)}
                    pressStyle={{ opacity: 0.85, scale: 0.97 }}
                  >
                    None
                  </Button>
                  {services.map((s) => (
                    <Button
                      key={s.id}
                      size="$2"
                      borderRadius="$4"
                      backgroundColor={selectedService?.id === s.id ? '$primary' : '$surface0'}
                      color={selectedService?.id === s.id ? '$base' : '$text'}
                      onPress={() => selectService(s)}
                      pressStyle={{ opacity: 0.85, scale: 0.97 }}
                    >
                      {s.name} · {formatGil(s.price)}
                    </Button>
                  ))}
                </XStack>
              </ScrollView>
            )}
          </Field>

          <Field label="AMOUNT (GIL)">
            <Input
              backgroundColor="$surface0"
              borderWidth={0}
              color="$text"
              placeholderTextColor="#6c7086"
              placeholder="0"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              fontSize={14}
              height={44}
            />
          </Field>

          <Field label="CUSTOMER NAME">
            <Input
              backgroundColor="$surface0"
              borderWidth={0}
              color="$text"
              placeholderTextColor="#6c7086"
              placeholder="Forename Surname"
              value={customerName}
              onChangeText={setCustomerName}
              fontSize={14}
              height={44}
              autoCapitalize="words"
            />
          </Field>

          <Field label="NOTES (OPTIONAL)">
            <Input
              backgroundColor="$surface0"
              borderWidth={0}
              color="$text"
              placeholderTextColor="#6c7086"
              placeholder="Any extra details…"
              value={notes}
              onChangeText={setNotes}
              fontSize={14}
              height={80}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </Field>

        </ScrollView>
      </YStack>
    </KeyboardAvoidingView>
  )
}
