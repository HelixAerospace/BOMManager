import { useMemo } from 'react'
import { useData } from './store'
import { actualCosts, fmtMoney, indexes, onOrderQty, rollupCosts, rollupWeights } from './calc'

/** Memoised indexes and cost roll-ups for the current data. */
export function useDerived() {
  const data = useData()
  return useMemo(() => {
    const idx = indexes(data)
    const actual = actualCosts(data)
    const costs = rollupCosts(data, idx, actual)
    const onOrder = onOrderQty(data)
    const weights = rollupWeights(data, idx)
    const topAssemblies = data.parts.filter((p) => (idx.children.get(p.id)?.length ?? 0) > 0 && !(idx.parents.get(p.id)?.length))
    return { idx, actual, costs, onOrder, weights, topAssemblies }
  }, [data])
}

export const displayCurrencyOf = (settings: { displayCurrency?: string; fx: Record<string, number> }) => {
  const c = settings.displayCurrency || 'USD'
  return c === 'ILS' || settings.fx[c] ? c : 'ILS'
}

/** Formats shekel amounts in the display currency chosen in Settings (default USD). */
export function useMoney() {
  const data = useData()
  return useMemo(() => {
    const cur = displayCurrencyOf(data.settings)
    const rate = cur === 'ILS' ? 1 : data.settings.fx[cur]
    const sym = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).formatToParts(0).find((x) => x.type === 'currency')?.value ?? cur
    return {
      cur,
      sym,
      /** value in ILS -> display currency */
      conv: (ils: number) => ils / rate,
      fmt: (ils: number | null | undefined) => (ils == null || Number.isNaN(ils) ? '—' : fmtMoney(ils / rate, cur)),
    }
  }, [data.settings])
}
