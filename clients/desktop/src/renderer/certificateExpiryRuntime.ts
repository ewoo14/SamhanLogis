const DAY_MS = 24 * 60 * 60 * 1000

export type CertificateMetadata = {
  status?: string
  notAfter?: string
  warningDays?: number
  [key: string]: unknown
}

export function resolveCertificateMetadata(
  canonical: CertificateMetadata,
  search: string,
  allowFixture: boolean,
  now = new Date(),
): CertificateMetadata {
  if (!allowFixture || typeof search !== 'string') return canonical
  const fixture = new URLSearchParams(search).get('certificateFixture')
  if (!fixture) return canonical

  const atDays = (days: number) => new Date(new Date(now).getTime() + days * DAY_MS).toISOString()
  const issued = { ...canonical, status: 'issued' }
  if (fixture === 'none') return { ...issued, notAfter: atDays(31) }
  if (fixture === 'soon') return { ...issued, notAfter: atDays(30) }
  if (fixture === 'expired') return { ...issued, notAfter: atDays(-1) }
  if (fixture === 'issued-unknown') return { ...issued, notAfter: '' }
  return canonical
}

export function classifyCertificateExpiry({ status, notAfter, now = new Date(), warningDays = 30 }: CertificateMetadata & { now?: Date }) {
  const issued = status === 'issued'
  const expiry = new Date(String(notAfter || ''))
  if (!issued || Number.isNaN(expiry.getTime())) {
    return { kind: 'unknown' as const, alert: issued, operationalIssue: issued }
  }
  const remainingDays = Math.ceil((expiry.getTime() - new Date(now).getTime()) / DAY_MS)
  if (remainingDays <= 0) return { kind: 'expired' as const, alert: true, operationalIssue: true }
  if (remainingDays <= warningDays) return { kind: 'expiring-soon' as const, alert: true, operationalIssue: false, remainingDays }
  return { kind: 'none' as const, alert: false, operationalIssue: false, remainingDays }
}
