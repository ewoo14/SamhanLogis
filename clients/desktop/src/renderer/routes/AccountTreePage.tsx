/**
 * 계정과목 트리 화면 (`/accounting/accounts`).
 *
 * 한국 일반기업회계기준 표준 계정 (~50개) 을 카테고리 prefix 별로 그룹화하여
 * 트리 형태로 표시. 본 슬라이스는 read-only — 추후 슬라이스에서 사용자 정의
 * 계정 추가 기능 도입 예정.
 *
 * 권한: ACCOUNTANT / MASTER 만 진입 (RouteGuard).
 *
 * UUID 비공개 가드: 계정의 외부 식별자는 4자리 `code` 만 사용. BE PK UUID 는
 * 본 화면에 노출하지 않는다.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Card,
  DataTable,
  Spinner,
  type DataTableColumn,
} from '@samhan/design-system'
import type { Account } from '@samhan/design-system'
import { listAccounts } from '../api/accounting'
import { usePageTitle } from '../hooks/usePageTitle'

/** 카테고리 prefix → 한국어 그룹명. */
const CATEGORY_LABEL: Record<string, string> = {
  '100': '자산',
  '200': '부채',
  '300': '자본',
  '400': '매출',
  '500': '매출원가',
  '800': '판매관리비',
  '900': '영업외',
}

/** 카테고리 prefix → 그룹별 짧은 설명 (시각 보조). */
const CATEGORY_DESCRIPTION: Record<string, string> = {
  '100': '현금성·매출채권·재고·유형자산',
  '200': '매입채무·예수금·차입금',
  '300': '자본금·이익잉여금',
  '400': '제품매출·상품매출·서비스매출',
  '500': '매출원가',
  '800': '인건비·지급수수료·광고선전비 등',
  '900': '이자수익·이자비용·잡손익',
}

/** 이카운트 정본 상태가 없는 계정도 임의 숫자 대신 상태 문구를 표시한다. */
export function accountMappingLabel(account: Account): string {
  return account.mappingLabel ?? account.ecountCode ?? '이카운트 원문 없음'
}

export function AccountTreePage() {
  usePageTitle('계정과목')

  const query = useQuery({
    queryKey: ['accounting', 'accounts'],
    queryFn: listAccounts,
  })

  // 카테고리별 그룹화 (Map preserves insertion order)
  const grouped = useMemo(() => {
    const accounts = Array.isArray(query.data) ? query.data : []
    const map = new Map<string, Account[]>()
    for (const a of accounts) {
      const list = map.get(a.category) ?? []
      list.push(a)
      map.set(a.category, list)
    }
    // 카테고리 코드 오름차순 정렬
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [query.data])

  const columns: DataTableColumn<Account>[] = [
    { key: 'code', header: '코드', width: '100px', mobilePriority: 'primary' },
    { key: 'name', header: '계정명', mobilePriority: 'secondary' },
    {
      key: 'ecountCode',
      header: '이카운트 정본',
      width: '140px',
      mobilePriority: 'secondary',
      render: accountMappingLabel,
    },
  ]

  if (query.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="계정과목 불러오는 중" />
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="error-banner" role="alert">
        계정과목을 불러오지 못했습니다. 백엔드 연결을 확인하세요.
      </div>
    )
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>계정과목 (한국 일반기업회계기준)</h3>
        <p style={{ marginTop: 4, fontSize: 13, color: '#6B7280' }}>
          총 {query.data?.length ?? 0}개 표준 계정. 카테고리별 그룹.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 16,
        }}
      >
        {grouped.map(([category, accounts]) => (
          <Card key={category}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {CATEGORY_LABEL[category] ?? category} ({category})
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                {CATEGORY_DESCRIPTION[category] ?? ''}
              </div>
            </div>
            <DataTable
              columns={columns}
              rows={accounts}
              rowKey={(a) => a.code}
              emptyMessage="등록된 계정이 없습니다."
            />
          </Card>
        ))}
      </div>
    </>
  )
}
