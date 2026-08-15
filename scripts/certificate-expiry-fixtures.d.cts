export interface CertificateMetadata {
  certificateId: string
  subject: string
  thumbprint: string
  notBefore: string
  notAfter: string
  warningDays: number
  owner: string
  status: 'pending-issuance' | 'issued'
}

export function resolveCertificateMetadata(
  canonical: CertificateMetadata,
  search: string,
  allowFixture: boolean,
  now?: Date,
): CertificateMetadata

export function resolveCertificateFixtureQuery(
  isPackaged: boolean,
  fixture: string | undefined,
): { certificateFixture: string } | undefined
