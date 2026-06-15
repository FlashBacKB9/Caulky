import { useState, useEffect, useCallback } from 'react'

const KEY = 'caulky-privacy-mode'
const EVENT = 'caulky-privacy-change'

function getCurrent(): boolean {
  return localStorage.getItem(KEY) === 'true'
}

export function usePrivacyMode() {
  const [privacyMode, setPrivacyModeState] = useState(getCurrent)

  useEffect(() => {
    const handler = () => setPrivacyModeState(getCurrent())
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [])

  const togglePrivacyMode = useCallback(() => {
    const next = !getCurrent()
    localStorage.setItem(KEY, String(next))
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return { privacyMode, togglePrivacyMode }
}
