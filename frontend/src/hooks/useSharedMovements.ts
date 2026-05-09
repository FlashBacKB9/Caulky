import { useState, useEffect } from 'react'
import { syncPref } from '../utils/prefSync'

const KEY = 'shared-movements-enabled'

export function useSharedMovements() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    const s = localStorage.getItem(KEY)
    return s === null ? true : s === 'true'
  })

  useEffect(() => {
    syncPref(KEY, String(enabled))
  }, [enabled])

  return { sharedEnabled: enabled, setSharedEnabled: setEnabled }
}
