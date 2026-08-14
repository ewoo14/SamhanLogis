const DETAIL_WINDOW_ROUTE = /^\/(?:sales\/estimates\/[^/?#]+|sales\/partner-orders\/[^/?#]+|sales\/(?!estimates(?:\/|$)|partner-orders(?:\/|$))[^/?#]+|purchases\/[^/?#]+|accounting\/tax-invoices\/[^/?#]+|transfers\/[^/?#]+|warehouse\/audit\/[^/?#]+)$/

export function isAllowedDetailWindowRoute(route: string): boolean {
  return DETAIL_WINDOW_ROUTE.test(route)
}
