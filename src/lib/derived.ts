import { useMemo } from 'react'
import { useData } from './store'
import { actualCosts, indexes, onOrderQty, rollupCosts, rollupWeights } from './calc'

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
