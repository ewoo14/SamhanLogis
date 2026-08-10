/** Returns unique product IDs referenced by lines but absent from a successful bulk lookup. */
export function findMissingProductIds(
  lineProductIds: string[],
  foundProductIds: string[],
  unresolvedProductIds: string[] = [],
): string[] {
  const found = new Set(foundProductIds)
  const unresolved = new Set(unresolvedProductIds)
  return [...new Set(lineProductIds)].filter((productId) => !found.has(productId) && !unresolved.has(productId))
}
