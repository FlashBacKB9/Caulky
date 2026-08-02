import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { ChevronDown, ChevronRight, Percent } from 'lucide-react'
import { getMovements, type Movement } from '../api/movements'
import { getMovementTypes } from '../api/movementTypes'
import type { Account } from '../api/accounts'
import { buildPerspective } from '../utils/accountView'
import { computeInterestStats } from '../utils/interestAccounts'
import { useCurrency } from '../hooks/useCurrency'
import { useDateFormat } from '../hooks/useDateFormat'
import { useIsDark } from '../hooks/useDarkMode'
import { t } from '../utils/i18n'

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`
}

export default function InterestAccountCard({ account, accounts }: {
  account: Account
  accounts: Account[]
}) {
  const { fmt } = useCurrency()
  const { fmtDate } = useDateFormat()
  const isDark = useIsDark()
  const [showMovements, setShowMovements] = useState(false)

  const { data: allMovements = [] } = useQuery({
    queryKey: ['movements-all'],
    queryFn: () => getMovements(),
    staleTime: 60_000,
  })
  const { data: types = [] } = useQuery({
    queryKey: ['movement-types'],
    queryFn: getMovementTypes,
    staleTime: 5 * 60 * 1000,
  })

  const perspective = useMemo(
    () => buildPerspective(account.id, accounts, types),
    [account.id, accounts, types]
  )

  const stats = useMemo(
    () => computeInterestStats(
      allMovements, perspective, account.balance,
      account.interest_type_id, account.interest_tax_rate,
    ),
    [allMovements, perspective, account.balance, account.interest_type_id, account.interest_tax_rate]
  )

  const interestMovements = useMemo<Movement[]>(() => {
    if (account.interest_type_id == null) return []
    return allMovements
      .filter(mv => mv.movement_type_id === account.interest_type_id)
      .filter(mv => mv.account_id === account.id || perspective?.linkedTypeIds.has(mv.movement_type_id!))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [allMovements, account.interest_type_id, account.id, perspective])

  const chartData = useMemo(
    () => stats.months.slice(-24).map(m => ({
      label: monthLabel(m.month),
      saldo: m.balance,
      intereses: m.gross,
    })),
    [stats.months]
  )

  const typeName = types.find(tp => tp.id === account.interest_type_id)?.name
  const taxPct = account.interest_tax_rate != null ? Math.round(account.interest_tax_rate * 10000) / 100 : 0

  const tooltipStyle = {
    fontSize: 12, borderRadius: 8,
    border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
    background: isDark ? '#1f2937' : '#fff',
    color: isDark ? '#f9fafb' : '#111827',
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
      style={{ borderLeftColor: account.color, borderLeftWidth: 3 }}>

      {/* Cabecera */}
      <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: account.color }} />
          <span className="font-semibold text-gray-800 dark:text-white truncate">{account.name}</span>
          {typeName && (
            <span className="text-[11px] px-2 py-0.5 rounded-full shrink-0 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              {typeName}
            </span>
          )}
        </div>
        <span className="text-lg font-bold font-mono text-gray-900 dark:text-white">{fmt(account.balance)}</span>
      </div>

      {account.interest_type_id == null ? (
        <p className="px-4 pb-4 text-xs text-gray-400 dark:text-gray-500">{t('invest.interestNoType')}</p>
      ) : (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 dark:bg-gray-800 border-y border-gray-100 dark:border-gray-800">
            {[
              { label: t('invest.interestNet'),   value: fmt(stats.totalNet) },
              { label: t('invest.interestGross'), value: fmt(stats.totalGross) },
              { label: t('invest.interestTaxPct'), value: `${taxPct}%` },
              {
                label: t('invest.interestRate'),
                value: stats.avgAnnualRate != null ? `${stats.avgAnnualRate.toFixed(2)}%` : '—',
                strong: true,
              },
            ].map(c => (
              <div key={c.label} className="bg-white dark:bg-gray-900 px-3 py-2.5">
                <p className="text-[11px] text-gray-400 dark:text-gray-500">{c.label}</p>
                <p className={`font-mono mt-0.5 ${c.strong
                  ? 'text-base font-bold text-emerald-600 dark:text-emerald-400'
                  : 'text-sm text-gray-700 dark:text-gray-200'}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Evolución: saldo + intereses del mes */}
          {chartData.length > 0 && (
            <div className="h-56 px-2 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -14, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,.12)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => fmt(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="right" dataKey="intereses" name={t('invest.interestMonthly')} fill={account.color} fillOpacity={0.75} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="left" type="monotone" dataKey="saldo" name={t('invest.interestBalance')} stroke="#3b82f6" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Detalle por abono */}
          {stats.payments.length > 0 && (
            <div className="px-4 py-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                    <th className="text-left font-semibold py-1.5">{t('invest.interestMonth')}</th>
                    <th className="text-right font-semibold py-1.5">{t('invest.interestBase')}</th>
                    <th className="text-right font-semibold py-1.5">{t('invest.interestNetShort')}</th>
                    <th className="text-right font-semibold py-1.5">{t('invest.interestGrossShort')}</th>
                    <th className="text-right font-semibold py-1.5">{t('invest.interestRateShort')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.payments.map(p => (
                    <tr key={p.month} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                      <td className="py-1.5 text-gray-700 dark:text-gray-300">{monthLabel(p.month)}</td>
                      <td className="py-1.5 text-right tabular-nums text-gray-500 dark:text-gray-400">
                        {p.avgBalance != null ? fmt(p.avgBalance) : '—'}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmt(p.net)}</td>
                      <td className="py-1.5 text-right tabular-nums text-gray-500 dark:text-gray-400">{fmt(p.gross)}</td>
                      <td className="py-1.5 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                        {p.annualRate != null ? `${p.annualRate.toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 flex items-start gap-1.5">
                <Percent className="w-3 h-3 mt-0.5 shrink-0" />
                {t('invest.interestRateHint')}
              </p>
            </div>
          )}

          {/* Movimientos del subtipo */}
          {interestMovements.length > 0 && (
            <div className="border-t border-gray-50 dark:border-gray-800">
              <button onClick={() => setShowMovements(v => !v)}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                {showMovements ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {t('invest.interestPayments').replace('{n}', String(interestMovements.length))}
              </button>
              {showMovements && (
                <div className="divide-y divide-gray-50 dark:divide-gray-800 max-h-64 overflow-y-auto">
                  {interestMovements.map(mv => (
                    <div key={mv.id} className="flex items-center gap-3 px-4 py-1.5">
                      <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums w-20 shrink-0">{fmtDate(mv.date)}</span>
                      <span className="flex-1 text-xs text-gray-600 dark:text-gray-400 truncate">{mv.name}</span>
                      <span className="text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                        {fmt(Math.abs(mv.dinero))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
