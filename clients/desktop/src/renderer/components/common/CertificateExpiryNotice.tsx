import { useEffect } from 'react'
import { AppUpdateNotice } from '@samhan/design-system'
import registry from '../../../../../../scripts/certificate-registry.cjs'
import { classifyCertificateExpiry } from '../../../../../../scripts/certificate-expiry.cjs'
import { resolveCertificateMetadata } from '../../../../../../scripts/certificate-expiry-fixtures.cjs'

export function CertificateExpiryNotice({ now = new Date(), metadata }: { now?: Date; metadata?: typeof registry }): JSX.Element | null {
  const resolvedMetadata = metadata ?? resolveCertificateMetadata(
    registry,
    typeof window === 'undefined' ? '' : window.location.search,
    import.meta.env.DEV,
    now,
  )
  const result = classifyCertificateExpiry({ ...resolvedMetadata, now })
  useEffect(() => {
    if (result.operationalIssue) console.warn('[certificate-expiry] registry 상태를 확인할 수 없습니다.')
  }, [result.operationalIssue])
  if (!result.alert) return null
  if (result.kind === 'unknown') {
    return <AppUpdateNotice severity="trust" title="업데이트 인증서 상태를 확인할 수 없습니다" description="자동 업데이트 상태를 확인할 수 없습니다. 앱은 계속 사용할 수 있으며 운영 담당자에게 확인을 요청했습니다." testId="certificate-expiry-unknown" />
  }
  if (result.kind === 'expired') {
    return <AppUpdateNotice severity="trust" title="업데이트 인증서가 만료되었습니다" description="자동 업데이트를 사용할 수 없습니다. 앱은 계속 사용할 수 있습니다." testId="certificate-expired" />
  }
  return <AppUpdateNotice severity="trust" title="업데이트 인증서가 곧 만료됩니다" description="만료 전까지 자동 업데이트는 정상 동작합니다. 운영 담당자가 교체를 준비하고 있습니다." testId="certificate-expiring-soon" />
}
