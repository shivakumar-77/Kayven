export function hasUnapprovedOfferPhase(product: {
  freeTrialPhase?: unknown
  introPricePhase?: unknown
}): boolean {
  return Boolean(product.freeTrialPhase || product.introPricePhase)
}
