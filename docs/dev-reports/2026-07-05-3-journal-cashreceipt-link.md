# 2026-07-05 — #3 분개→입금보고서 직접 링크 (cashReceiptSlipNo) — PR #744

> 입금보고서(CashReceipt) 확정 시 자동 게시되는 라이브 분개(Journal, sourceType=CASH_RECEIPT)가
> 원본 CashReceipt로 되돌아가는 직접 링크가 없던 결함을 해소. Codex 개발(`a0f90b9a7`) +
> Opus 5-agent 라운드1 LOW 지적 fix(실 HTTP IT 보강, 본 문서).

## 배경 / 문제

CashReceipt 확정(`POST /accounting/cash-receipts/{id}/confirm`)은 `sourceType=CASH_RECEIPT`,
`sourceRefId=<cashReceiptId>` 인 POSTED 분개를 자동 생성해 `cash_receipts.journal_id` 로
**CashReceipt → Journal** 정방향 링크는 이미 존재했다. 그러나 분개장(`GET /accounting/journals/{id}`)
쪽에서 조회할 때는 **Journal → CashReceipt** 역방향 링크가 없어, 담당자가 라이브 분개를 보고 "이 분개를
발생시킨 입금보고서가 무엇인지" 원문서로 되돌아갈 방법이 없었다.

## 변경

- **BE — `JournalDetailResponse`**: `sourceRefId`(UUID, FE 라우팅 전용) + `cashReceiptSlipNo`
  (String, 화면 표시용) 필드 신규. 4-인자 정적 팩토리 `of(journal, accountNamesByCode,
  partnerNamesById, cashReceiptSlipNo)` 로 확장하고 기존 1/3-인자 오버로드는 `null` 위임 유지
  (하위 호출부 무영향).
- **BE — `JournalService.getOne`**: `resolveCashReceiptSlipNo(journal)` 신규 — `sourceType ==
  CASH_RECEIPT && sourceRefId != null` 인 경우에만 `CashReceiptRepository.findByIdAndIsDeletedFalse`
  로 원본 CashReceipt 를 조회해 `slipNo` 를 enrich. 그 외(MANUAL/기타 sourceType, soft-delete 된
  CashReceipt, sourceRefId null)는 `null` — FE 는 링크 미노출로 자연 폴백.
- **BE — `CashReceiptRepository`**: `findByIdAndIsDeletedFalse(UUID)` 신규 추가(soft-delete 인지 조회 — 기존 `findBySlipNo` 옆 나란히 배치).
- **FE — `JournalDetailPage`**: `cashReceiptId`(=`sourceRefId`) 와 `cashReceiptSlipNo` 가 모두
  존재할 때만 "입금보고서 {slipNo} 보기" 링크 렌더. 라우팅은 UUID(cashReceiptId) 로, 화면 표시
  텍스트는 slipNo 만 — [[feedback_uuid_no_user_visibility]] 준수(mutation/routing path 의 UUID
  는 기존 `journal.id` 와 동일한 관례, 화면 노출 금지 대상은 아님).

## 리뷰 라운드 이력 (실행=게시 1:1)

1. Codex 개발 완료(`a0f90b9a7`) — 검증: accounting `:test` 1134 0 fail·FE typecheck 0·vitest 610·
   mock 실화면(jv-006 링크·UUID 미노출) → 게시.
2. **Opus 5-agent 라운드1** — 5차원 전부 🟢 0 blocking (BE/QA-라이브/FE/DevOps/Design). 비차단
   **LOW 2건**: ① 실 HTTP IT 부재(`JournalServiceTest` 단위 mock 만 존재, 실 Postgres+실 컨트롤러
   경로 IT 권장) ② `JournalDetailResponse.of` 오버로드 일부 미사용(dead code, pre-existing) → 게시.
3. **본 fix(Opus 직접, LOW① 만 — 작업 범위 한정)**: `CashReceiptControllerIT` 확정 흐름 테스트에
   실 HTTP `GET /accounting/journals/{id}` 호출 + `$.data.sourceRefId` / `$.data.cashReceiptSlipNo`
   단언 추가(본 문서 하단 상세). LOW② (dead code 오버로드) 는 pre-existing·본 라운드 지시 범위 밖 —
   별도 처리 필요(backlog).

## 검증 (신규 실 HTTP IT — 실 Postgres, @MockBean 우회 없음)

`CashReceiptControllerIT.confirmCreatesPostedJournalWithDefaultAndOverrideAccounts()` 는 이미
실 컨트롤러(`CashReceiptController`)+실 서비스+실 Postgres(Testcontainers)로 CashReceipt 생성→확정
→POSTED 분개 생성까지 검증하던 기존 흐름이다. 이 흐름에 다음을 추가:

```java
mockMvc.perform(get("/accounting/journals/{id}", journalId)
                .header("X-User-Id", ACCOUNTANT_ID)
                .header("X-User-Role", "ACCOUNTANT"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.sourceRefId").value(defaultReceiptId))
        .andExpect(jsonPath("$.data.cashReceiptSlipNo").value(defaultSlipNo));
```

`JournalService`, `CashReceiptRepository`, `DynamicPermissionClient`(외부 인증 client 만 mock,
[[feedback_it_mockbean_external_clients]] 준수) 모두 실 빈 — `JournalController.getOne` →
`JournalService.getOne` → `resolveCashReceiptSlipNo` → `CashReceiptRepository
.findByIdAndIsDeletedFalse` 실 조회 경로를 실 HTTP 요청/응답으로 end-to-end 검증한다(단위 mock 우회 없음).

- 실행: `./gradlew :services:accounting-service:test --tests "*CashReceiptControllerIT"
  --tests "*JournalServiceTest" --rerun-tasks --no-build-cache`
- 결과: `CashReceiptControllerIT` 24 tests / 0 failures / 0 skipped(Docker 가용 확인 — genuine
  실행, FROM-CACHE 아님), `JournalServiceTest` 10 tests / 0 failures(기존 단위 테스트
  `getOneAddsCashReceiptSlipNoForLiveCashReceiptJournal` 포함, 신규 IT 와 상호보완).
- 라이브 QA(기존 라운드 산출물, 재사용): `docs/qa/3-journal-cashreceipt-link/` 3스샷 —
  분개상세 "입금보고서 {slipNo} 보기" 링크 렌더 → 클릭 시 CashReceipt 상세로 이동 → 화면 어디에도
  raw UUID(`00000000-...`) 미노출, 수기 분개(MANUAL) 역분개 버튼 등 기존 화면 회귀 없음.

## UUID 비노출 확인

- `JournalDetailResponse.sourceRefId` 는 JSON 페이로드에 UUID 그대로 존재하지만, 이는 기존
  `id`(분개 UUID, `/journals/{id}/reverse` 등 mutation path) 와 동일한 **라우팅 전용** 용도다.
  화면에 실제 렌더되는 값은 `cashReceiptSlipNo`(예: `2026/07/03-1`) 뿐이며, FE 는 `sourceRefId`
  를 라우팅 파라미터로만 소비한다 — [[feedback_uuid_no_user_visibility]] 위반 아님(JournalController
  Javadoc 의 기존 관례와 동일선상).

## backlog / 후속

- **LOW② dead code 오버로드(pre-existing)**: `JournalDetailResponse.of(Journal)` (1-인자) 와
  `of(Journal, Map, Map)` (3-인자) 오버로드가 실 호출부 0건(grep 확인, `JournalService` 는 4-인자
  버전만 호출) — 본 PR 이전부터 존재하던 미사용 편의 오버로드. 본 라운드 지시 범위(실 HTTP IT +
  dev-report 2건) 밖이라 미착수 — 별도 정리 필요(제거 또는 실사용처 재확인).
- 문서화 규율: 본 문서는 [[feedback_continuous_docs_sync]] 에 따라 PR #744 통합 시점에 함께 커밋.
