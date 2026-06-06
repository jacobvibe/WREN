/**
 * Spike 4 (client side): AWIN-cookie-preserving WebView
 *
 * Opens the AWIN tracking URL returned by the awin-click Edge Function.
 * The WebView follows the awin1.com → merchant redirect, collecting the
 * AWIN tracking cookie. Cookies persist for the lifetime of this WebView
 * instance, so a purchase on the merchant site is properly attributed.
 */
import { useState, useEffect, useCallback } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import WebView from 'react-native-webview'
import { supabase } from '../lib/supabase'
import { View, Text, Pressable } from '../tw'

type Props = {
  merchantId: string | number
  productUrl: string
  /** Attribution fields recorded in affiliate_clicks by the Edge Function. */
  productId?: string
  retailer?: string
  category?: string
  onClose?: () => void
}

export function AwinWebView({ merchantId, productUrl, productId, retailer, category, onClose }: Props) {
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const openLink = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fnError } = await supabase.functions.invoke('awin-click', {
      body: { merchantId, productUrl, productId, retailer, category },
    })

    if (fnError || !data?.trackingUrl) {
      setError(fnError?.message ?? 'Failed to build tracking URL')
      setLoading(false)
      return
    }

    setTrackingUrl(data.trackingUrl)
    setLoading(false)
  }, [merchantId, productUrl, productId, retailer, category])

  // Fire on mount. (useState lazy initialisers do NOT run effects — must be useEffect.)
  useEffect(() => { openLink() }, [openLink])

  if (error) {
    return (
      <View className="flex-1 items-center justify-center gap-4 p-6">
        <Text className="text-sf-red text-base">{error}</Text>
        <Pressable className="px-6 py-3 bg-sf-blue rounded-xl" onPress={openLink}>
          <Text className="text-white font-semibold">Retry</Text>
        </Pressable>
      </View>
    )
  }

  if (loading || !trackingUrl) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-sf-text-2 mt-2">Preparing affiliate link…</Text>
      </View>
    )
  }

  return (
    <View className="flex-1">
      <WebView
        source={{ uri: trackingUrl }}
        style={StyleSheet.absoluteFill}
        // Preserve cookies across redirects (awin1.com → merchant)
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        // Don't open external browser — stay in WebView to keep cookie jar
        onShouldStartLoadWithRequest={() => true}
      />
      {onClose && (
        <Pressable
          className="absolute top-4 right-4 w-8 h-8 bg-black/40 rounded-full items-center justify-center"
          onPress={onClose}
        >
          <Text className="text-white font-bold">✕</Text>
        </Pressable>
      )}
    </View>
  )
}
