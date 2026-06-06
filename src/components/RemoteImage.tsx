import { useEffect, useState } from 'react'
import { Image, type ImageProps } from 'expo-image'
import { getDisplayUri, isStoragePath } from '../lib/item-images'

type Props = Omit<ImageProps, 'source'> & {
  /** A stored item image_url: a Storage object path, data URI, or http URL. */
  path: string
}

/**
 * Renders an item image regardless of how it is stored. Storage object paths are
 * resolved to short-lived signed URLs (the items bucket is private); data URIs
 * and http URLs render directly. Used everywhere item cut-outs are shown so the
 * private-bucket signing logic lives in exactly one place.
 */
export function RemoteImage({ path, ...rest }: Props) {
  // For non-storage values we can render synchronously (no flash).
  const [uri, setUri] = useState<string | null>(() => (isStoragePath(path) ? null : path))

  useEffect(() => {
    let active = true
    if (isStoragePath(path)) {
      setUri(null)
      getDisplayUri(path).then(resolved => {
        if (active) setUri(resolved)
      })
    } else {
      setUri(path)
    }
    return () => { active = false }
  }, [path])

  return <Image source={uri ? { uri } : undefined} {...rest} />
}
