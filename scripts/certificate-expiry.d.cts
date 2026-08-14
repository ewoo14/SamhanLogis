interface CertificateMetadata {
  status: 'pending-issuance' | 'issued'
  notAfter: string
  warningDays?: number
}

interface CertificateExpiryResult {
  kind: 'none' | 'expiring-soon' | 'expired' | 'unknown'
  alert: boolean
  operationalIssue: boolean
  remainingDays?: number
}

export function classifyCertificateExpiry(input: CertificateMetadata & { now?: Date }): CertificateExpiryResult
