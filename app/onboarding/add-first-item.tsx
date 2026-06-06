import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { View, Text } from '../../src/tw'
import { supabase } from '../../src/lib/supabase'
import { useSession } from '../../src/lib/session'
import { onboardingStore } from '../../src/lib/onboarding-store'

const ACCENT = '#c8f04d'

type Step =
  | { kind: 'idle' }
  | { kind: 'preview'; uri: string; base64: string }
  | { kind: 'processing'; uri: string; base64: string }
  | { kind: 'result'; cutout: string }

const PICKER_OPTS: ImagePicker.ImagePickerOptions = {
  mediaTypes: 'images',
  allowsEditing: true,
  aspect: [3, 4],
  quality: 0.8,
  base64: true,
}

const CAP_TITLE   = 'Wardrobe full'
const CAP_MESSAGE = 'Free accounts can store up to 150 items. Remove some items or upgrade to Pro for unlimited storage.'

export default function AddFirstItemScreen() {
  const router = useRouter()
  const { session } = useSession()
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [errorMsg, setErrorMsg] = useState('')
  // "Paste a link" entry
  const [linkMode, setLinkMode] = useState(false)
  const [url, setUrl] = useState('')
  const [fetchingLink, setFetchingLink] = useState(false)

  async function fetchFromLink() {
    const trimmed = url.trim()
    if (!/^https?:\/\//i.test(trimmed)) {
      setErrorMsg('Enter a valid link starting with https://')
      return
    }
    setFetchingLink(true)
    setErrorMsg('')
    const { data, error } = await supabase.functions.invoke('fetch-product', {
      body: { url: trimmed },
    })
    setFetchingLink(false)
    if (error || !data?.cutout) {
      setErrorMsg(
        data?.error === 'item_cap_reached'
          ? CAP_MESSAGE
          : data?.error ?? error?.message ?? "Couldn't read that link — try taking a photo instead.",
      )
      return
    }
    onboardingStore.cutoutUri = data.cutout
    onboardingStore.prefillName = data.title ?? ''
    setLinkMode(false)
    setUrl('')
    router.push('/onboarding/tag-item')
  }

  async function openCamera() {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync()
    if (!granted) {
      Alert.alert('Camera access needed', 'Enable camera access in Settings to take photos.')
      return
    }
    const result = await ImagePicker.launchCameraAsync(PICKER_OPTS)
    handlePickerResult(result)
  }

  async function openLibrary() {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!granted) {
      Alert.alert('Photo library access needed', 'Enable photo access in Settings.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTS)
    handlePickerResult(result)
  }

  function handlePickerResult(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    if (!asset.base64) {
      Alert.alert('Error', 'Could not read image data. Please try again.')
      return
    }
    setErrorMsg('')
    setStep({ kind: 'preview', uri: asset.uri, base64: asset.base64 })
  }

  async function processImage() {
    if (step.kind !== 'preview') return
    const { uri, base64 } = step

    if (session) {
      const { count } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
      if ((count ?? 0) >= 150) {
        Alert.alert(CAP_TITLE, CAP_MESSAGE, [{ text: 'OK' }])
        return
      }
    }

    setStep({ kind: 'processing', uri, base64 })

    const { data, error } = await supabase.functions.invoke('remove-bg', {
      body: { imageBase64: base64 },
    })

    if (error || !data?.cutout) {
      const msg = data?.error ?? error?.message ?? 'Background removal failed. Please try again.'
      setErrorMsg(msg)
      setStep({ kind: 'preview', uri, base64 })
      return
    }

    setStep({ kind: 'result', cutout: data.cutout })
  }

  function reset() {
    setStep({ kind: 'idle' })
    setErrorMsg('')
  }

  // ── Paste a link ─────────────────────────────────────────────────────────────
  if (linkMode) {
    return (
      <SafeAreaView style={s.root}>
        <View className="flex-1 px-6" style={{ paddingTop: 40 }}>
          <View style={{ marginBottom: 40 }}>
            <Text style={s.heading}>Paste a{'\n'}product link</Text>
            <Text style={s.sub}>We'll pull in the image and name automatically.</Text>
          </View>

          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://…"
            placeholderTextColor="#3a3a3a"
            style={s.linkInput}
            selectionColor={ACCENT}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={fetchFromLink}
            editable={!fetchingLink}
          />
          {errorMsg ? <Text style={[s.errorText, { textAlign: 'left', marginTop: 12 }]}>{errorMsg}</Text> : null}

          <View style={{ flex: 1 }} />

          <Pressable
            onPress={fetchFromLink}
            disabled={fetchingLink || !url.trim()}
            style={({ pressed }) => [s.primaryBtn, { opacity: fetchingLink || !url.trim() ? 0.5 : pressed ? 0.85 : 1 }]}
          >
            {fetchingLink
              ? <ActivityIndicator color="#0a0a0a" />
              : <Text style={s.primaryBtnLabel}>Fetch item</Text>}
          </Pressable>
          <Pressable
            onPress={() => { setLinkMode(false); setErrorMsg('') }}
            disabled={fetchingLink}
            style={({ pressed }) => [s.ghostBtn, { opacity: fetchingLink || pressed ? 0.4 : 1 }]}
          >
            <Text style={s.ghostBtnLabel}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // ── Idle ─────────────────────────────────────────────────────────────────────
  if (step.kind === 'idle') {
    return (
      <SafeAreaView style={s.root}>
        <View className="flex-1 px-6" style={{ paddingTop: 40 }}>
          <View style={{ marginBottom: 52 }}>
            <Text style={s.heading}>Add your{'\n'}first item</Text>
            <Text style={s.sub}>Take a photo of any piece of clothing.</Text>
          </View>

          <View className="flex-1 items-center justify-center" style={{ gap: 16 }}>
            <Pressable
              onPress={openCamera}
              style={({ pressed }) => [s.cameraBtn, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={s.cameraBtnLabel}>Take Photo</Text>
            </Pressable>

            <Pressable
              onPress={openLibrary}
              style={({ pressed }) => [s.libraryBtn, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={s.libraryBtnLabel}>Choose from Library</Text>
            </Pressable>

            <Pressable
              onPress={() => { setLinkMode(true); setErrorMsg('') }}
              style={({ pressed }) => [s.libraryBtn, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={s.libraryBtnLabel}>Paste a link</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  // ── Preview + Processing ──────────────────────────────────────────────────────
  if (step.kind === 'preview' || step.kind === 'processing') {
    const isProcessing = step.kind === 'processing'
    return (
      <SafeAreaView style={s.root}>
        <View className="flex-1">
          {/* Photo preview — fills remaining space above controls */}
          <View style={s.imageContainer}>
            <Image source={{ uri: step.uri }} style={s.image} contentFit="cover" />
            {isProcessing && (
              <View style={s.processingOverlay}>
                <ActivityIndicator color={ACCENT} size="large" />
                <Text style={s.processingLabel}>Removing background…</Text>
              </View>
            )}
          </View>

          {/* Controls */}
          <View className="px-6" style={{ paddingTop: 20, paddingBottom: 12, gap: 10 }}>
            {errorMsg ? <Text style={s.errorText}>{errorMsg}</Text> : null}

            <Pressable
              onPress={processImage}
              disabled={isProcessing}
              style={({ pressed }) => [
                s.primaryBtn,
                { opacity: isProcessing || pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={s.primaryBtnLabel}>Use this photo</Text>
            </Pressable>

            <Pressable
              onPress={reset}
              disabled={isProcessing}
              style={({ pressed }) => [s.ghostBtn, { opacity: isProcessing || pressed ? 0.4 : 1 }]}
            >
              <Text style={s.ghostBtnLabel}>Retake</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  // ── Result ────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root}>
      <View className="flex-1">
        {/* Cutout on light bg so transparency is visible */}
        <View style={[s.imageContainer, s.cutoutBg]}>
          <Image source={{ uri: step.cutout }} style={s.image} contentFit="contain" />
        </View>

        <View className="px-6" style={{ paddingTop: 20, paddingBottom: 12, gap: 10 }}>
          <Text style={s.successLabel}>Background removed ✓</Text>

          <Pressable
            onPress={() => {
              onboardingStore.cutoutUri = step.cutout
              router.push('/onboarding/tag-item')
            }}
            style={({ pressed }) => [s.primaryBtn, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={s.primaryBtnLabel}>Looks good</Text>
          </Pressable>

          <Pressable
            onPress={reset}
            style={({ pressed }) => [s.ghostBtn, { opacity: pressed ? 0.4 : 1 }]}
          >
            <Text style={s.ghostBtnLabel}>Try again</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  heading: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
    marginBottom: 10,
  },
  sub: {
    color: '#555555',
    fontSize: 15,
    lineHeight: 20,
  },

  // Idle
  cameraBtn: {
    width: '100%',
    height: 56,
    backgroundColor: ACCENT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBtnLabel: {
    color: '#0a0a0a',
    fontSize: 17,
    fontWeight: '700',
  },
  libraryBtn: {
    width: '100%',
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryBtnLabel: {
    color: '#888888',
    fontSize: 16,
    fontWeight: '500',
  },
  linkInput: {
    height: 52,
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    paddingHorizontal: 16,
    color: '#ffffff',
    fontSize: 16,
  },

  // Image area
  imageContainer: {
    flex: 1,
    backgroundColor: '#111111',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  cutoutBg: {
    backgroundColor: '#f0ede8',
  },

  // Processing overlay
  processingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  processingLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },

  // Controls
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  successLabel: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
  },
  primaryBtn: {
    height: 56,
    backgroundColor: ACCENT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnLabel: {
    color: '#0a0a0a',
    fontSize: 17,
    fontWeight: '700',
  },
  ghostBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnLabel: {
    color: '#555555',
    fontSize: 15,
  },
})
