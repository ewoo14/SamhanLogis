# #1092 S10 — 작성일 필드 분리·부분 페이지 보존

## 판정

S9에서 확인된 두 blocking 결함을 수정했다.

- 주문 요약의 `submittedAt`은 `confirmedAt`으로 복원했다. DRAFT는 `submittedAt=null)이며 발송일 빈칸이 정답이다.
- `createdAt`을 주문 요약 DTO에 가산해 통합 목록의 작성일로 사용한다.
- 통합 모델은 표시용 `writtenAt=createdAt`과 정렬용 `sortAt=submittedAt ?? createdAt`을 분리한다. 백엔드 기간 필터·정렬의 `COALESCE(confirmedAt, createdAt)`는 변경하지 않았다.
- 전량 수집 중 후속 페이지 실패 시 성공 페이지의 행을 보존하고, 해당 계열을 불완전 상태로 오류 배너에 표시한다.

커밋·push 없음. 공유 Docker 스택 재기동 없음. 백엔드 변경은 재배포가 필요하므로 개발책임자가 재배포해야 한다.

## RED → GREEN

| 검증 | RED | GREEN |
|---|---|---|
| RED-A | 기존 DTO 테스트가 `createdAt()` 부재로 컴파일 실패 | DRAFT `submittedAt=null`, `createdAt=createdAt` |
| RED-B | 통합 모델 테스트가 DRAFT 작성일을 `null`로 받음 | 주문 행 작성일이 `createdAt`으로 표시 |
| RED-C | 표시일을 바꾼 뒤 기존 정렬 fixture가 역전됨 | 표시일과 정렬일을 분리해 `submittedAt ?? createdAt` 활동순 유지 |
| 부분 실패 | 후속 페이지 실패 시 첫 페이지 행이 사라짐 | 첫 페이지 행 유지 + `종합견적서` 불완전 오류 배너 |
| RED-D | — | 기존 통합 토글/복원/필터/페이징/상세/신규 이동과 UUID·담당 비노출 회귀 테스트 전체 PASS |

## `submittedAt` 소비처 전수조사

저장소 production 소스에서 주문 도메인과 동명 타 도메인을 구분해 확인했다.

| 소비처 | 라벨/사용 | 복원 후 영향 |
|---|---|---|
| `SalesPartnerOrderListPage.tsx:272-277` | **발송일** 열에 `ymd(o.submittedAt)` 표시 | 의도대로 confirmedAt만 표시. DRAFT는 빈칸이며 상세 응답과 일치 |
| `SalesPartnerOrderListPage.tsx:65-66` | 주문번호 누락 시 React key/testid fallback | 실 주문은 주문번호가 있어 영향 없음. DRAFT의 fallback 값만 생성일 기반에서 null 기반으로 복원 |
| `sales.ts:432` | `PartnerOrderSummary` 계약 필드 | 발송일 의미 유지, `createdAt` 가산 |
| `sales.ts:647` | 상세 응답 normalizer 전달 계층 | `submittedAt` confirmedAt 전달 유지, `createdAt` 가산 전달 |
| `sales.ts:688` | 목록 응답 normalizer 전달 계층 | `submittedAt` confirmedAt 전달 유지, `createdAt` 가산 전달 |
| `estimateUnifiedListModel.ts:94` | 통합 목록의 작성일·활동순 정렬 | 작성일은 createdAt, 정렬은 submittedAt 우선 fallback으로 기존 COALESCE 활동순 유지 |
| `PartnerOrderDetailResponse.java:28` | 주문 상세 응답의 발송일 계약 | 기존 confirmedAt 매핑을 건드리지 않음 |
| `taxInvoiceApi.ts:328` | 세금계산서 전송 완료 시각 | 주문 요약과 무관한 별도 도메인. 영향 없음 |
| `api/mock.ts` 및 테스트 fixture | mock/test 데이터 필드 | 제품 계약 소비처가 아닌 fixture. 통합 모델 테스트 fixture는 createdAt을 보강 |

## 변경 파일

수정:

- `services/partner-order-service/src/main/java/.../PartnerOrderSummaryResponse.java`
- `services/partner-order-service/src/test/java/.../PartnerOrderResponseTest.java`
- `clients/desktop/src/renderer/api/sales.ts`
- `clients/desktop/src/renderer/routes/estimateUnifiedListModel.ts`
- `clients/desktop/src/renderer/routes/estimateUnifiedListModel.test.ts`
- `clients/desktop/src/renderer/routes/EstimateListPage.tsx`
- `clients/desktop/src/renderer/routes/EstimateListPage.test.tsx`

신규 파일:

- `docs/dev-reports/2026-08-08-1092-s10-written-date-field-and-partial-page.md` (본 보고서)
- `docs/superpowers/plans/2026-08-08-1092-s10-written-date-and-partial-page.md` (작업 계획)

참고로 지정 SOL `docs/dev-reports/2026-08-08-1092-s9-sol-premerge-reconvergence.md`도 현재 worktree에서 기존 untracked 상태이며, 이번 수정으로 생성하거나 삭제하지 않았다.

## 검증 결과

- FE focused: 2 files, 13/13 PASS
- FE 전체: 215 test files, 1,977 tests PASS
- FE `npm run typecheck`: PASS
- Real-QA scope/typecheck guard: PASS
- 백엔드 DTO 집중 테스트: BUILD SUCCESSFUL
- 백엔드 `--tests "*Test"`: BUILD SUCCESSFUL
- 백엔드 전체 `:test`: 124초 제한으로 종료. 통합 테스트 대기 중이었으며 실패 판정이 아니라 timeout이다. 공유 Docker는 재기동하지 않았다.

## diff 통계

현재 `git diff --stat` 기준:

- 추가 77줄
- 삭제 28줄
- 변경 파일 7개
- 삭제 줄 수: **28**

삭제는 이전의 단일 `effectiveWrittenAt` 매핑과 `Promise.all` 전체 실패 경로를 제거한 것이다. 기존 COALESCE 쿼리, 상단 견적 표의 `—`, UUID/담당 비노출 로직은 수정하지 않았다.

## 배포 전달

백엔드 `PartnerOrderSummaryResponse`가 바뀌었으므로 partner-order-service 재배포가 필요하다. 재배포는 개발책임자가 수행하며, 이 worktree에서는 Docker 스택을 재기동하지 않았다.

