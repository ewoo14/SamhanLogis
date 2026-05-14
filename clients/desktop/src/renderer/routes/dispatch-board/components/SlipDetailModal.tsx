/**
 * SlipDetailModal — 배차 보드에서 출고전표 row click 시 진입하는 상세 modal.
 *
 * <p>Phase A FE-5.2.
 *
 * <p>slip-service `GET /slips/{id}` 호출 → 거래처 / 인수자 / 라인 / 메모 표시.
 * 본 모달은 배차 보드 진입 시 가벼운 미리보기 용도 — 정식 수정/취소는 `/sales/:id` 페이지에서 처리.
 *
 * UUID 비공개:
 * - 모달에 노출되는 식별자 = slipNumber / partnerCode / partnerName / 인수자 phone / address / 라인 modelName.
 * - id (slip UUID) 는 GET path 에만 사용.
 */
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@samhan/design-system'
import { getSlip } from '../../../api/slip'

interface SlipDetailModalProps {
  slipId: string
  onClose: () => void
}

export function SlipDetailModal({ slipId, onClose }: SlipDetailModalProps) {
  const query = useQuery({
    queryKey: ['dispatchBoard', 'slipDetail', slipId],
    queryFn: () => getSlip(slipId),
    enabled: !!slipId,
  })
  const slip = query.data

  const title = slip ? `출고전표 ${slip.slipNo}` : '출고전표 상세'

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={slip ? `${slip.partnerName ?? ''} (${slip.partnerId ? '' : ''})`.trim() : undefined}
      size="lg"
      footer={
        <button
          type="button"
          onClick={onClose}
          data-testid="dispatch-board-slip-detail-close"
          style={{
            padding: '8px 16px',
            background: 'var(--color-action-brand, #1E40AF)',
            color: 'var(--color-neutral-0)',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          닫기
        </button>
      }
    >
      {query.isLoading ? (
        <div style={{ padding: 12, fontSize: 13, color: 'var(--color-neutral-500)' }}>
          출고전표를 불러오는 중…
        </div>
      ) : query.isError ? (
        <div
          style={{ padding: 12, fontSize: 13, color: 'var(--color-danger-500)' }}
          role="alert"
        >
          출고전표 조회 실패. 잠시 후 다시 시도해주세요.
        </div>
      ) : slip ? (
        <div
          data-testid="dispatch-board-slip-detail-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <section>
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                gap: '6px 12px',
                fontSize: 13,
                margin: 0,
              }}
            >
              <dt style={{ color: 'var(--color-neutral-500)' }}>전표번호</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>{slip.slipNo}</dd>
              <dt style={{ color: 'var(--color-neutral-500)' }}>전표일자</dt>
              <dd style={{ margin: 0 }}>{slip.slipDate}</dd>
              <dt style={{ color: 'var(--color-neutral-500)' }}>거래처</dt>
              <dd style={{ margin: 0 }}>{slip.partnerName ?? '-'}</dd>
              <dt style={{ color: 'var(--color-neutral-500)' }}>기사명</dt>
              <dd style={{ margin: 0 }}>{slip.driverName ?? '-'}</dd>
              <dt style={{ color: 'var(--color-neutral-500)' }}>기사 연락처</dt>
              <dd style={{ margin: 0 }}>{slip.driverPhone ?? '-'}</dd>
              <dt style={{ color: 'var(--color-neutral-500)' }}>메모</dt>
              <dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{slip.memo ?? '-'}</dd>
            </dl>
          </section>

          <section>
            <h4 style={{ margin: '4px 0', fontSize: 13, fontWeight: 600 }}>
              라인 ({slip.lines.length}건)
            </h4>
            {slip.lines.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                라인이 없습니다.
              </div>
            ) : (
              <div
                style={{
                  border: '1px solid var(--color-neutral-200)',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 12,
                  }}
                >
                  <thead style={{ background: 'var(--color-neutral-50)' }}>
                    <tr>
                      <th
                        style={{
                          padding: '6px 8px',
                          textAlign: 'left',
                          borderBottom: '1px solid var(--color-neutral-200)',
                        }}
                      >
                        모델/품목
                      </th>
                      <th
                        style={{
                          padding: '6px 8px',
                          textAlign: 'right',
                          borderBottom: '1px solid var(--color-neutral-200)',
                          width: 80,
                        }}
                      >
                        수량
                      </th>
                      <th
                        style={{
                          padding: '6px 8px',
                          textAlign: 'right',
                          borderBottom: '1px solid var(--color-neutral-200)',
                          width: 120,
                        }}
                      >
                        합계
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {slip.lines.map((line) => (
                      <tr key={line.id}>
                        <td
                          style={{
                            padding: '6px 8px',
                            borderBottom: '1px solid var(--color-neutral-100)',
                          }}
                        >
                          {line.modelName ?? line.productName ?? '-'}
                          {line.specification ? (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 11,
                                color: 'var(--color-neutral-500)',
                              }}
                            >
                              ({line.specification})
                            </span>
                          ) : null}
                        </td>
                        <td
                          style={{
                            padding: '6px 8px',
                            textAlign: 'right',
                            borderBottom: '1px solid var(--color-neutral-100)',
                          }}
                        >
                          {line.quantity}
                        </td>
                        <td
                          style={{
                            padding: '6px 8px',
                            textAlign: 'right',
                            borderBottom: '1px solid var(--color-neutral-100)',
                          }}
                        >
                          {line.lineTotal}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </Modal>
  )
}
