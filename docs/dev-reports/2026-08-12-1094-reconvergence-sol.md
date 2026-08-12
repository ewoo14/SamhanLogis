# PR #1179 (#1094) 재수렴 적대검증 (SOL)

- 대상: `feat/1094-docno-hyperlink-and-back`, 개발책임자 제공 HEAD `5ee38fc54`
- 일시: 2026-08-12 (Asia/Seoul)
- 판정 질문: **실 사용자 경로로 재현 가능한 결함이 있는가?**
- 제한 준수: git 명령 미사용, 공유 `samhan-*` 스택 쓰기 미수행, 구현 코드 미변경

## 판정

**있다. 4건이다.** 모두 #1175가 바꾼 주문·견적 DS 상세 표면에서 현재 코드로 도달한다.

| # | 실사용 경로 | 재현 결함 | 직접 근거 |
|---|---|---|---|
| F1 | 판매 → 견적서 관리 → 견적번호 | 견적번호가 하이퍼링크가 아닌 `span`이고 행 전체 클릭으로만 상세 진입 | `EstimateListPage.tsx:196-213, 567-572` |
| F2 | 견적 목록 → 행 클릭 → DS 상세 | `Card + detail-grid` 상세에 목록/뒤로가기 버튼이 없다 | `EstimateDetailPage.tsx`의 사용자 액션 전수에서 목록/뒤로가기 0건 |
| F3 | 판매 → 주문서 관리 → 주문번호 | 주문번호가 하이퍼링크가 아닌 `OrderNumberDisplay`를 감싼 `span`이고 행 전체 클릭으로만 상세 진입 | `SalesPartnerOrderListPage.tsx:226-248, 384-389` |
| F4 | 필터/검색된 주문 목록 → 상세 → `← 목록` | 원래 history entry가 아니라 고정 `/sales/partner-orders`로 이동하여 검색·scroll identity를 잃음 | `SalesPartnerOrderDetailPage.tsx:837` 및 동일 고정 이동 호출 |

따라서 충돌 해소 후 **PR의 번호 하이퍼링크·공통 뒤로가기 의도와 main의 DS 셸 의도가 함께 살아 있지 않다.** DS 셸은 살아 있으나 위 네 계약이 견적·주문 표면에서 소실됐다.

반대로 S7 자동 drop 판단은 입금보고서 reference 경로에서는 맞았다. 격리 라이브에서 `목록(640px) → 상세 → 편집 → 저장 → 동일 필터 URL/640px`를 완주했다.

## 집계

### 라이브 실행

- passed: **4**
  - 입금보고서 전표번호 native `A` + 비즈니스 번호 라벨
  - visible UUID 비노출
  - 상세 `목록` → 동일 필터 URL/640px 복귀
  - 편집 저장 mutation → 동일 history entry/640px 복귀
- skipped: **3**
  - 직접 URL 상세 → canonical 목록
  - 견적 DS 목록/상세 상호작용
  - 주문 DS 목록/상세 상호작용
- failed: **0**

skipped 사유는 제품 판정이 아니라 검증 스택 중단이다. 전용 컨테이너 과부하 뒤 397xx 전 포트와 Docker daemon이 timeout이 되어 공유 스택으로 전환하지 않았다. 직접 URL은 집중 단위 테스트에 포함돼 통과했지만 라이브 통과로 승격하지 않았다.

### 정적 도달성 적대검증

- passed: **2**
  - cash detail → edit가 `returnEntryKey`를 보존
  - edit save가 `navigate(-2)`로 원래 목록 entry 복귀
- skipped: **0**
- failed: **4** — 위 F1~F4

### 집중 자동 회귀

- passed: **79**
- skipped: **0**
- failed: **0**

## 격리 DB 복제와 인코딩 게이트

전용 환경만 사용했다.

```text
network: recon1094-net
PostgreSQL: recon1094-pg / 127.0.0.1:39732
gateway: 127.0.0.1:39780
auth: 39781
accounting: 39787
renderer: 127.0.0.1:52794
```

복제는 파이프 없이 수행했다.

```text
samhan-postgres 내부 pg_dumpall -f /tmp/recon1094-all.sql
docker cp source-container:/tmp/recon1094-all.sql host-file
docker cp host-file recon1094-pg:/tmp/recon1094-all.sql
recon1094-pg 내부 psql -f /tmp/recon1094-all.sql
```

restore 오류는 초기 컨테이너가 이미 만든 동일 역할 재생성 1건뿐이었다.

```text
RESTORE_ERROR_COUNT=1
psql:/tmp/recon1094-all.sql:16: ERROR:  role "samhan" already exists
```

복제 직후 공유 원문과 clone에서 같은 SQL을 각각 컨테이너 파일로 출력하고 `docker cp`로 꺼냈다. 한글 SELECT 원문:

```text
2026/07/04-12|#929-R3-표면3-검증-throwaway
2026/07/07-1|라이브QA coedit 초기
2026/07/05-4|race-condition 시뮬레이션(동시 세션)
2026/07/04-9|E3S4c 실QA — 다중선택 벌크 입금보고서
2026/07/05-3|race-condition 시뮬레이션(동시 세션)
```

검증 원문:

```text
UTF8_EXACT_MATCH=True
SOURCE_HAS_HANGUL=True
CLONE_HAS_HANGUL=True
SOURCE_SHA256=9B45F8273AC6C1465FF63E705945149733935B73DF9852C8770A15D6EE9DB87C
CLONE_SHA256=9B45F8273AC6C1465FF63E705945149733935B73DF9852C8770A15D6EE9DB87C
```

인코딩 게이트 통과 전에는 서비스/UI 검증을 시작하지 않았다.

## S2·S3·S5 충돌 해소 및 S7 drop 추적

### 살아 있는 의도

입금보고서 reference에는 다음이 모두 남았다.

```text
CashReceiptListPage
  Link label = row.slipNo
  state = { returnTo, returnEntryKey: location.key }
  saveScrollAnchor(location.key)

CashReceiptDetailPage
  유효 returnEntryKey → navigate(-1)
  직접 URL/state 없음 → canonical replace
  edit state에 returnTo + returnEntryKey 보존

CashReceiptFormPage
  목록 → 상세 → 편집 → 저장 + 유효 returnEntryKey → navigate(-2)
  직접 상세 → 편집 → 저장 → 저장된 상세 replace
```

초기 정적 조사에서 `CashReceiptFormPage.tsx:138`의 `state: { returnTo }`를 S7 누락 후보로 보았으나, 이 분기는 `hasReturnEntry=false`인 직접 진입 전용이었다. 목록에서 온 실제 mutation은 `:131-134`의 `navigate(-2)`를 사용한다. 라이브 저장으로 반증했으므로 결함으로 집계하지 않았다.

### 버려진 의도

견적/주문 표면은 #1175 DS 셸과 데이터 표면은 살아 있지만 #1094 계약이 결합되지 않았다.

실행 원문에 대응하는 현재 코드:

```tsx
// EstimateListPage.tsx
<span data-testid={`estimate-list-row-${row.id}-number`}>
  {row.estimateNo}
</span>
// ...
onRowClick={(r) => navigate(`/sales/estimates/${r.id}`)}
```

```tsx
// SalesPartnerOrderListPage.tsx
<span className={styles['partnerOrderNumberCell']}>
  <OrderNumberDisplay orderNumber={o.orderNumber} />
</span>
// ...
navigate(`/sales/partner-orders/${encodeURIComponent(toOrderPathId(o.orderNumber))}`)
```

```tsx
// SalesPartnerOrderDetailPage.tsx
<Button type="button" variant="ghost" onClick={() => navigate('/sales/partner-orders')}>
  ← 목록
</Button>
```

`EstimateDetailPage.tsx`는 `Card + detail-grid`를 렌더하지만 목록/뒤로가기 action이 0건이다.

## 격리 라이브 QA 원문

브라우저 플러그인은 복구 절차 후에도 사용 가능한 브라우저 목록이 `[]`였으므로, 로컬 Playwright Chromium으로 동일 격리 URL을 제어했다. 공유 스택에는 로그인/API 호출을 하지 않았다.

실행:

```powershell
node .codex-tmp\recon1094\liveqa.mjs
```

유효 원문:

```text
LOGIN_HTTP=200 ROLE=MASTER
DRAFT_BUSINESS_ID=2026/08/07-8
PASS | 입금보고서 번호 하이퍼링크 | tag=A text=2026/08/07-8
PASS | 번호 링크 UUID 비노출 | visible=2026/08/07-8
PASS | 입금보고서 원래 URL/scroll 복귀 | before=640 after=640 url=http://127.0.0.1:52794/#/accounting/admin/cash-receipts?slipNo=2026%2F08%2F07-8
PASS | mutation 후 원래 entry identity 유지 | before=640 after=640 url=http://127.0.0.1:52794/#/accounting/admin/cash-receipts?slipNo=2026%2F08%2F07-8
```

초기 스크립트의 아래 1행은 무효 측정으로 집계에서 제외했다.

```text
FAIL | 입금보고서 DS 상세 셸과 뒤로가기 공존 | detail-grid=0 ...
```

이유: #1175의 `detail-grid` 계약 대상은 주문·견적 상세이고 cash detail은 별도 Card 표면이다. 실제 캡처에는 cash 상세 본문과 `목록` 버튼이 정상 렌더됐다.

그 다음 direct page 대기 중 전용 스택이 응답 정지했다.

```text
locator.waitFor: Timeout 20000ms exceeded.
waiting for getByRole('button', { name: '목록', exact: true }) to be visible
```

후속 전용 health 원문:

```text
39780=FAIL:The operation has timed out.
39781=FAIL:The operation has timed out.
39787=FAIL:The operation has timed out.
39788=FAIL:The operation has timed out.
39789=FAIL:The operation has timed out.
39792=FAIL:The operation has timed out.
```

Docker daemon의 `docker ps`, `docker stop`도 각각 timeout됐다. 공유 스택으로 대체하지 않았고, 이 환경 실패를 제품 결함으로 집계하지 않았다. 전용 `recon1094-*` 정리 요청도 daemon timeout으로 완료 확인하지 못했다.

## 집중 회귀 원문

입금보고서 return contract:

```text
Test Files  4 passed (4)
Tests       38 passed (38)
Duration    19.65s
```

명령:

```powershell
npx vitest run src/renderer/utils/returnContract.test.ts src/renderer/routes/CashReceiptListPage.test.tsx src/renderer/routes/CashReceiptDetailPage.test.tsx src/renderer/routes/CashReceiptFormPage.test.tsx
```

주문·견적 기존 회귀:

```text
Test Files  4 passed (4)
Tests       41 passed (41)
Duration    5.58s
```

명령:

```powershell
npx vitest run src/renderer/routes/EstimateListPage.test.tsx src/renderer/routes/EstimateDetailPage.test.tsx src/renderer/routes/SalesPartnerOrderListPage.test.tsx src/renderer/routes/SalesPartnerOrderDetailPage.coedit.test.tsx
```

41개 기존 테스트는 DS/도메인 기능을 통과하지만 F1~F4 계약을 검사하지 않는다. 테스트 통과를 결함 부재로 해석하지 않았다.

## 스크린샷 전부

- `docs/qa/2026-08-12-1094-reconv/01-cash-list-document-link.png`
- `docs/qa/2026-08-12-1094-reconv/02-cash-detail-ds-shell-back.png`
- `docs/qa/2026-08-12-1094-reconv/03-cash-after-edit-return-identity.png`

세 파일은 격리 clone DB + 전용 397xx API + 이 worktree renderer 52794의 실제 렌더다. 두 번째 캡처 상단의 업데이트 확인 실패 배너는 격리 환경에서 외부 업데이트 확인 endpoint가 없는 현상이며 #1094 판정에 포함하지 않았다.

## 삭제된 추적 파일 확인

git 명령 없이 worktree index v2를 직접 읽고 19,382개 추적 entry의 실제 경로 존재를 전수 확인했다.

```text
INDEX_SIGNATURE=DIRC
INDEX_VERSION=2
TRACKED_ENTRY_COUNT=19382
MISSING_TRACKED_COUNT=0
```

**삭제된 추적 파일 없음.**

## 변경 범위

- 구현 코드 변경 없음
- 생성한 영구 산출물: 본 보고서와 위 스크린샷 3장
- `.codex-tmp/recon1094/`에는 복제 파일, SELECT 원문, restore/live 출력, QA 보조 스크립트가 있다
- git 명령·commit·push 미수행
