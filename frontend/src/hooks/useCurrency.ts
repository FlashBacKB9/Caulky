import { useState, useEffect, useCallback } from 'react'
import { syncPref } from '../utils/prefSync'
import { usePrivacyMode } from './usePrivacyMode'

const KEY = 'spendly-currency'
const EVENT = 'spendly-currency-change'

export interface CurrencyOption {
  code: string
  symbol: string
  label: string
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$',      label: 'Dólar (USD)' },
  { code: 'GBP', symbol: '£', label: 'Libra esterlina' },
  { code: 'CHF', symbol: 'Fr.',    label: 'Franco suizo' },
  { code: 'JPY', symbol: '¥', label: 'Yen japonés' },
  { code: 'MXN', symbol: 'MX$',   label: 'Peso mexicano' },
  { code: 'ARS', symbol: 'AR$',   label: 'Peso argentino' },
  { code: 'COP', symbol: 'CO$',   label: 'Peso colombiano' },
  { code: 'BRL', symbol: 'R$',    label: 'Real brasileño' },
]

function getCurrent(): string {
  return localStorage.getItem(KEY) ?? 'EUR'
}

export function useCurrency() {
  const [currency, setCurrencyState] = useState(getCurrent)
  const { privacyMode } = usePrivacyMode()

  useEffect(() => {
    const handler = () => setCurrencyState(getCurrent())
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [])

  const setCurrency = useCallback((code: string) => {
    syncPref(KEY, code)
    window.dispatchEvent(new Event(EVENT))
  }, [])

  const fmt = useCallback(
    (v: number, maxDecimals = 2) =>
      privacyMode
        ? '••••'
        : v.toLocaleString('es-ES', { style: 'currency', currency, maximumFractionDigits: maxDecimals })
            .replace(/[   ]/g, ''),
    [currency, privacyMode]
  )

  const fmtK = useCallback(
    (v: number) => {
      if (privacyMode) return '•••'
      const sym = CURRENCIES.find(c => c.code === currency)?.symbol ?? '€'
      return Math.abs(v) >= 1000
        ? `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k${sym}`
        : `${v.toLocaleString('es-ES', { maximumFractionDigits: 0 })}${sym}`
    },
    [currency, privacyMode]
  )

  return { currency, setCurrency, fmt, fmtK, currencies: CURRENCIES }
}
