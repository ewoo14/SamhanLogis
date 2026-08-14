interface CertificateMetadata {
  certificateId: string
  subject: string
  thumbprint: string
  notBefore: string
  notAfter: string
  warningDays: number
  owner: string
  status: 'pending-issuance' | 'issued'
}

declare const registry: CertificateMetadata
export = registry
