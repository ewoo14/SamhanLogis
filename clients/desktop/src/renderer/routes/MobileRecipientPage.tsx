/**
 * MobileRecipientPage — `/mobile/share/:shareToken` (signature-slice-C 인수자 view mock).
 *
 * Designer `wireframes.md` §2.2 + `mobile-spec.md` §2.2 / §4.3 인용.
 *
 * 본 페이지는 두 가지 진입을 지원:
 * 1) `?from=signed` — 서명 직후 (모바일 서명 페이지에서 리다이렉트). 상단에 "서명 완료됨"
 *    배너 + ✓ 아이콘 + [공유] 버튼 노출. (Designer wireframes.md §2.1)
 * 2) 직접 진입 (인수자가 SMS 등으로 받은 링크) — 출고 인수증 + 서명 PNG + 메타 표시.
 *
 * Web Share API (`navigator.share`) 미지원 시 clipboard fallback (CopyButton 재사용).
 *
 * UUID 비공개:
 * - URL `{shareToken}` 만 (UUID 없음).
 * - 응답 객체 안 비즈니스 식별자만 표시 (slipNo / partnerName / 라인 itemName 등).
 * - signature.id 노출 X — hash 의 앞 8자만 SignatureViewer 가 표시.
 */
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import {
  Button,
  CopyButton,
  SignatureViewer,
} from '@samhan/design-system'
import { getSignatureShare } from '../api/signature'

/** 만료된 / 무효 토큰 410 페이지 — Slice B 디자인 재사용 spec (간단 fallback). */
function GoneView() {
  return (
    <div className="m-mock-frame">
      <div className="m-brand-bar">(주)삼한공조시스템</div>
      <div className="m-page" style={{ textAlign: 'center', paddingTop: 64 }}>
        <h2 style={{ marginBottom: 16 }}>링크가 만료되었습니다</h2>
        <p style={{ color: '#5C6773', fontSize: 14 }}>
          공유 링크의 유효 기간(30일)이 지났거나
          <br />
          무효화된 서명입니다.
        </p>
      </div>
    </div>
  )
}

/**
 * 일시적 장애(네트워크 단절 / 5xx / 무응답) 안내 페이지.
 *
 * {@link getSignatureShare} 의 410(만료)/404(토큰 무효)는 {@link GoneView} 로 분기하고,
 * 그 외 오류는 "링크 만료"로 오인되지 않도록 본 컴포넌트로 분기해 재시도를 안내한다.
 */
function OutageView({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="m-mock-frame">
      <div className="m-brand-bar">(주)삼한공조시스템</div>
      <div className="m-page" style={{ textAlign: 'center', paddingTop: 64 }}>
        <h2 style={{ marginBottom: 16 }}>일시적으로 불러오지 못했습니다</h2>
        <p style={{ color: '#5C6773', fontSize: 14 }}>
          잠시 후 다시 시도해 주세요.
        </p>
        <Button variant="primary" onClick={onRetry} style={{ marginTop: 16 }}>
          다시 시도
        </Button>
      </div>
    </div>
  )
}

export function MobileRecipientPage() {
  const params = useParams<{ shareToken: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const fromSigned = searchParams.get('from') === 'signed'
  const shareToken = params.shareToken ?? ''

  const shareQuery = useQuery({
    queryKey: ['signature-share', shareToken],
    queryFn: () => getSignatureShare(shareToken),
    enabled: !!shareToken,
    retry: false,
  })

  const [shareError, setShareError] = useState<string | null>(null)

  if (!shareToken) return null
  if (shareQuery.isLoading) {
    return (
      <div className="m-mock-frame">
        <div className="m-brand-bar">(주)삼한공조시스템</div>
        <div className="m-page">
          <p>불러오는 중...</p>
        </div>
      </div>
    )
  }
  if (shareQuery.isError) {
    const status = axios.isAxiosError(shareQuery.error) ? shareQuery.error.response?.status : undefined
    if (status === 410 || status === 404) {
      return <GoneView />
    }
    return <OutageView onRetry={() => void shareQuery.refetch()} />
  }
  if (!shareQuery.data) {
    return <GoneView />
  }

  const { slip, signature, shareTokenExpiresAt } = shareQuery.data
  const shareUrl = `${window.location.origin}${window.location.pathname}#/mobile/share/${shareToken}`

  /**
   * Web Share API + clipboard fallback (Designer mobile-spec.md §4.3).
   * `navigator.share` 미지원 시 CopyButton 의 동일 로직과 합치 (직접 호출).
   */
  const handleShare = async () => {
    setShareError(null)
    const data = {
      title: '출고 인수증',
      text: `[(주)삼한공조시스템] 출고전표 ${slip.slipNo} — 서명 완료`,
      url: shareUrl,
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(data)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setShareError('공유에 실패했습니다. 링크를 직접 복사해주세요.')
        }
      }
    } else {
      // fallback — CopyButton 사용 권장 (UI 노출).
      try {
        await navigator.clipboard.writeText(`${data.text}\n${data.url}`)
      } catch {
        setShareError('링크 복사에 실패했습니다.')
      }
    }
  }

  return (
    <div className="m-mock-frame">
      <div className="m-brand-bar">(주)삼한공조시스템</div>
      <div className="m-page">
        {fromSigned ? (
          <section
            className="m-signed-banner"
            aria-label="서명 완료 안내"
            style={{ textAlign: 'center', padding: '24px 0 16px' }}
          >
            <div
              style={{ fontSize: 48, color: '#10B981', lineHeight: 1 }}
              aria-hidden="true"
            >
              ✓
            </div>
            <h2 style={{ margin: '12px 0 4px', fontSize: 18 }}>서명 완료됨</h2>
            <p style={{ margin: 0, color: '#5C6773', fontSize: 14 }}>
              인수자: {signature.signerName}
            </p>
          </section>
        ) : null}

        <section className="m-slip-card" aria-label="출고 인수증">
          <h2 className="m-slip-card-title">출고 인수증</h2>
          <p className="m-slip-info">
            <span className="m-slip-info-label">거래처</span>
            {slip.partnerName}
          </p>
          <p className="m-slip-info">
            <span className="m-slip-info-label">전표번호</span>
            <span className="m-slip-info-sm">{slip.slipNo}</span>
          </p>
          <p className="m-slip-info">
            <span className="m-slip-info-label">배송일</span>
            <span className="m-slip-info-sm">{slip.deliveryDate}</span>
          </p>
          <p className="m-slip-info">
            <span className="m-slip-info-label">배송지</span>
            <span className="m-slip-info-sm">{slip.deliveryAddress}</span>
          </p>
          <hr className="m-slip-divider" />
          {slip.lines.map((l, idx) => (
            <p className="m-slip-info-sm" key={idx}>
              {l.itemName} &nbsp;·&nbsp; {l.quantity}
              {l.uom}
            </p>
          ))}
          <hr className="m-slip-divider" />
          <p className="m-slip-info">
            <strong>합계: {slip.totalAmount.toLocaleString()} 원</strong>
          </p>
        </section>

        <label className="m-input-label">서명</label>
        <SignatureViewer
          signaturePngBase64={signature.signaturePngBase64}
          signerName={signature.signerName}
          signedAt={signature.signedAt}
          signatureHash={signature.signatureHashShort}
          size="fluid"
        />

        <div className="m-actions-stack" style={{ marginTop: 16 }}>
          <Button
            variant="primary"
            fullWidth
            onClick={() => void handleShare()}
          >
            인수자에게 공유
          </Button>
          <CopyButton
            text={`[(주)삼한공조시스템] 출고전표 ${slip.slipNo} — 서명 완료\n${shareUrl}`}
            label="링크 복사"
          />
          {fromSigned ? (
            <Button variant="ghost" fullWidth onClick={() => navigate('/mobile/d/mock-token')}>
              목록으로
            </Button>
          ) : null}
        </div>

        {shareError ? (
          <div className="m-error" role="alert">
            {shareError}
          </div>
        ) : null}

        <hr className="m-slip-divider" />
        <p className="m-footer-note">
          공유 링크 만료: {shareTokenExpiresAt.slice(0, 10)}
        </p>
        <p className="m-footer-note">문의: 02-XXXX-XXXX</p>
      </div>
    </div>
  )
}
