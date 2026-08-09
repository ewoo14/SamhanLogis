import { useEffect, useState } from 'react'
import { listPartnerImportRejections, type PartnerImportRejection } from '../../api/partnerImportApi'

const PAGE_SIZE = 100

export function PartnerImportRejectionPanel({ sourceFileHash }: { sourceFileHash: string }) {
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<{ content: PartnerImportRejection[]; totalElements: number; totalPages: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    void listPartnerImportRejections(sourceFileHash, page, PAGE_SIZE)
      .then((next) => { if (!cancelled) setResult(next) })
      .catch(() => { if (!cancelled) setError('보류·거부 행을 불러오지 못했습니다.') })
    return () => { cancelled = true }
  }, [page, sourceFileHash])

  if (error) return <div role="alert">{error}</div>
  if (!result) return <div aria-busy="true">보류·거부 행을 불러오는 중…</div>
  if (result.totalElements === 0) return <div>보류·거부 행이 없습니다.</div>

  return (
    <section aria-label="보류·거부 행 목록" data-testid="partner-import-rejections">
      <h4>보류·거부 행 ({result.totalElements.toLocaleString()}건)</h4>
      <table>
        <thead><tr><th>행 번호</th><th>사유</th><th>거래처코드</th><th>상호</th></tr></thead>
        <tbody>{result.content.map((row) => (
          <tr key={`${row.rowNumber}-${row.reason}`}>
            <td>{row.rowNumber}</td><td>{row.reason}</td><td>{row.rawPartnerCode || '읽을 수 없음'}</td><td>{row.rawName || '읽을 수 없음'}</td>
          </tr>
        ))}</tbody>
      </table>
      {result.totalPages > 1 ? (
        <div>
          <button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>이전</button>
          <span>{page + 1} / {result.totalPages}</span>
          <button type="button" disabled={page + 1 >= result.totalPages} onClick={() => setPage((value) => value + 1)}>다음</button>
        </div>
      ) : null}
    </section>
  )
}
