# Samhan Public 누락 기능 종합 Catalog

> **branch** — `feature/integrated-phase-12-step-6-manual-rewrite` (Phase 12 step-6 — 매뉴얼 전체 재작성 / Stage 4 = `...-step-5-manual-augmentation`)
> **작성일** — 2026-05-10 (Stage 1 초안 → Stage 2 갱신 → Stage 3 갱신 → Stage 4 Phase 12 실시간 협업 ✅ → **Phase 12 step-6 매뉴얼 전체 재작성 ✅ row 추가**)
> **목적** — 개발책임자가 본 docs 만으로 P0 누락 기능을 즉시 파악 가능하도록 하는 종합 카탈로그.
> **출처** — 이카운트 ERP 16 캡처(`docs/migration/ecount-reference/`) + 메모리 가드(`feedback_*.md` / `project_*.md`) + 한국 일반기업회계기준 / 한국 ERP 표준 + 다른 agent 의 `backend-feature-inventory.md` (17 service / 145 endpoint / 누락 42건) + `frontend-feature-inventory.md` (3 client / 27 desktop 라우트 / 누락 8건) + 본 task 검증 + Stage 2 `stage2-scenarios.md` (74 검증 항목) + **Stage 3 `stage3-final-scenarios.md` (120 검증 항목)** + **Stage 4 Phase 12 시리즈 (PR-H1 → PR-H4c) 종결**.
> **상태 표기** — ✅ 완료 / ⏳ 부분 (stub/skeleton/TODO) / ❌ 미구현 / ⚠️ 미흡 (구현은 됐으나 실 운영 부족)

---

## 2026-05-16 SP-05 재점검

PR #203~#206 이후 Samhan Public 전메뉴를 다시 보며 아래 P0 항목의 “UI 부재” 판정을 정정한다.

- 거래처 기본 생성 UI는 `/admin/partners/new`로 운영 가능하다. `/admin/partners` 목록, 생성, 상세/수정 진입은 `SALES / MANAGER / MASTER` 공용 권한으로 정렬됐다. 이카운트 4탭 중 여신/단가·부가정보 고급 필드는 잔여 보강으로 남긴다.
- 판매관리와 구매관리는 각각 `/sales/new`, `/purchases/new` 생성 진입점과 `/sales/:id`, `/purchases/:id` 상세/수정 진입점을 노출한다.
- 구매관리 목록 CTA로 입고 검수 Dialog 진입 가능하다. `SAVED / CONFIRMED` 입고전표는 `WAREHOUSE / MANAGER / MASTER` 권한에서 행 단위 `검수` 버튼을 통해 처리한다.

---

## 0. 우선순위 분류 정의

| 등급 | 의미 | 시한 권고 | Phase 11 진입 가드 |
|---|---|---|---|
| 🔴 **P0** | 실 운영 차단 — 미구현 시 운영자가 작업 불가 | **Phase 11 AWS migration 진입 전 의무 구현** | **차단 (BLOCKER)** |
| 🟠 **P1** | 운영 후 1개월 내 — 사용자 불편 / 우회 방법 존재 | Phase 11 후 1개월 내 | 권고 (NON-BLOCKING) |
| 🟡 **P2** | 운영 후 3개월 내 — 편의 기능 | Phase 11 후 3개월 내 | 정보 |
| 🟢 **P3** | long-term — 차세대 기능 | 6개월~1년 | 정보 |

> **메모리 가드 결정** (`project_phase11_aws.md`) — Phase 11 AWS 단일 환경 진입 시 P0 누락은 운영 즉시 차단. 본 catalog 는 Phase 11 진입 전 사전 슬라이스 PR 의 입력으로 사용.

---

## 1. P0 (실 운영 차단) — Phase 11 진입 전 의무 구현 ⭐

### P0-1. 회계 17 보고서 (이카운트 091847 캡처 기준)

> **이카운트 reference** — `docs/migration/ecount-reference/20260509_091847.png` 의 17 보고서 카테고리 (경영자료 9 + 장부 11 + 주요재무제표 5).
> **현재 Samhan Public** — `accounting-service` `/accounting/balances` (월 시산표 1건) 만 구현. 16건 미구현.
> **연관 메모리** — `project_korean_accounting.md` (한국 일반기업회계기준 표준 계정과목 코드 100/200/300/400/500/800/900 seed required).

| # | 보고서 | 카테고리 | 상태 | 비고 |
|---|---|---|---|---|
| 1 | 자금일보 | 경영자료 | ❌ | 일별 입출금 합계 (한국 ERP 표준) |
| 2 | 현금흐름(입출금내역) | 경영자료 | ❌ | 영업/투자/재무 활동 분류 |
| 3 | 자금현황표 | 경영자료 | ❌ | |
| 4 | 자금증감내역 | 경영자료 | ❌ | |
| 5 | 월별손익분석 | 경영자료 | ❌ | 월 매출/매입/이익 추이 |
| 6 | 월별원가분석 | 경영자료 | ❌ | |
| 7 | 채권/채무수금기간표 | 경영자료 | ❌ | 거래처별 수금 일자 분석 |
| 8 | 채권/채무잔액분석표 | 경영자료 | ❌ | 거래처별 미수금/미지급금 |
| 9 | 회계집계표 | 경영자료 | ❌ | |
| 10 | 계정별원장 | 장부 | ❌ | 계정과목별 분개 시계열 |
| 11 | 계정별거래처별원장 | 장부 | ❌ | 거래처별 매출/매입 원장 |
| 12 | 거래처별계정별원장 | 장부 | ❌ | 위와 축 반전 |
| 13 | 계정별적요별원장 | 장부 | ❌ | |
| 14 | 분개장 | 장부 | ⏳ | `/accounting/journals` 목록 — 인쇄 양식 ❌ |
| 15 | 시산표 | 장부 / 주요재무제표 | ✅ | `TrialBalanceController.byPeriod(yyyyMM)` — summary 추가 포함 |
| 16 | 재무상태표 | 주요재무제표 | ✅ | PR#134 BE+FE 정식 운영 `/accounting/reports/balance-sheet` |
| 17 | 손익계산서 | 주요재무제표 | ✅ | PR#134 BE+FE 정식 운영 `/accounting/reports/income-statement` |
| (추가) | 합계잔액시산표 | 주요재무제표 | ❌ | 장기 backlog — 시산표 활용으로 대체 |

**→ P0-1 상태 갱신 (2026-05-11): PR#134/136/137 로 손익계산서/재무상태표/부가세/법인세/거래처미수미지급/현금흐름표/자본변동표/일계표/월계표/시산표/거래처원장 11건 정식 운영. 잔여 장기 backlog 5건 (계정원장/원천세/합계잔액시산표/분개장/부서별손익).**

### P0-2. 비밀번호 재설정

> **검증 출처** — `services/auth-service/src/main/java/com/samhanair/logis/auth/web/AuthController.java` 65 line. `/auth/login` + `/auth/register` (MASTER) + `/auth/me` 만 존재. password / reset / change 키워드 zero hit.
> **매뉴얼 영향** — `01-로그인.md` 4-2 / FAQ Q2 / `02-메인-화면.md` §3-3 모두 약속만 하고 실 구현 없음 (`scenarios.md` 1.2.1 F1 / F4).

| # | 기능 | 상태 | 비고 |
|---|---|---|---|
| 1 | 사용자 본인 비밀번호 변경 (current → new) | ❌ | `/auth/password` PUT 엔드포인트 부재 |
| 2 | 첫 로그인 시 강제 변경 (force-change-on-first-login flag) | ❌ | `Account` 도메인에 flag 컬럼 없음 |
| 3 | 비밀번호 분실 — 이메일 reset link | ❌ | `notification-service` 와 미연계 |
| 4 | 관리자 강제 reset (MASTER 만) | ❌ | `/auth/internal/accounts/{id}/disable` 만 존재. reset 별도 |
| 5 | 비밀번호 정책 (8자 이상, 특수문자 강제) | ❌ | BCrypt 해싱만 있음 |
| 6 | 5회 실패 시 계정 잠금 + 잠금 해제 endpoint | ❌ | `failed_login_attempts` / `locked_at` 컬럼 부재 |
| 7 | 비밀번호 변경 이력 (마지막 N개 재사용 금지) | ❌ | `password_history` 테이블 부재 |
| 8 | **무제한 시도 보안 위험 안내** *(Stage 3 N15)* | ❌ | 5회 잠금 미구현 → 무차별 시도 가능 (외부 노출 시 보안 risk). Phase 11 AWS 진입 전 brute-force 방어 의무 |

**→ P0-2 누락: 8건 (+1 보안 위험). 시한: Phase 11 진입 전 1 PR 통합 (보안 우선순위 상향).**

### P0-3. 거래처 첨부파일 실 multipart upload

> **검증 출처** — `services/partner-service/src/main/java/com/samhanair/logis/partner/service/MinioAttachmentStorage.java` (28 line `@ConditionalOnProperty(value = "app.partner.minio.enabled", havingValue = "true")`). 기본값 = `NoopAttachmentStorage` fallback.
> **메모리 가드** — `feedback_continuous_docs_sync.md` PR #80/85 패턴 폐기 후 본 PR 통합 의무.

| # | 기능 | 상태 | 비고 |
|---|---|---|---|
| 1 | Entity + REST endpoint (PR #100) | ✅ | `PartnerAttachmentController` |
| 2 | MinIO 실 multipart upload (production profile) | ⏳ | `NoopAttachmentStorage` default fallback. 실 환경 검증 미완료 |
| 3 | 바이러스 스캔 (ClamAV / 외부 API) | ❌ | 운영 시 보안 위협 |
| 4 | 파일 크기 제한 (서버측 검증) | ⚠️ | `application.yml` `multipart.max-file-size` 만, 검증 메시지 한국어 부재 |
| 5 | MIME type 화이트리스트 | ❌ | |
| 6 | 첨부파일 download endpoint (presigned URL TTL) | ⏳ | MinIO 만 5분 TTL — 검증 필요 |
| 7 | 거래처 외 도메인 (slip / journal / employee) 첨부 | ❌ | partner 만 구현 |
| 8 | **slip 도메인 사진 첨부 (검수)** *(Stage 3 N4)* | ❌ | 신규 P0-9 검수 UI 와 연계. multipart 도메인 확장 |
| 9 | **journal 도메인 첨부 (영수증 사진)** *(Stage 3 N11)* | ❌ | 회계 외주가 영수증 사진 첨부 필요 |

**→ P0-3 누락: 8건 (+2 도메인 확장). 시한: Phase 11 진입 전 1 PR (multipart 도메인 추상화 + 3 도메인 확장).**

### P0-4. 전표 인쇄 양식 (출고전표 / 거래명세서 / 세금계산서)

> **검증 출처** — `clients/desktop/src/renderer/print/InvoiceView.tsx` + `DispatchView.tsx` (2 view). 거래명세서 / 세금계산서 인쇄 양식 부재.
> **메모리 가드** — `feedback_print_design_iteration.md` (인쇄 양식 단번 완성 금지 — 3~5회 iteration 의무, PR #21 회고).

| # | 기능 | 상태 | 비고 |
|---|---|---|---|
| 1 | 출고전표 인쇄 (DispatchView) | ✅ | `print/DispatchView.tsx` |
| 2 | 거래명세서 인쇄 (InvoiceView) | ⏳ | `print/InvoiceView.tsx` — legacy v4 일부 |
| 3 | 세금계산서 인쇄 (한국 국세청 양식) | ❌ | 양식 자체 부재 |
| 4 | 세금계산서 발행 (전자세금계산서 — 국세청 e-Tax 연계) | ❌ | API 연계 없음 (NTS Hometax) |
| 5 | 영수증 인쇄 (간이영수증) | ❌ | |
| 6 | 견적서 인쇄 (PrintPreview DS 컴포넌트만 존재) | ⏳ | `frontend-feature-inventory.md` §1.1 #35 PrintPreview 미사용 |
| 7 | 인쇄 미리보기 표준화 (A4 / 88mm 영수증 분기) | ❌ | |

**→ P0-4 누락: 5건. 시한: Phase 11 진입 전 1 PR (세금계산서 + 견적서 인쇄).**

### P0-10. e-Count schema 12 컬럼 + API 호출 폐기 — Stage 4 (Phase 10 step-14, PR-G1) ✅ 완성

> **이전 분석 출처** — e-Count BulkDatas 14 필드 vs Samhan Public schema 비교 (`docs/migration/ecount-reference/20260509_091636.png` 판매입력 + `091652.png` 구매입력 양식). 기존에는 이카운트 호환을 위한 외부 API 호출 + 메모 1000자 결합으로 부가 정보 보존.
> **사용자 명시 결정** — 자체 분개 + 출고전표 자동 조회 + accounting-service native 이식 (PR #117 + #118) 100% 완성 후 schema 정리 단계 진입. 이카운트 외부 호출 폐기 → Samhan Public 자체 발행 (`POST /api/v1/slip-publish/from-{estimate,partner-order}`) 으로 일원화.

| # | 기능 | 상태 | 비고 |
|---|---|---|---|
| 1 | `IO_TYPE` (입출고 구분 코드 `10`/`11`) | ✅ (PR-G1) | slip 헤더 컬럼 |
| 2 | `TIME_DATE` (분 단위 처리 시각) | ✅ (PR-G1) | `LocalDateTime` |
| 3 | `customer_tel` (거래처 전화 snapshot) | ✅ (PR-G1) | partner-service 자동 snapshot |
| 4 | `customer_addr` (거래처 주소 snapshot) | ✅ (PR-G1) | partner-service 자동 snapshot |
| 5 | `customer_rep` (거래처 대표자 snapshot) | ✅ (PR-G1) | partner-service 자동 snapshot |
| 6 | `shipping_addr` (배송지 별도 입력) | ✅ (PR-G1) | 거래처 주소와 다를 때 영업 입력 |
| 7 | `inspection_addr` (검수지 별도 입력) | ✅ (PR-G1) | 도착 후 검수 위치 |
| 8 | `receiver_phone` (수령자 전화) | ✅ (PR-G1) | DeliveryBatch SMS share token 발송처 |
| 9 | `payment_due` (입금 예정일 `MM-DD`) | ✅ (PR-G1) | 거래처 수금예정일 자동 채움 + 수정 |
| 10 | `discount_info` (할인 정보) | ✅ (PR-G1) | DC 적용 내역 |
| 11 | `collect_term` (결제 조건) | ✅ (PR-G1) | 거래처 결제조건 자동 채움 + 수정 |
| 12 | `agree_term` (약정 조건) | ✅ (PR-G1) | 반품 / 교환 / 보증 |
| 13 | **이카운트 외부 API 호출 폐기** | ✅ (PR-G1) | BulkDatas 호환 외부 호출 코드 제거 → Samhan Public 자체 발행 일원화 |
| 14 | **`composeMemo` 리팩토링** (메모 1000자 결합 → 12 컬럼 분리) | ✅ (PR-G1) | `SlipPublishService.composeMemoLines` 12 컬럼 분리 후 메모는 자유 텍스트만 |
| 15 | **partner_code resolve 보강** (V15 → V16) | ✅ (PR-G1) | `partner_code` snapshot 누락 row backfill + `customer_*` 3 컬럼 동시 채움 |

**→ P0-10 = ✅ 완성 (Phase 10 step-14, PR-G1). Phase 11 진입 시 별도 PR 불필요.**

### P0-5. 사용자 / 권한 관리 화면

> **갱신 (2026-05-11)** — PR #140 P0-5 정식 출시 완료. 아래 표는 이전 상태 이력.
> **현황** — `/admin/users` / `/admin/roles` 정식 운영 중. MASTER 전용 사용자 관리 5 페이지 운영.

| # | 기능 | 상태 | 비고 |
|---|---|---|---|
| 1 | 직원 목록 / 등록 / 수정 / 퇴사 | ✅ | PR #140 정식 운영 |
| 2 | 부서 등록 / 수정 / 조직도 | ⚠️ | backend ✅ / 조직도 시각화는 장기 backlog |
| 3 | ROLE 변경 endpoint | ✅ | `/auth/internal/accounts/{id}/role` |
| 4 | ROLE 변경 UI | ✅ | PR #140 정식 운영 |
| 5 | 권한 매트릭스 시각화 (어떤 ROLE 이 어떤 endpoint) | ❌ | 장기 backlog |
| 6 | 신규 직원 등록 흐름 (직원 + 계정 + ROLE 일괄 등록) | ✅ | PR #140 정식 운영 |
| 7 | 계정 비활성화 / 활성화 토글 UI | ✅ | PR #140 정식 운영 |

**→ P0-5 ✅ 완료 (PR #140). 잔여 장기 backlog: 권한 매트릭스 시각화, 조직도 시각화.**

### P0-6. 거래처 등록 4 탭 화면 (이카운트 091522 / 091541 / 091555 / 091604)

> **이카운트 reference** — 4 탭 (기본 / 거래처정보 / 여신단가 / 부가정보). 사업자등록번호, 종사업장번호, 종목, 업태, 통화, 영업단가그룹, 출하조정률, 여신한도, 수금/지급예정일.
> **현재 Samhan Public** — `partner-service` backend `PartnerAdminController` (POST/GET/PUT/DELETE) + desktop `/admin/partners`, `/admin/partners/new` 기본 관리 UI 운영. 여신/단가·부가정보의 이카운트 고급 필드는 잔여 보강.

| # | 탭 | 항목 | 상태 |
|---|---|---|---|
| 1 | **기본** | 거래처코드 / 상호 / 대표자 / 업태 / 전화 / 종목 / Fax / Email / 검색창내용 / 담당자 / 주소1·2 / 거래처계층그룹 / 적요 / 특이사항 | `/admin/partners/new` 기본 생성 UI ✅ / 일부 확장 필드 ⏳ |
| 2 | **거래처정보** | 사업자등록번호 / 비사업자(내국인/외국인) / 세무신고거래처 / 종사업장번호 / 모바일 / 업종별구분 (일반/관세사) / 통화 / 파일관리 / 거래처그룹1·2 / 홈페이지 / 출하대상거래처 / 거래유형(영업/구매) | 기본 사업자/연락처/주소 UI ✅ / 세무·그룹·파일 고급 필드 ⏳ |
| 3 | **여신/단가** | 담당자 / 수금/지급예정일 (4 옵션) / 채권번호관리 / 채무번호관리 / 여신한도 / 출고조정률 / 입고조정률 / 영업단가그룹 / 구매단가그룹 / 여신기간 | backend `PartnerCreditService` ⏳ / desktop 고급 탭 ⏳ |
| 4 | **부가정보** | 거래처코드 / 순번 / E-mail 2 / 특이사항 / 주소2 / 등록일자 / 은행 / 숫자형추가항목 1·2·3 | backend ❌ / **UI ❌** |

**→ P0-6 상태: 기본 거래처 등록/수정 UI는 운영 가능. 잔여는 이카운트 4탭 고급 필드 약 20~30개 보강으로 재분류한다.**

### P0-7. 품목 등록 화면 (이카운트 091955 / 092006 / 092016)

> **이카운트 reference** — 7 탭 (기본 / 품목정보 / 수량 / 단가 / 원가 / 부가정보 / 관리대상). 품목구분(원재료/부재료/제품/반제품/상품/무형상품) / 세트여부 / 안전재고 / 부가세율(매출/매입) / 입고/출고/싱글/실외기/멀티 50%/48%/45% / 단풍 35% / 추가수량당수량 / 안전재고관리 (주문서/판매/생산불출/생산입고/창고이동/자가사용/불량처리 7 항목).
> **현재 Samhan Public** — `product-service` backend (`ProductAdminController` POST/sync 만 / `ProductController` GET / `ProductCatalogController`). desktop UI **부재**.

| # | 탭 | 항목 | 상태 |
|---|---|---|---|
| 1 | 기본 | 품목코드 / 품목명 / 규격 / 단위 / 품목구분 / 세트여부 / 재고수량관리 / 바코드 / 생산공정 / 단가 (입고/출하/출고/싱글/실외기/멀티 4 단계/단풍) / 검색창내용 / 품목계층그룹 | backend Product entity ⏳ / **UI ❌** |
| 2 | 품목정보 | 부가세율(매출/매입) / C-Portal공유 / 이미지 / 파일관리 / 품목그룹1·2·3 / 적요 / 품질검사유형 / 품질검사방법 (전수/샘플링%) | backend ❌ / **UI ❌** |
| 3 | 수량 | 추가수량당수량 / 안전재고관리 7 항목 / 안전재고수량 / 창고별지정 / C-Portal최소주문수량체크/수량/단위 / 재고수량 / 조달기간 / 최소구매단위 / 구매처 | backend ❌ / **UI ❌** |
| 4 | 단가 | (캡처 미확인 — 추정) 단가 정책 / 적용기간 / 환율 | ❌ |
| 5 | 원가 | (추정) 표준원가 / 평균원가 / FIFO/LIFO 정책 | ❌ |
| 6 | 부가정보 | 추가항목 | ❌ |
| 7 | 관리대상 | 관리대상 항목 (lot / serial / 유효기간) | ⚠️ inventory `StockLot` 일부 ✅ / **UI ❌** |

**→ P0-7 누락: 7 탭 거의 전부. 시한: Phase 11 진입 전 2 PR.**

### P0-8. 백업 / 복원 절차 + 운영 매뉴얼 부속

> **메모리 가드** — `project_phase11_aws.md` (RDS auto backup 명시). 매뉴얼 운영자 시점에서 백업/복원 가이드 부재.

| # | 기능 | 상태 | 비고 |
|---|---|---|---|
| 1 | RDS 자동 백업 (AWS auto) | ✅ (Phase 11 후) | 메모리 가드 |
| 2 | 매뉴얼 백업 dump 절차 (DBA 가이드) | ❌ | `pg_dump` 사용법 운영자 매뉴얼 |
| 3 | 복원 절차 (운영자 시점) | ❌ | RTO / RPO 운영 가이드 |
| 4 | 시스템 장애 시 사용자 대응 매뉴얼 | ❌ | "서버에 연결할 수 없습니다" 발생 시 IT 연락 절차 |
| 5 | 데이터 export (CSV / Excel) — 직원이 백업 보관 | ❌ | endpoint 자체 없음 |

**→ P0-8 누락: 4건 (운영 매뉴얼 부속). 시한: Phase 11 진입 후 1 PR — 단, BC 운영 정책 정립 선행.**

### P0-9. 입고 검수 (INSPECTING) UI 화면 — Stage 2 신규 발견

> **검증 출처** — `docs/qa/manual-verification/stage2-scenarios.md` §2.1 S5 / §2.2 S5. SP-03 이후 구매관리 행 단위 검수 CTA가 추가되어 기본 입고 검수 진입은 가능하다.
> **메모리 가드** — `feedback_pm_integration_build_check.md` (Layer 4 도메인 메서드 의미 정렬). 남은 항목은 라인별 불량/사진/회계 연동의 고급 검수다.

| # | 기능 | 상태 | 비고 |
|---|---|---|---|
| 1 | 검수 전용 UI 페이지 (`/slips/{id}/inspect`) | ✅ | 별도 라우트 대신 구매관리 행 CTA + `InboundInspectionDialog` 사용 |
| 2 | 라인별 검수 결과 (정상 / 불량 / 누락) 입력 | ❌ | `SlipLine.inspectionStatus` 컬럼 부재 |
| 3 | 검수 사진 첨부 (multipart upload) | ❌ | P0-3 첨부 의존 (slip 도메인) |
| 4 | 불량 처리 (반품 / 폐기 분개 자동 생성) | ❌ | accounting-service 연계 없음 |
| 5 | 검수 완료 → DELIVERED transition 자동 트리거 | ⏳ | backend `inspect()` ✅ / 기본 Dialog CTA ✅ / 자동 회계·불량 연동 잔여 |

**→ P0-9 상태: 기본 검수 진입은 SP-03으로 해소. 잔여 3건(라인별 결과, 사진 첨부, 불량 처리 회계 연동)은 후속 통합 PR 대상.**

---

## 2. P1 (운영 후 1개월 내) — 사용자 불편 / 우회 가능

### P1-1. 알림 (notification) UI 통합

> backend `notification-service` 시드 + `NotificationAdminController` ✅. desktop AppLayout 알림 벨 UI **❌**.

| # | 기능 | 상태 |
|---|---|---|
| 1 | 헤더 🔔 알림 벨 + 뱃지 카운트 | ❌ |
| 2 | 알림 목록 드롭다운 | ❌ |
| 3 | 별표 (★) 보관 | ❌ |
| 4 | 알림 설정 (사용자별 ON/OFF) | ❌ |
| 5 | SMS 발송 (`AligoSmsGateway` ✅ 구현은 있음) | ⏳ |
| 6 | 카카오 알림톡 | ❌ |

### P1-2. 사용자 프로필 화면 + 권한 매트릭스 docs

| # | 기능 | 상태 |
|---|---|---|
| 1 | 내 프로필 조회 | ❌ |
| 2 | 본인 정보 수정 (전화 / Email) | ❌ |
| 3 | 프로필 사진 upload | ❌ |
| 4 | 알림 설정 | ❌ |
| 5 | 단축키 설정 | ❌ |
| 6 | **권한 매트릭스 매뉴얼 행 추가** (INVENTORY / DEVELOPER / DISPATCH) *(Stage 2 N13)* | ❌ — 매뉴얼 §5 표 9 ROLE 중 6 ROLE 만 표기. 4 ROLE 누락 |

### P1-3. 대시보드 강화

> 현재 `DashboardPage.tsx` + dashboard-service 기본 카드 ✅, 3개 카드 placeholder ("준비중") (`frontend-feature-inventory.md` §6.2).

| # | 카드 | 상태 |
|---|---|---|
| 1 | 오늘 매출 요약 | ✅ |
| 2 | 미처리 전표 카운트 | ✅ |
| 3 | 저재고 알림 (안전재고 미달) | ⏳ placeholder |
| 4 | 미확인 메시지 | ⏳ placeholder |
| 5 | 결재 대기 (관리자) | ⏳ placeholder |
| 6 | 주간 / 월간 추이 차트 | ❌ |

### P1-4. 영업 — 견적서 / 주문서 모바일 + 자동 변환 chain

> 메모리 가드(`feedback_*.md` 견적/주문 모바일 분리). 영업직원 native 앱은 코드 미존재.
> Stage 2 추가: 견적서 → 주문서 → 전표 자동 변환 chain (N4).

| # | 기능 | 상태 |
|---|---|---|
| 1 | 영업직원 native 앱 (RN Expo) | ❌ (skeleton 만, screens 없음) |
| 2 | 견적서 모바일 작성 | ⏳ legacy WebView 임베드만 |
| 3 | 주문서 모바일 작성 | ❌ |
| 4 | 거래처 검색 / 모바일 등록 | ❌ |
| 5 | 모바일 인쇄 / PDF export | ❌ |
| 6 | **견적서 → 주문서 → 전표 자동 변환 chain** *(Stage 2 N4)* | ❌ — `PartnerOrderToSlipConverter` ⏳ 부분만 |
| 7 | **거래처 결재 (PARTNER_ADMIN 승인) UI** *(Stage 2 N5)* | ❌ — backend ⏳ / UI ❌ |

### P1-5. arologis (배차) 화면 보강

| # | 기능 | 상태 |
|---|---|---|
| 1 | 카카오톡 배차 자동 파싱 | backend ✅ / **UI ❌** |
| 2 | 수동 배차 등록 화면 | ⏳ `LinkDispatchListPage` 일부 |
| 3 | 기사 배정 화면 (드래그 / 자동 배정) | ❌ |
| 4 | 인성데이타 퀵프로그램 vendor 연계 (`project_arologis_phase10.md`) | ❌ |
| 5 | GPS 실시간 위치 지도 (관리자 view) | ⏳ data 만 |
| 6 | **카카오 채널 등록 운영 절차 docs** *(Stage 3 N7)* | ❌ — Stage 4 운영 매뉴얼 부속 |
| 7 | **인성데이타 vendor 연계 깊이 (slip ↔ vendor 양방향 sync)** *(Stage 3 N8)* | ❌ |
| 8 | **기사 GPS 지도 시각화 (관리자 view)** *(Stage 3 N9)* | ❌ — data 는 ⏳ / 지도 컴포넌트 ❌ |
| 9 | **배차 지시서 인쇄 양식** *(Stage 3 N10)* | ❌ — P0-4 보강 |

### P1-6. 전표 검색 / 필터 강화 + 창고 export

| # | 기능 | 상태 |
|---|---|---|
| 1 | 거래처 + 기간 + 상태 복합 필터 | ⏳ 기간만 |
| 2 | Excel export | ❌ |
| 3 | 즐겨찾기 거래처 | ❌ |
| 4 | **출고 전표 목록 창고별 필터** *(Stage 2 N8)* | ❌ |
| 5 | **재고 Excel export** (`/stocks/export`) *(Stage 2 N10)* | ❌ |
| 6 | **거래처 + 상태 복합 필터** *(Stage 2 N12 — 1번 보강)* | ⏳ 기간만 |

### P1-7. 한국어 형식 강화

| # | 기능 | 상태 |
|---|---|---|
| 1 | 한국 휴대폰 번호 자동 포맷팅 (010-1234-5678) | ⏳ `PhoneInput` DS 컴포넌트만 |
| 2 | 사업자등록번호 자동 포맷 (123-45-67890) | ❌ |
| 3 | 통화 표기 ₩1,234,567 자동 | ⏳ `MoneyInput` DS |
| 4 | 한국 주소 검색 (도로명 주소 API) | ⏳ 이카운트 capture 의 "주소검색" |

### P1-8. 모바일 사진 첨부 (검수 / 배송 / 영업 방문) — Stage 3 신규

> **검증 출처** — `docs/qa/manual-verification/stage3-final-scenarios.md` §2.4 (`04-모바일/04-사진-첨부.md` 미구현 안내). 검수 사진 (P0-9 의존) / 배송 인수 사진 / 영업 방문 사진 모두 미구현.
> **메모리 가드** — `feedback_uuid_no_user_visibility.md` (사용자 식별자 = 비즈니스 식별자만). 사진 첨부 도메인은 `feedback_continuous_docs_sync.md` 통합 PR 의무.

| # | 기능 | 상태 | 비고 |
|---|---|---|---|
| 1 | **전표 검수 사진 첨부** *(Stage 3 N1)* | ❌ | P0-9 검수 UI + P0-3 도메인 확장 의존 |
| 2 | **DELIVERED 시 인수 사진 필수화** *(Stage 3 N2)* | ❌ | mobile-staff 서명 + 사진 동시 collection |
| 3 | **영업직원 거래처 방문 사진** *(Stage 3 N3)* | ❌ | P1-4 영업 native 앱 의존 |
| 4 | 모바일 카메라 권한 처리 (iOS / Android) | ❌ | Expo `ImagePicker` 사용 |
| 5 | 사진 압축 / 최적화 (모바일 데이터 절약) | ❌ | upload 전 client-side 압축 |

**→ P1-8 누락: 5건 (Stage 3 신규 슬라이스). 시한: Phase 11 후 1 PR (P0-9 검수 UI + P0-3 도메인 확장 PR 머지 후 후속).**

---

## 3. P2 (운영 후 3개월 내) — 편의 기능

### P2-1. 모바일 — 창고원 / 회계원 앱 / 알림톡

| # | 기능 | 상태 |
|---|---|---|
| 1 | 창고원 모바일 (입출고 검수) | ❌ (메모리 가드 — Phase 11 후 검토) |
| 2 | 회계원 모바일 | ❌ (메모리 — 불필요 합의) |
| 3 | 카카오 알림톡 (대량 발송) | ❌ |
| 4 | 푸시 알림 (Expo Push) | ❌ |
| 5 | **DELIVERED 외 비대면 인수 별도 transition** *(Stage 3 N5)* | ❌ — 서명 받지 못한 비대면 인수 (택배 보관함 등) 별도 처리 |

### P2-2. 검색 / 자동완성 / UX 강화 + 시각화

| # | 기능 | 상태 |
|---|---|---|
| 1 | 글로벌 검색 (Cmd+K) | ❌ |
| 2 | 단축키 일람 화면 | ❌ |
| 3 | 다국어 (영어 / 중국어) | ❌ |
| 4 | 다크 모드 | ❌ |
| 5 | 화면 크기 / 폰트 조절 사용자 설정 | ❌ |
| 6 | 즐겨찾기 메뉴 (사이드바 핀) | ❌ |
| 7 | **창고별 재고 그래프 (시각화 차트)** *(Stage 2 N9)* | ❌ — chart 컴포넌트 부재 |
| 8 | **Cmd+K 글로벌 검색 단축키** *(Stage 3 N13)* | ❌ — 부록 단축키 docs 일관 |
| 9 | **Ctrl+S 임시저장 일관성 (slip / journal / partner 일괄)** *(Stage 3 N14)* | ⏳ — 일부 라우트만 |

### P2-3. 회계 보강

| # | 기능 | 상태 |
|---|---|---|
| 1 | 시산표 분기 / 년 누적 | ⏳ 월별만 |
| 2 | 전기/당기 비교 | ❌ |
| 3 | 부서별 손익 분석 | ❌ |
| 4 | 분개 자동 (전표 → 분개 자동 생성) | ⏳ 일부 |
| 5 | 결산 마감 lock | ❌ |
| 6 | **시산표 분기/년 누적 endpoint 보강** *(Stage 3 N12)* | ⏳ — `/balances?yyyyMM=` 만 / `?yyyyQ=` `?yyyy=` 추가 필요 |

### P2-4. 영업 보강

| # | 기능 | 상태 |
|---|---|---|
| 1 | 단가 자동 적용 (이카운트 091636 단가 자동 + 부가세) | ⏳ |
| 2 | 할인 정책 (라인 / 전표 / 거래처) | ⏳ |
| 3 | 결제 조건 (외상 / 현금 / 분할) | ⏳ |
| 4 | 매출 마감 / 정산 | ❌ |
| 5 | 영업단가그룹 / 구매단가그룹 (이카운트 091555) | ❌ |
| 6 | **전표 라인 unit_price 자동 fetch** (영업단가그룹 연계) *(Stage 2 N1 — 1번 보강)* | ❌ — `SlipLine.unitPrice` 사용자 수동 입력만 |
| 7 | **전표 라인 부가세 자동 계산 UI** *(Stage 2 N2)* | ⏳ — `SlipLine.taxAmount` 컬럼 ✅ / UI 자동 ❌ |
| 8 | **거래처 single view (매출/매입 내역 통합)** *(Stage 2 N3)* | ❌ — 거래처 조회 화면 자체 ❌ + 통합 view 별도 |

### P2-5. 시스템 관리

| # | 기능 | 상태 |
|---|---|---|
| 1 | 감사 로그 조회 화면 (logging-service) | ⏳ backend 만 |
| 2 | 시스템 헬스 모니터 (운영자용) | ❌ |
| 3 | 환경변수 / 설정 관리 UI (dc-config-service) | ⏳ backend 만 |

### P2-6. 재고 실사 (cycle counting) — Stage 2 신규 발견

> **검증 출처** — `docs/qa/manual-verification/stage2-scenarios.md` §2.4 (전체 미구현). `inventory-service` 의 `count` / `cycle` / `inspection` 키워드 endpoint hit = 0.
> **연관 이카운트** — 한국 ERP 표준 — 월말/분기말 재고 실사 의무.

| # | 기능 | 상태 | 비고 |
|---|---|---|---|
| 1 | 실사 시작 / 창고 lock | ❌ | endpoint 자체 부재 |
| 2 | 품목 카운트 (모바일 바코드 스캔) | ❌ | 창고원 모바일 (P2-1) 의존 |
| 3 | 차이 자동 보고 (시스템 vs 실 카운트) | ❌ | |
| 4 | 차이 조정 분개 자동 생성 | ❌ | accounting-service 연계 (P2-3 의존) |
| 5 | 실사 보고서 인쇄 / Excel | ❌ | |

**→ P2-6 누락: 5건. 시한: Phase 11 후 검토 (창고원 모바일 P2-1 선행).**

### P2-7. 영업 모바일 마이그레이션 (legacy WebView → Expo native) — Stage 3 신규

> **검증 출처** — `docs/qa/manual-verification/stage3-final-scenarios.md` §2.3 (`04-모바일/03-영업-앱.md` 미구현 안내). 현재 영업 모바일 = legacy estimate-app v2 (Node.js + Express + EJS) WebView 임베드만. 사용자 결정 (`feedback_*.md` 옵션 B2 + 견적/주문 모바일 분리) 에 따라 Expo native 앱 마이그레이션 별도 슬라이스 필요.
> **메모리 가드** — `project_arologis_phase10.md` (모바일 어플 RN Expo mobile-staff 패턴 일관) — 영업 모바일도 동일 패턴 마이그레이션.

| # | 기능 | 상태 | 비고 |
|---|---|---|---|
| 1 | legacy estimate-app v2 (Node.js+Express+EJS) → Expo native 마이그레이션 plan | ❌ | 사용자 옵션 B2 결정 후 별도 마이그레이션 일정 |
| 2 | mobile-staff 패턴 재사용 (login / list / detail / GPS) | mobile-staff ✅ 패턴 / 영업 적용 ❌ | |
| 3 | 견적서 작성 모바일 (오프라인 저장) | ❌ | |
| 4 | 주문서 작성 모바일 + 거래처 검색 | ❌ | P0-6 거래처 자동완성 의존 |
| 5 | 모바일 인쇄 / PDF export (영업 산출물) | ❌ | |

**→ P2-7 누락: 5건 (Stage 3 신규 슬라이스). 시한: Phase 11 후 6개월 (P1-4 영업 native 앱 본 작업 + 마이그레이션 plan 일괄).**

---

## 4. P3 (long-term) — 차세대 기능

### P3-1. AI / 자동화

| # | 기능 | 상태 |
|---|---|---|
| 1 | 매출 예측 (시계열 ML) | ❌ |
| 2 | 재고 자동 발주 추천 | ❌ |
| 3 | 영수증 OCR (모바일 카메라) | ❌ |
| 4 | 챗봇 / 보이스 입력 | ❌ |

### P3-2. 통합 / 외부 연계

| # | 기능 | 상태 |
|---|---|---|
| 1 | 국세청 e-Tax 전자세금계산서 (P0-4 와 연결) | ❌ |
| 2 | 은행 API 입출금 자동 분개 | ❌ |
| 3 | EDI 연계 (대형 거래처) | ❌ |
| 4 | 엑셀 import / batch upload | ❌ |

### P3-3. 보안 / 컴플라이언스

| # | 기능 | 상태 |
|---|---|---|
| 1 | 2FA / OTP | ❌ |
| 2 | 다중 device 로그인 관리 | ❌ |
| 3 | 개인정보 보호 (마스킹) | ⏳ UUID 가이드만 |
| 4 | GDPR / PIPA 준수 인증 | ❌ |

### P3-4. 모바일 신규 플랫폼

| # | 기능 | 상태 |
|---|---|---|
| 1 | 태블릿 (iPad) 전용 화면 | ❌ |
| 2 | Apple Watch 알림 | ❌ |
| 3 | 키오스크 (창고 입출고 셀프) | ❌ |

---

## 5. 누락 카운트 종합 (Stage 3 갱신)

| 영역 | 🔴 P0 | 🟠 P1 | 🟡 P2 | 🟢 P3 | 합계 |
|---|---:|---:|---:|---:|---:|
| **회계** | 14 | 0 | 6 (+1 N12) | 1 | **21** |
| **영업** | 9 (거래처 4탭 + 품목 7탭 일부) | 7 (+2 N4/N5) | 8 | 1 | **25** |
| **창고** | 5 (P0-9 검수 UI) | 3 | 6 (P2-6 실사) | 1 (키오스크) | **15** |
| **모바일** | 0 | 10 (+5 P1-8 사진 첨부) | 10 (+5 P2-7 영업 모바일 마이그레이션 +1 N5) | 1 | **21** |
| **인증/관리** | 13 (+1 N15 보안 위험) | 6 | 3 | 7 (보안 / 2FA) | **29** |
| **출력/인쇄** | 5 | 2 (+1 N10 배차 지시서) | 0 | 1 (e-Tax) | **8** |
| **첨부/저장** | 8 (+2 N4/N11 도메인 확장) | 0 | 0 | 1 (OCR) | **9** |
| **알림/대시보드** | 0 | 11 (대시보드 4 + 알림 6 + N9 GPS 지도) | 0 | 0 | **11** |
| **arologis** | 0 | 8 (+3 N7/N8/N9) | 0 | 0 | **8** |
| **백업/운영** | 4 | 0 | 3 | 0 | **7** |
| **검색/UX** | 0 | 4 | 9 (+2 N13/N14 단축키) | 0 | **13** |
| **외부 연계** | 0 | 0 | 0 | 4 | **4** |
| **합계** | **58** (+3) | **51** (+9) | **45** (+9) | **17** | **171** |

> **주의** — 본 카운트는 sub-feature 기준 (예: P0-2 비밀번호 재설정 = 8 sub). 메인 슬라이스 기준은 **P0 = 9 슬라이스 / P1 = 8 (+P1-8 모바일 사진 첨부) / P2 = 7 (+P2-7 영업 모바일 마이그레이션) / P3 = 4**.
> **Stage 3 변경** — 신규 P1 슬라이스 1건 (P1-8 모바일 사진 첨부) + P2 슬라이스 1건 (P2-7 영업 모바일 마이그레이션) + 기존 슬라이스 sub ~15건 추가 (P0-2 N15 / P0-3 N4·N11 / P1-5 N7·N8·N9·N10 / P2-1 N5 / P2-2 N13·N14 / P2-3 N12). **Stage 2 → Stage 3: 150 → 171 sub (+21).**
> 사용자 명시 "~165 sub" 범위 내 (~165 = 추가 sub 약 +15 추정. 실 추가는 +21로 모바일 사진 첨부 / 영업 모바일 마이그레이션 신규 슬라이스 5+5 sub 분량 가산 결과).

---

## 6. Phase 11 진입 전 P0 의무 구현 권고 (개발책임자 결정 의제 — Stage 3 갱신)

> **개발책임자 의제** — 본 catalog 의 P0 58건 (9 슬라이스) 은 Phase 11 AWS migration 진입 시 운영 즉시 차단 위험. 단계별 fix PR 권고:

| # | 슬라이스 | sub 카운트 | 권고 PR | 권고 시한 |
|---|---|---|---|---|
| 1 | 회계 17 보고서 보강 | P0 14 sub | 4 PR (재무제표 / 일·월 보고서 / 원장 / 분석표) | Phase 11-2주 |
| 2 | 비밀번호 재설정 + 정책 + 잠금 + **brute-force 방어** *(Stage 3 N15)* | P0 8 sub | 1 PR | Phase 11-1주 |
| 3 | 거래처 첨부파일 실 multipart upload + **slip / journal 도메인 확장** *(Stage 3 N4/N11)* | P0 8 sub | 1 PR (MinIO production profile + 바이러스 스캔 stub + 도메인 추상화) | Phase 11-1주 |
| 4 | 전표 인쇄 양식 (거래명세서 / 세금계산서 / 견적서 + **배차 지시서 N10**) | P0 5 sub + P1 1 sub | 1 PR | Phase 11-2주 |
| 5 | 사용자 / 권한 관리 desktop UI | P0 5 sub | 1 PR | Phase 11-1주 |
| 6 | 거래처 등록 4 탭 desktop UI | P0 ~30 field | 2 PR (탭 1+2 / 3+4) | Phase 11-3주 |
| 7 | 품목 등록 7 탭 desktop UI | P0 ~30 field | 2 PR (탭 1+2 / 3+나머지) | Phase 11-3주 |
| 8 | 백업 / 복원 운영 매뉴얼 부속 | P0 4 sub | 1 PR (docs only) | Phase 11 직후 |
| 9 | 입고 검수 (INSPECTING) UI *(Stage 2 신규)* | P0 5 sub | 1 PR (slip-service `/slips/{id}/inspect` + 라인별 검수 결과 / 사진 첨부 / 불량 처리) | Phase 11-1주 |

**→ 합계 14 PR / 약 5~7주 소요 예상 (Stage 2 = 14 PR + Stage 3 sub 추가 ~11건은 기존 PR 에 흡수).**

### 6.1 Phase 11 후 P1 권고 PR (Stage 3 신규)

| # | 슬라이스 | sub 카운트 | 권고 PR | 권고 시한 |
|---|---|---|---|---|
| 10 | **모바일 사진 첨부 (P1-8 신규)** | P1 5 sub | 1 PR (검수 / 배송 / 영업 방문 통합) | Phase 11+1개월 (P0-9 + P0-3 PR 머지 후) |
| 11 | arologis UI 보강 (P1-5) | P1 9 sub (+4 Stage 3 N7/N8/N9) | 2 PR (카카오 UI + 운영 docs / 기사 배정 + 인성데이타 vendor) | Phase 11+1~2개월 |
| 12 | 영업 native 앱 (P1-4) + 견적서/주문서 chain | P1 7 sub | 2 PR (native 앱 + chain 변환) | Phase 11+1~2개월 |

### 6.2 Phase 11 후 P2 권고 PR (Stage 3 신규)

| # | 슬라이스 | sub 카운트 | 권고 PR | 권고 시한 |
|---|---|---|---|---|
| 13 | **영업 모바일 마이그레이션 (P2-7 신규 — legacy v2 → Expo native)** | P2 5 sub | 1 PR (P1-4 native 앱 PR 후속) | Phase 11+6개월 |
| 14 | 재고 실사 (P2-6) | P2 5 sub | 1 PR (창고원 모바일 P2-1 선행) | Phase 11+3개월 |
| 15 | 회계 보강 (시산표 분기/년 누적 N12 + 결산 lock) | P2 6 sub | 1 PR | Phase 11+3개월 |

---

## 7. 누락 발견 출처

| 출처 | 검증 항목 |
|---|---|
| `docs/migration/ecount-reference/*.png` (16 캡처) | 거래처 등록 4 탭 / 판매입력 / 구매입력 / 창고이동입력 / 영업관리현황 5 / 구매관리현황 3 / 견적서 작성 / 품목등록 7 탭 / 회계 17 보고서 / 사원담당등록 |
| `docs/manual/inventory/backend-feature-inventory.md` (다른 agent) | 17 service × 145 endpoint 매트릭스 / 시드 row 1,750 / 누락 후보 42건 |
| `docs/manual/inventory/frontend-feature-inventory.md` (다른 agent) | desktop 27 라우트 / mobile-staff 6 화면 / DS 35 컴포넌트 / 누락 후보 8건 |
| `docs/qa/manual-verification/scenarios.md` (Stage 1) | 매뉴얼 4 docs vs 실 구현 — Critical 10 / Major 7 |
| `docs/qa/manual-verification/stage2-scenarios.md` (Stage 2) | 매뉴얼 9 docs (영업 5 + 창고 4) vs 실 구현 — 74 검증 항목 (Critical 15 / Major 29 / Minor 16). 신규 19 sub 발견 |
| `docs/qa/manual-verification/stage3-final-scenarios.md` (Stage 3 — 본 PR) | 매뉴얼 22 docs (회계 4 + 모바일 4 + arologis 3 + 트러블슈팅 5 + 부록 3 + Stage 3 안내 3) vs 실 구현 — 120 검증 항목 (Critical 25 / Major 56 / Minor 39). G 분류 (미구현 안내 docs 일관성) 신규 도입. 신규 21 sub 발견 |
| 메모리 가드 | `feedback_role_naming_full.md` 9 ROLE / `feedback_print_design_iteration.md` 인쇄 iteration / `project_korean_accounting.md` 한국 회계 표준 / `project_phase11_aws.md` AWS 단일 환경 / `project_arologis_phase10.md` Expo 패턴 일관 |
| 한국 일반기업회계기준 | 17 보고서 표준 / 계정과목 코드 100/200/300/400/500/800/900 |

---

## 8. 변경 이력

| 일자 | 작성자 | 변경 |
|---|---|---|
| 2026-05-09 | TeamMember (W10-7 Stage 1) | 초안 작성. P0 50 / P1 37 / P2 27 / P3 17 = 총 131 sub. 8 P0 슬라이스 / 13 권고 PR. |
| 2026-05-09 | TeamMember (W10-7b Stage 2) | Stage 2 매뉴얼 (영업 5 + 창고 4 = 9 docs) 검증 과정에서 신규 누락 19 sub 발견. 신규 슬라이스 **P0-9 (입고 검수 UI 5 sub)** + **P2-6 (재고 실사 5 sub)** + 기존 슬라이스 sub 9건 추가. **누적: 131 → 150 sub (+19). 9 P0 슬라이스 / 14 권고 PR.** |
| 2026-05-09 | TeamMember (W10-7c Stage 3) | Stage 3 매뉴얼 (회계 4 + 모바일 4 + arologis 3 + 트러블슈팅 5 + 부록 3 + Stage 3 안내 3 = 22 docs) 검증 과정에서 신규 누락 21 sub 발견. 신규 슬라이스 **P1-8 (모바일 사진 첨부 5 sub — 검수/배송/영업 방문)** + **P2-7 (영업 모바일 마이그레이션 5 sub — legacy v2 → Expo native)** + 기존 슬라이스 sub 11건 추가 (P0-2 N15 보안 / P0-3 N4·N11 도메인 확장 / P1-5 N7·N8·N9·N10 arologis 4건 / P2-1 N5 비대면 인수 / P2-2 N13·N14 단축키 / P2-3 N12 시산표 분기). **누적: 150 → 171 sub (+21). 9 P0 / 8 P1 / 7 P2 / 4 P3 슬라이스 = 28 슬라이스. Phase 11 진입 전 14 PR + Phase 11 후 6 PR (P1 3 + P2 3) = 20 PR 권고.** |
| 2026-05-10 | Designer (Phase 10 step-14, PR-G1) | **신규 P0-10 슬라이스 ✅ 완성** — e-Count schema 12 컬럼 (IO_TYPE / TIME_DATE / customer_tel·addr·rep / shipping_addr / inspection_addr / receiver_phone / payment_due / discount_info / collect_term / agree_term) + 이카운트 외부 API 호출 폐기 + `composeMemo` 리팩토링 + partner_code resolve V15→V16 보강 = 15 sub 모두 ✅. **부수 효과** — P0-4 거래명세서 인쇄가 12 컬럼 활용으로 양식 정합성 향상 (별도 PR 진입 시 작업량 감소). **누적: 171 sub 유지 (P0-10 신규 15 sub 모두 ✅ 완성 표기 — 미구현 카운트에 +0). 9 P0 → 9 P0 + 1 P0 완성 = 9 미완성 P0 + 1 완성 P0. 권고 PR: Phase 11 진입 전 14 PR 유지 (P0-10 본 PR 로 자체 처리).** |
| 2026-05-10 | TM (Phase 12 step-1 ~ 4c, PR-H1 → PR-H4c) | **신규 P0-11 슬라이스 ✅ 완성 — Phase 12 실시간 협업** — SSE infra (PR-H1) + audit overlay (PR-H2) + 수정 요청 워크플로우 + 잠금 정책 4단계 (PR-H3) + shared-realtime module (PR-H4a) + BE 13 service 일괄 (PR-H4b) + FE 50+ desktop page + mobile-staff 일괄 (PR-H4c) = **총 ~25 sub 모두 ✅** (SSE 채널 5 + 잠금 단계 4 + audit overlay 5 + 수정 요청 5채널 + 복원 권한 1 + 다중 service 적용 13 + 다중 page 50+ 매트릭스). **부수 효과** — 매뉴얼 33 docs 중 audit 적용 8 docs 가 PR-H4c commit `0e3b247` 에서 inline section 추가 보완 완료 + 신규 카테고리 [`08-실시간-협업/`](../08-실시간-협업/) 10 docs 작성 (Stage 4 본 PR). **누적: 171 sub 유지 + P0-11 ✅ 완성 25 sub (미구현 카운트에 +0). 권고 PR: Phase 11 진입 전 14 PR 유지.** |
| 2026-05-10 | Designer (Phase 12 step-5 — 본 PR) | **Stage 4 매뉴얼 보강** — Phase 12 시리즈 종결 후 신규 카테고리 [`08-실시간-협업/`](../08-실시간-협업/) 10 docs (00-개요 + 01-동기화 + 02-이력 + 03-카운트 + 04-복원 + 05-요청 + 06-잠금 + 07-창고 수락 + 08-모바일 + 09-적용 범위) 작성. 본문 33 → **43 docs**. README + STATUS + 본 catalog 갱신. PR-H1~H4c 작동 캡처 raw URL commit-pinned 활용 (`04e2b44` / `732e105` / `24b22f9` / `2db1d02` / `0e3b247`). 누락 카운트 영향 없음 (P0-11 ✅ 완성에 매뉴얼 row 결합). |
| 2026-05-10 | Designer (Phase 12 step-6 — 본 PR ✅) | **매뉴얼 전체 재작성 ✅ 완성** — 9 카테고리 × **43 docs 본문 모두 7-section 패턴 일관 재작성** (1.구현 상태 / 2.대상 독자 / 3.학습 내용 / 4.본문 / 5.화면 미리보기 / 6.FAQ / 7.관련 매뉴얼). placeholder 안내 톤 → 실 사용자 가이드 톤 전환. **111 신규 PNG inline** (Phase B 산출 — `docs/manual/screenshots/<카테고리>/`, mock 모드 캡처로 한국어 라벨 100% / placeholder 47건 0건 교체 완료). README + STATUS + 본 catalog 갱신. **누락 카운트 영향 없음** (매뉴얼 재작성은 docs 인프라 보강). |

---

## 9. ✅ 완성 슬라이스 (Phase 10 step-14 ~ Phase 12 step-5 종합)

본 catalog 는 미구현 누락 추적이 주 목적이지만, 이미 ✅ 완성된 슬라이스도 cross-reference 용으로 함께 기록합니다.

| # | 슬라이스 | sub 카운트 | PR | 매뉴얼 안내 |
| --- | --- | --- | --- | --- |
| **P0-10** | e-Count schema 12 컬럼 + 이카운트 외부 API 폐기 + composeMemo 리팩토링 (Phase 10 step-14, PR-G1) | 15 | (Phase 10 step-14) | [02-창고/02. 출고 처리](../02-창고/02-출고-처리.md) §2-8 |
| **P0-11** | **Phase 12 실시간 협업 — SSE 동기화 + audit overlay + 수정 횟수 + 복원 + 잠금/요청 5종 패턴 일괄** (PR-H1 → PR-H4c) | ~25 | PR #123 ~ #128 | **[08-실시간-협업/](../08-실시간-협업/) 10 docs (본 PR Stage 4)** |

### 9.1 P0-11 sub 분해

| 항목 | sub | PR | 매뉴얼 |
| --- | --- | --- | --- |
| WebSocket/SSE infra (`samhan.realtime.*` 5채널) | 5 | PR-H1 (#123) | [01. 실시간 동기화](../08-실시간-협업/01-실시간-동기화.md) |
| audit overlay (취소선 + 색상 dot + 풀네임 + UUID 비공개 가드 + (빈 값) 가시화) | 5 | PR-H2 (#124) | [02. 수정 이력 보기](../08-실시간-협업/02-수정-이력-보기.md) |
| 수정 횟수 카운트 + 임계 색상 (0/1~4/5~9/10+) | 1 | PR-H2 (#124) | [03. 수정 횟수 카운트](../08-실시간-협업/03-수정-횟수-카운트.md) |
| 복원 (MASTER + MANAGER 권한 + 영구 잠금 차단) | 1 | PR-H2 (#124) | [04. 수정 복원](../08-실시간-협업/04-수정-복원.md) |
| 수정 요청 워크플로우 + SSE 알림 5채널 (요청/수락/거절/만료/삭제) | 5 | PR-H3 (#125) | [05. 수정 요청 워크플로우](../08-실시간-협업/05-수정-요청-워크플로우.md) |
| 잠금 정책 4단계 (0/1/2/영구) + 사유 200자 + 카테고리 4 + unlock 24h/1h | 4 | PR-H3 (#125) | [06. 잠금 정책](../08-실시간-협업/06-잠금-정책.md) |
| 창고 직원 검토 의견 + mobile-staff 검토 다이얼로그 | 1 | PR-H3 (#125), commit `83cdf67` | [07. 창고 직원 수락](../08-실시간-협업/07-창고-직원-수락.md) |
| shared-realtime module 추출 + slip-service 마이그레이션 (`samhan.realtime.*` property prefix) | 1 | PR-H4a (#126) | (운영자 무관 — 인프라) |
| BE 13 service 일괄 적용 (slip / partner / accounting / inventory / arologis / partner-order / product / user / dc-config / notification / logging / groupware / dashboard / tax-invoice) | 1 | PR-H4b (#127) | [09. 적용 범위](../08-실시간-협업/09-적용-범위.md) §1 |
| FE 50+ desktop page + mobile-staff 일괄 적용 + Designer 매뉴얼 8 docs 보완 | 1 | PR-H4c (#128) | [09. 적용 범위](../08-실시간-협업/09-적용-범위.md) §2, §3 |

### 9.2 후속 검토 항목 (P0-11 ✅ 완성 후 운영 1개월 누적 후 재평가)

| 후보 | 우선순위 후보 | 메모 |
| --- | --- | --- |
| 카테고리 통계 dashboard (2차 잠금 사유 분포) | P2 / P3 | "거래처 요청" / "재고 차질" / "법적 사유" / "기타" 비율 — Phase 13 후보 |
| 사용자 풀네임 영구 보존 (탈퇴 후 `(알 수 없음)` 방지) | P2 / P3 | snapshot 컬럼 — 후속 PR 검토 |
| 색상 dot fallback 색 (회색) → 색상 강제 hash | P3 | userId 누락 fallback 처리 |
| audit log monthly report (10회+ 빨강 badge 항목) | P2 / P3 | 감사 보고서 자동 생성 |
| Phase 13 sliding window — Phase 12 실시간 협업 운영 후 보완 | (재평가) | 운영 1개월 누적 후 P 분류 결정 |

---

**Stage 5 이후 갱신 예정** — Phase 11 P0/P1 PR 머지 시 안내 docs (10건) 정식 본문 교체 + 신규 운영 매뉴얼 부속 3 docs (백업·복원 / 장애 대응 / 사용자 관리) 작성 시 추가 row. 다른 agent (BE/FE inventory) 와 cross-check 시 numerical mismatch 시 본 catalog 가 ground truth.
