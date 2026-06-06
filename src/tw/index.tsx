import {
  useCssElement as _useCssElement,
  useNativeVariable as useFunctionalVariable,
} from 'react-native-css'
import { Link as RouterLink } from 'expo-router'
import React from 'react'
import {
  View as RNView,
  Text as RNText,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  TextInput as RNTextInput,
  TouchableHighlight as RNTouchableHighlight,
  StyleSheet,
} from 'react-native'

// react-native-css's useCssElement produces union types too complex for tsc;
// cast once here so all wrappers below stay ergonomic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const css = _useCssElement as (component: any, props: any, mapping: Record<string, string>) => React.ReactElement

export const Link = (
  props: React.ComponentProps<typeof RouterLink> & { className?: string }
) => css(RouterLink, props, { className: 'style' })

Link.Trigger = RouterLink.Trigger
Link.Menu = RouterLink.Menu
Link.MenuAction = RouterLink.MenuAction
Link.Preview = RouterLink.Preview

export const useCSSVariable =
  process.env.EXPO_OS !== 'web'
    ? useFunctionalVariable
    : (variable: string) => `var(${variable})`

export type ViewProps = React.ComponentProps<typeof RNView> & { className?: string }
export const View = (props: ViewProps) => css(RNView, props, { className: 'style' })
View.displayName = 'CSS(View)'

export const Text = (
  props: React.ComponentProps<typeof RNText> & { className?: string }
) => css(RNText, props, { className: 'style' })
Text.displayName = 'CSS(Text)'

export const ScrollView = (
  props: React.ComponentProps<typeof RNScrollView> & {
    className?: string
    contentContainerClassName?: string
  }
) => css(RNScrollView, props, { className: 'style', contentContainerClassName: 'contentContainerStyle' })
ScrollView.displayName = 'CSS(ScrollView)'

export const Pressable = (
  props: React.ComponentProps<typeof RNPressable> & { className?: string }
) => css(RNPressable, props, { className: 'style' })
Pressable.displayName = 'CSS(Pressable)'

export const TextInput = (
  props: React.ComponentProps<typeof RNTextInput> & { className?: string }
) => css(RNTextInput, props, { className: 'style' })
TextInput.displayName = 'CSS(TextInput)'

// AnimatedScrollView is native-only; add back with react-native-reanimated once worklets is resolved
export const AnimatedScrollView = ScrollView

function _TouchableHighlight(
  props: React.ComponentProps<typeof RNTouchableHighlight>
) {
  const flatStyle = StyleSheet.flatten(props.style) as Record<string, unknown> | undefined
  const { underlayColor, ...restStyle } = flatStyle ?? {}
  return (
    <RNTouchableHighlight
      underlayColor={underlayColor as string | undefined}
      {...props}
      style={restStyle as React.ComponentProps<typeof RNTouchableHighlight>['style']}
    />
  )
}

export const TouchableHighlight = (
  props: React.ComponentProps<typeof RNTouchableHighlight>
) => css(_TouchableHighlight, props, { className: 'style' })
TouchableHighlight.displayName = 'CSS(TouchableHighlight)'
