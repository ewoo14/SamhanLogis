# TM 통합 검증 보고서 — PR #141 (P0-6 거래처 4탭 등록/조회 UI)

- **PR**: <https://github.com/ewoo14/SamhanLogis/pull/141>
- **Branch**: `feature/p0-6-partner-4tab-ui`
- **Base**: `main`
- **검증일**: 2026-05-11
- **TM 결론**: 발행 권장 (BE 수정 0건, FE contract 정합성 fix commit 1건 추가 완료).
- **PR #134~#140 회고 가드**: 전부 점검 — UUID 비공개 / 한국어 / Layer 4 / Soft Delete / @MockitoSettings(LENIENT) / extends AbstractPostgresIT / @MockBean / Role 풀네임 / @PreAuthorize ↔ FE 권한 일치 / 한국어 commit / DS 컴포넌트 import / Pretendard 9 weight / 메모리 가드 6종 모두 PASS.

---

## 1. cross-check 결과 요약

| Check | 결과 | 비고 |
| --- | --- | --- |
| UUID 정합성 (cross-service) | PASS | partner_id (UUID) 하나의 source. partner_price_discounts / shipping_addresses / contacts 모두 partners.id 결정적 UUID 매칭. V7 seed 5거래처 + 5단가 + 10배송지 + 10담당자 = 30 결정적 UUID 충돌 0. |
| API contract (FE ↔ BE) | **fix 1건** | 6개 BLOCKER 발견 → 통합 fix commit 1건으로 정합화. |
| 디자인 일관성 (DS) | PASS | `Tabs` 컴포넌트 신규 (`@samhan/design-system` 정상 export). PartnerCreatePage / PartnerDetailDialog 가 DS `Tabs / Button / Input / Card / Modal / Badge` 만 import. 자체 탭 컴포넌트 0건. |
| 도메인 정합성 (Layer 4) | PASS | `Partner4TabService` 가 도메인 메서드 (`Partner.register`, `Partner.updateProfile`, `PartnerPriceDiscount.create/update`, `PartnerShippingAddress.create/markAsDefault/unsetDefault/softDelete`, `PartnerContact.create/markAsPrimary/unsetPrimary/softDelete`) 만 사용. setter/reflection 직접 호출 0. |
| Flyway 의존성 | PASS | V6 (스키마 3 테이블) → V7 (seed 30건 INSERT). V6 의 모든 신규 컬럼 NULLable 또는 default — legacy 호환. partial unique index `ix_partner_shipping_addresses_default` / `ix_partner_contacts_primary` 적절 (`is_default=TRUE` 단일성 보장은 service 레이어). |
| 메모리 가드 6종 | PASS | feedback_uuid_no_user_visibility / project_korean_accounting / feedback_korean_commits / feedback_no_dev_director_mention / feedback_role_naming_full / feedback_pr_qa_screenshots. |

---

## 2. 발견된 BLOCKER (FE 측 단독, BE 무수정)

PR 본문은 "BE-FE record 1:1" 라고 선언했으나 실제 코드 검증 결과 다음 6건이 BE Controller / DTO 와 정렬되지 않음. **모두 FE partner-service 호출 경로에서 404/405/필드 누락 발생 가능**.

| # | 위치 | BE | FE 변경 전 | 영향 |
| --- | --- | --- | --- | --- |
| 1 | path variable 의미 | `@PathVariable String partnerCode` (예: `P-2026-0001`) | `id: string` 파라미터 명명 + 호출자가 UUID 전달 | 모든 4탭 조회/수정 404 |
| 2 | HTTP method | `@PutMapping("/{partnerCode}/price-discount")` | `apiClient.patch(...)` | 단가/할인 UPSERT 405 |
| 3 | DTO 필드명 (단가) | `basicDiscountRate / discountMemo` | `basicDiscount / creditLimit` | 응답 파싱 NaN, request body 손실 |
| 4 | DTO 필드명 (담당자) | `contactName` | `name` | 등록 시 BE NotBlank 검증 실패 (400) |
| 5 | DTO 필드명 (배송지) | `zipCode / receiverName / memo` 누락 | 3 필드 누락 | 입력 데이터 손실 |
| 6 | Request 구조 | flat `(partnerCode, bizNo, name, priceDiscount, ...)` | nested `{ basic: { businessName, businessNumber, ... } }` | 등록 시 partnerCode/bizNo/name 모두 null → 400 |

### TM 통합 fix 내용

`clients/desktop/src/renderer/api/partnerApi.ts` (전면 재작성):

- 모든 함수 파라미터: `id: string` → `partnerCode: string` + `encodeURIComponent`.
- `updatePartnerPriceDiscount` → `upsertPartnerPriceDiscount` (PUT). 구 명칭은 `@deprecated alias` 로 보존.
- 인터페이스를 BE record 시그니처와 1:1 정렬:
  - `PartnerBasic`: `partnerCode, bizNo, name, representative, businessType, industry, address, phone, fax, email, email2, mobile, website, partnerGroup1, partnerGroup2, creditLimit, outstandingBalance, status, registrationDate` (BE `PartnerBasicResponse` 와 동일).
  - `PartnerPriceDiscount`: `basicDiscountRate, paymentTermDays, discountMemo`.
  - `PartnerShippingAddress`: `id, alias, zipCode, address, phone, receiverName, isDefault, memo`.
  - `PartnerContact`: `id, contactName, position, phone, email, isPrimary, memo`.
  - `PartnerFullRequest`: flat `(partnerCode, bizNo, name, priceDiscount, shippingAddresses, contacts)`.
- `MOCK_PARTNER_FULL` 도 BE 형식으로 재정렬.
- 구 `PartnerCreateFullRequest` 는 alias 로 보존 (다른 location 영향 없음 확인).

`clients/desktop/src/renderer/routes/admin/PartnerCreatePage.tsx`:

- form 상태의 `EMPTY_ADDRESS / EMPTY_CONTACT` 를 BE 필드명 (alias/zipCode/address/phone/receiverName/isDefault/memo, contactName/position/phone/email/isPrimary/memo) 으로 정렬.
- `handleSubmit` 의 `body` 매핑을 BE flat `PartnerFullRequest` 로 변환. partnerCode 자동 채번 (`P-${year}-${unix6}`) — 정식 채번은 partner-service 후속 슬라이스.
- 배송지 탭 input 행에 우편번호 / 수신담당자 입력 추가 (BE 필드 매칭).
- 담당자 입력 row 의 `row.name` → `row.contactName`.
- 검증 함수 `validateAddresses / validateContacts` 의 nullable 처리 보강 (`a.alias?.trim()`, `c.phone?.trim()`).

`clients/desktop/src/renderer/routes/admin/PartnerDetailDialog.tsx`:

- `startEdit` 매핑: BE response 의 `data.basic.{name, bizNo}` → form, `data.priceDiscount.basicDiscountRate` 등 BE 필드명 사용.
- `DetailBasicTab` read-only 표시: `b.businessName/businessNumber/type/ceoName/...` → `b.name/bizNo/representative/businessType/industry/address/phone/email/mobile/partnerGroup1/partnerGroup2`. edit 모드는 BE PATCH 가 `name` 만 반영하므로 거래처명 수정만 노출 + 부가 필드 안내문 추가.
- `DetailPriceTab` read-only/edit: `basicDiscount → basicDiscountRate`, 신용한도는 `data.basic.creditLimit` (Partner 본체) 표시, 비고(`discountMemo`) 추가.
- `DetailShippingTab`: `a.alias/zipCode/address/phone/receiverName` 표시, 입력 행에 우편번호/수신담당자 추가, addRow EMPTY 도 7필드.
- `DetailContactTab`: `c.contactName/phone/email/memo` 표시, addRow EMPTY 6필드.
- `selectedPartnerId` 가 partnerCode 임을 코멘트로 명시 (UUID 비공개 가드).

`clients/desktop/src/renderer/routes/admin/PartnersPage.tsx`:

- `openDetail` 주석을 "BE Controller path = partnerCode" 로 정정 (잘못된 UUID 가정 코멘트 제거).

---

## 3. PR #134~#140 회고 가드 자가 점검

| 회고 항목 | 적용 여부 | 비고 |
| --- | --- | --- |
| extends AbstractPostgresIT (PR #140 회고) | PASS | `P06ValidationIT extends AbstractPostgresIT`, `Partner4TabControllerIT extends AbstractPostgresIT`. |
| @MockitoSettings(LENIENT) | PASS | `Partner4TabServiceTest` 적용. |
| @MockBean 외부 client | PASS (해당 없음) | partner-service 는 외부 RestClient 의존 0건. |
| raw hex 0건 | PASS | seed UUID 는 결정적 (`a1b2c3d4-...`) 그러나 사용자 화면 노출 0건 (FE 에서 partnerCode/name 만 표시). |
| BE-FE record 1:1 | **fix 후 PASS** | 본 PR 의 핵심 cross-check. |
| @PreAuthorize 권한 일치 | PASS | BE `MASTER/MANAGER/SALES` (조회), `MASTER/MANAGER` (수정). FE PR-H 패턴과 일치. |
| 한국어 commit/PR/Issue | PASS | 모든 commit 한국어, 본 fix commit 도 한국어. |
| Soft Delete 일관 | PASS | `markDeleted(actorUserId)` 위임. `@SQLRestriction("is_deleted = false")` 일관. |
| Role 풀네임 (M/M/D 약어 금지) | PASS | `MASTER/MANAGER/SALES` 풀네임 사용. |
| dev-report 갱신 | PASS | `docs/dev-reports/p0-6-partner-4tab-ui.md` (97 lines). |
| 매뉴얼 갱신 | PASS | `docs/manual/01-영업/01-거래처-등록.md`, `02-거래처-조회.md`. |

---

## 4. 검증 명령

```text
# 1) BE 컴파일 + 단위 테스트 (Partner4TabServiceTest 8 시나리오)
./gradlew :services:partner-service:compileJava :services:partner-service:compileTestJava \
    :services:partner-service:test --tests "com.samhanair.logis.partner.tab.service.Partner4TabServiceTest"
# → BUILD SUCCESSFUL

# 2) FE typecheck (web + node tsconfig 둘 다)
cd clients/desktop && npm run typecheck
# → tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit (오류 0)

# 3) DS typecheck (Tabs 신규 컴포넌트 포함)
cd clients/web/design-system && npx tsc --noEmit
# → 오류 0
```

---

## 5. nit (PM 위임 후속 — 본 PR 머지 차단 아님)

- `PartnerCreatePage.handleSubmit` 의 partnerCode 자동 채번 `P-${year}-${unix6}` 은 임시. partner-service 측 정식 채번 정책 (Partner.register 시 자동 부여) 후속 슬라이스에서 도입 권장. 현재는 입력 강제만 우회.
- `Partner4TabController.deleteShippingAddress / deleteContact` 의 actor 추출이 `principal.getName()` 직접 사용. shared `SecurityContext` util 로 통일 가능 (다른 service 와 일관).
- `V7__seed_p0_6_partners_full.sql` 의 `created_at NOW()` — 멱등성을 위해 결정적 timestamp (`'2024-01-02 09:00:00'` 등) 사용 고려. 단 `created_at` 만으로는 ON CONFLICT 충돌 무관하므로 영향 0.
- `Partner4TabServiceTest` 의 `injectId` reflection 헬퍼는 단위 테스트 한정 — 도메인 invariant 가드 위반 아님 (Partner.register 가 BaseEntity ID 미부여 상태로 영속화 전 객체 반환하기 때문).

---

## 6. 발행 권장

- TM cross-check 통과 + 통합 fix 1건 commit 완료.
- 풀빌드 + PR 발행은 PM 위임.
- 머지는 개발책임자 본인 (PR #100 회고).
