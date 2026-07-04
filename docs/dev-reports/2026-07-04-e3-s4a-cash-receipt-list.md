# 2026-07-04 — E3 입금보고서 S4a: 목록 페이지 (CashReceiptListPage) (PR #727)

> E3 입금보고서 에픽 S4(FE)의 첫 서브슬라이스. BE(S1 CRUD·S2 분개·S3 통장연계) 완비·FE 미존재 → 목업 기준 **읽기 목록 페이지** 신설. PM 자율 세션에서 캐논 완주(Codex 개발 → Opus 5-agent → Codex → 0수렴).

## 구현 (결정 D1~D4)

- **CashReceiptListPage**(`/accounting/admin/cash-receipts`): `GET /accounting/cash-receipts`(Page) 소비 — 필터(거래처명 partnerName 부분·전표번호 slipNo·구분 kind·기간 from/to)+적용필터 chip+초기화·페이지네이션(page 0-base·**size 50**·Mig14AdminShared 공용). 컬럼 6(목업 §3): 전표번호(slipNo·**plain text**·UUID 금지)·거래처(18자 말줄임)·구분(kind Badge DEPOSIT_REPORT=입금보고서/MANUAL_RECEIPT=수기 입금/BANK_LINKED=통장연계·fallback)·거래일·금액(우정렬 천단위·0='—')·연결 분개번호(없으면 '-'). 상태 4(빈/오류/권한/로딩 skeleton).
- **라우트·메뉴·권한**: index.tsx PermissionGuard(accounting.cash-receipts view)·AppLayout 사이드바 '입금보고서'(회계 그룹)·ROUTE_PAGE_CODES. page-code·V80 권한 시드·FE 배관(permissionsApi/PermissionMatrix)은 S1 기존재.
- **순수 로직 분리**: CashReceiptListPage.model.ts(kind 라벨 SSOT·금액/날짜 포맷·필터 param·말줄임)+테스트. **컴포넌트 렌더 테스트** CashReceiptListPage.test.tsx(jsdom·dead-link/오류-빈 배타 회귀 가드). mock parity(GET /cash-receipts Page·필터).

## 라운드 체인 (실행=게시 1:1)

①**Codex 개발**(`5cdbbdab1`) → ②**Opus 5-agent R1**(HIGH1·MED4·LOW4): 전표번호 dead link·권한없음 dead 분기(PermissionGuard 규약)·오류+빈 동시 노출·PAGE_SIZE 20/50 불일치·kind 라벨 SSOT 중복·헤더 건수 중복·화면명 '현금 입금'≠메뉴 → **Opus 직접 fix**(`0e20423c8`)+컴포넌트 테스트 신설+라이브 QA(`6a35f9e01`) → ③**Codex 라운드**(2 LOW): mock amount:'0' BE-불가·Playwright 오류/빈 E2E 갭 → **Codex fix**(`9a359c558` amount>0 parity·LOW2 dispose)+QA 재캡처(`1f4208560`) → ④**Opus 인라인 재검 0 ↔ Codex 최종 "0 findings 수렴"** → **양쪽 0수렴 확정**.

## 검증

- desktop typecheck·vitest(전체 546+·CashReceiptListPage 2·model 4·mock parity) · **CI 30/30 green** · Playwright 회귀 스펙(`cash-receipt-list.spec.ts`: 목록·kind badge·전표 plain text·구분 필터) passed
- 라이브 QA GUI 캡처 2장(`docs/qa/727-cash-receipt-list/`·SHA-pinned 인라인+사용자 인라인 전송)
- ⚠️ 로컬 `client.authheaders.test.ts` 4실패=**환경 flake**(apiClient 미접촉·dev 커밋서도 동일·CI frontend 잡 통과 확인) → CI 권위

## 전표번호 형식 parity (개발책임자 적발 → sweep)

머지 직전 개발책임자가 QA 스샷에서 **전표번호 형식 오류** 적발 — mock 이 `SLP-202605-021`·`JRN-202605-49` placeholder 를 썼으나 합의 표준([[feedback_slip_order_number_format]])은 슬래시 `YYYY/MM/DD-N`, 실 BE(`SlipNumberService`·`JournalNumberService`)는 이미 슬래시 채번. 두 리뷰 라운드가 필드/컬럼은 대조했으나 **값 형식 parity 를 놓침**([[feedback_mock_value_format_be_parity]] 신설). [[feedback_defect_family_sweep_fix]] 로 전수 sweep:
- **입금보고서**: MOCK_CASH_RECEIPTS slipNo/journalNo → `2026/05/DD-N`, externalRef SLP 임베드 제거, mock.test 형식 가드 테스트.
- **매출/매입전표**(개발책임자 지시 "이 PR 함께 sweep"): `salesAccountingSlipApi.ts`·`purchaseAccountingSlipApi.ts` mock slipNo `SAS-`/`PAS-` → 슬래시, id → UUID(실 BE parity). sp-sas 회귀 15/15.
- **전 메뉴 전수**(개발책임자 "모든 메뉴 확인?"): 필드값 155건 + 동적 생성까지 재검 — JV-(분개·원장)·대시날짜·EDP suffix·SO-·배차이력 `${date}-001/002/004`(선행0·template literal) 교정. sweep 오변경(배차 taskCode `-MANUAL` semantic 마커 → `-3`) 회귀도 복원.

## 문서번호 전체 통일 (개발책임자 "전체 통일")

전표번호 외 업무 문서번호도 슬래시 표준. 3부류 판별:
- **A. BE 이미 슬래시·mock만 오류**: 견적(`EstimateNumberService`=yyyy/MM/dd-N) → mock Q- 교정.
- **B. BE 접두사 채번 → 변경**: 수금계획 `CollectionPlanService`(랜덤 CP-yyyyMMdd-NNNNNN → 일자별 순차 `CollectionPlanNumberSequence`+V55)·감사 `InventoryAuditService`(AU-yyyyMMdd-NNN → yyyy/MM/dd-N+V20). %2F 대응: `CollectionPlanController` `/{year}/{month}/{daySeq}/status` overload + FE `encodeURIComponent` 제거(literal 경로).
- **C. 외부 발번 유지**: 어음 NR-(은행)·국세청 NTS·카드 CARD-·CODEF ref.

### 머지 전 실환경 검증 (Docker)
- **마이그 전환 probe ✅**: throwaway PG에 old AU-/CP- seed → V20/V55 적용 → `AU-20260519-001`→`2026/05/19-1`·`CP-20260705-000101`→`2026/07/05-101`·시퀀스 백필 `2026-07-05|102` 정확. **중복 충돌 시 RAISE EXCEPTION·데이터 무손상** 실증(CI fresh DB 미검증 경로 보강).
- **수금계획 %2F ✅(조각 검증)**: 게이트웨이가 encoded `%2F`·literal 슬래시 경로 **둘 다 미차단**(401 auth)·BE overload IT 통과·FE literal 경로 정합. 인증 e2e는 스택 재빌드 회피로 미실행(개발책임자 승인).
- **sales.ts:321 %2F ✅ 무관**: `getEstimate` param 이 이름과 달리 UUID id(Javadoc 명시).

## 파생/백로그

- **S4b 작성폼**(POST/PATCH·account 102·transactionDate 프리필·BANK_LINKED PATCH 비활성=S4 인지 2/3) → **S4c** BankTransactionPage 다중선택→`/from-bank-transactions` 생성 → **S4d** coedit. 전표번호 상세 링크는 S4b(상세 페이지) 도입 시 배선.
- **[BE/FE·follow-up] 매출/매입전표 post 경로 slipNo** — `postSalesSlip`/`postPurchaseSlip`(salesAccountingSlipApi.ts:223 등)이 슬래시 slipNo 를 `encodeURIComponent` 로 URL 경로에 넣음. ⚠️ 단 본 세션 Docker 검증서 게이트웨이가 `%2F` 를 **차단하지 않음**(401 auth 통과) 확인 → 당초 우려한 firewall 차단은 미발생. 그래도 판매전표 후속 슬라이스에서 실 status/post e2e 확인 권장(별도 슬라이스).
- **[BE·별도 슬라이스]** `CashReceiptService.resolvePartnerFilterIds` partnerName 필터 partner directory 검색 limit=100·페이지네이션 없음 → 100 초과 매칭 시 silent truncation(S1 pre-existing·후속).
- Playwright 오류/빈 상태 E2E(현 component test unit 커버)·mig-14 admin shared kind 라벨 향후 cross-page 사용 시 위치 재고.

## 교훈

- **목업의 '링크'도 타깃이 있어야 링크** — 전표번호를 자기 목록 경로로 링크했으나 URL→필터 미배선이라 dead link. 상세 페이지가 없는 목록-only 슬라이스에서는 plain text 가 정직(링크는 상세 슬라이스에 동반).
- **PermissionGuard 라우트 하에선 컴포넌트 내부 권한 재검사는 dead code** — 가드가 리다이렉트하므로 페이지 내부 '권한없음' 분기·메시지는 도달 불가. 목업의 권한없음 문구는 가드 규약(리다이렉트)으로 대체됨.
- **mock 시드도 BE 제약(@DecimalMin) parity** — 0원 행 등 BE-불가 데이터를 mock 이 노출하면 QA 가 비현실 표시를 정상으로 학습. 시드 금액>0 계약 테스트로 고정.
- **오류/빈 상태는 상호배타 렌더** — isError 시 빈 테이블(마스코트+빈문구)을 함께 그리면 상반 메시지 동시 노출. error XOR (table+empty).
