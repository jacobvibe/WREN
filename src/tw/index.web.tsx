/**
 * Web platform shim for NativeWind components.
 * react-native-css has a Windows Metro path bug; this shim passes through
 * plain RN components with className mapped to style via a no-op so the
 * app builds on web for dev/testing.
 *
 * On iOS/Android the real index.tsx (react-native-css) is used.
 */
import React from 'react'
import {
  View as RNView,
  Text as RNText,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  TextInput as RNTextInput,
  TouchableHighlight as RNTouchableHighlight,
} from 'react-native'

// On web, className is passed through to the underlying DOM via react-native-web
export type ViewProps = React.ComponentProps<typeof RNView> & { className?: string }
export const View = ({ className, ...props }: ViewProps) => <RNView {...props} />
View.displayName = 'View'

export const Text = ({ className, ...props }: React.ComponentProps<typeof RNText> & { className?: string }) =>
  <RNText {...props} />
Text.displayName = 'Text'

export const ScrollView = ({ className, contentContainerClassName, ...props }: React.ComponentProps<typeof RNScrollView> & { className?: string; contentContainerClassName?: string }) =>
  <RNScrollView {...props} />
ScrollView.displayName = 'ScrollView'

export const Pressable = ({ className, ...props }: React.ComponentProps<typeof RNPressable> & { className?: string }) =>
  <RNPressable {...props} />
Pressable.displayName = 'Pressable'

export const TextInput = ({ className, ...props }: React.ComponentProps<typeof RNTextInput> & { className?: string }) =>
  <RNTextInput {...props} />
TextInput.displayName = 'TextInput'

export const TouchableHighlight = ({ className, ...props }: React.ComponentProps<typeof RNTouchableHighlight> & { className?: string }) =>
  <RNTouchableHighlight {...props} />
TouchableHighlight.displayName = 'TouchableHighlight'

export const AnimatedScrollView = ScrollView

export const useCSSVariable = (_variable: string) => 'transparent'

export { default as Link } from 'expo-router/build/link/Link'
