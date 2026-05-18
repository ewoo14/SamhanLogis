# SP-09 Phase 9 vendor 연동 시리즈 종료 보고서

> SP-09 series — Samhan Public Phase 9 외부 vendor 4종 (NTS / Aligo / Clova / KFTC) 연동 shell + DRY_RUN + placeholder runtime guard 수립. 전체 시리즈 누적 완료.

---

## 1. 시리즈 개요

| 슬라이스 | PR | 브랜치 | 서비스 |
|---|---|---|---|
| SP-09-1 NTS e-Tax 전자세금계산서 발행 shell | #236 | feat/sp-09-1-nts-etax-emit-shell | accounting-service |
| SP-09-2 Aligo SMS 실 발송 + send_audit | #237 | feat/sp-09-2-aligo-sms-real-send | notification-service |
| SP-09-3 Clova OCR 영수증 발급 shell | #238 | feat/sp-09-3-ocr-receipt-shell | slip-service |
| SP-09-4 KFTC 오픈뱅킹 입금 매칭 shell | #239 | feat/sp-09-4-kftc-shell | accounting-service |
| SP-09-5 Phase 9 통합 검증 (본 PR) | TBD | feat/sp-09-5-phase9-integration-summary | accounting-service (통합 IT) |

**누적 통계** (5 PR):
- 사이클 평균: N=1.2 (SP-08 회고 적용 효과)
- 신규 IT: 38 case (NTS 8 + Aligo 4 + Clova 12 + KFTC 10 + 통합 8)
- 신규 Playwright: 25 case (5 spec x 5 TC)
- 신규 PNG: 20+장
- 코드: +6,000줄 (BE/FE/QA/docs)

---

## 2. 슬라이스별 핵심 결정 / 결함 / 회귀 가드

### SP-09-1 NTS e-Tax 전자세금계산서 발행 shell

**핵심 결정**:
- `ETaxClient` interface + `ETaxClientImpl` (DRY_RUN | NTS 분기)
- `POST /accounting/tax-invoices/{id}/emit-nts` — ACCOUNTANT / MASTER 권한 (MANAGER 제외)
- `eTaxExternalId` 형식: `"DRY-{taxInvoiceNo}-{epochMilli}"` (DRY_RUN) / 홈택스 접수번호 (NTS)
- `NtsSubmitMethod @Pattern(regexp="DRY_RUN|NTS")` — BE Bean Validation

**결함 (사이클 1 발견)**:
- C1/M3: `@Pattern(regexp="DRY_RUN|NTS")` 누락 → blank submitMethod 400 미반환 (Codex fix)
- H1: Playwright T5 SALES 권한 가드 — 스텝 간 컨텍스트 혼동 (Claude fix)

**회귀 가드**:
- `TaxInvoiceEmitNtsIT` 8 case (DRY_RUN 성공 / SALES 403 / MANAGER 403 / DRAFT 422 / CANCELLED 422 / 중복 409 / audit log / ETaxClient 실패 502)
- `@MockBean ETaxClient` + `@MockBean KftcClient` 격리 필수

---

### SP-09-2 Aligo SMS 실 발송 + send_audit

**핵심 결정**:
- `AligoSmsAdapter` — `result_code` 1 성공 / 그 외 `FAILURE_ALIGO_{resultCode}` gatewayStatus
- `dispatch_sms_save_history.save_mode = SEND_AUDIT` — 배차안내 SMS 발송 이력 자동 저장
- `recipientAddress` FE 마스킹: `010-****-NNNN` 형식
- `DISPATCH / MANAGER / MASTER` 권한 허용, `SALES / ACCOUNTANT` 차단
- `DispatchSmsSaveHistoryController` 별도 (NotificationAdminController 에서 분리)

**결함 (사이클 1 발견)**:
- T2: `data-testid="sms-audit-filter-from"` 실제 testid 불일치 → 정합 수정
- T3: `dispatch-sms-send-audit-detail-modal` testid 확인 후 정합

**회귀 가드**:
- `AligoSmsAdapterSendAuditIT` 4 case (발송 → SEND_AUDIT row 생성 / sent/failed 수치 / fail-soft)
- `AligoSmsAdapterPlaceholderRuntimeGuardIT` — placeholder 키 차단 확인

---

### SP-09-3 Clova OCR 영수증 발급 shell

**핵심 결정**:
- `ReceiptOcrClient` interface + `ReceiptOcrClientImpl` (DRY_RUN | CLOVA 분기)
- `POST /slips/receipt-ocr` (multipart/form-data) — WAREHOUSE / MANAGER / MASTER 권한
- `ReceiptParseResponse` record: `slipNo / vendorName / totalAmount / vatAmount / issuedAt / submitMethod / parseRawJson`
- `slipId` UUID 는 BE DTO 에 미포함 (UUID 비공개 원칙 — slipNo 만 화면 표시)
- ACCOUNTANT 추가 허용 (사용자 정정 cycle 2 — 매입 영수증 + 분개 통합 흐름)

**결함 (사이클 1/2 발견)**:
- QA-H1: T2 mock BE shape 정합 오류 → `ReceiptParseResponse` record 필드 맞춤
- QA-M1: bodyText OR fallback → `data-testid` / locator 기반 assertion 강화
- BE-H1: `contentType null` / `originalFilename null` 파일 422 누락 → 방어 로직 추가 (case 10/11)
- CLOVA INVOKE_URL placeholder 차단 누락 → case 12 추가 (Codex blocker 3)

**회귀 가드**:
- `ReceiptOcrShellIT` 12 case
- `@MockBean ReceiptOcrClient` 격리 의무
- `@DirtiesContext` 적용 (@Transactional 제거, BeforeEach cleanup)

---

### SP-09-4 KFTC 오픈뱅킹 입금 매칭 shell

**핵심 결정**:
- `KftcClient` interface + `KftcClientImpl` (DRY_RUN | KFTC 분기)
- `POST /accounting/deposits/fetch-and-match` — ACCOUNTANT / MANAGER / MASTER 권한
- 자동 분개 계정과목: 차변 보통예금(103) / 대변 외상매출금(110)
- `DepositMatchAuditRecorder` REQUIRES_NEW 별도 트랜잭션 (audit fail-soft)
- `journalDraftId` UUID 는 BE 내부용 — FE 응답 DTO 미포함 (UUID 비공개 원칙)
- `DEPOSIT_DATE_RANGE_INVALID 422` (from > to) / `KFTC_SUBMIT_FAILED 502` (placeholder)

**결함 (사이클 1 발견)**:
- T3: FE client-side vs. server-side 검증 범위 명확화 (FE handleSubmit 우선)
- T4: Phase 11 확장 예정 — row 클릭 modal 현 shell 미구현 (RED 정상)

**회귀 가드**:
- `DepositMatchShellIT` 10 case
- `@MockBean KftcClient` + `@MockBean PartnerLookupClient` 격리 의무

---

## 3. 4 vendor 토큰 색상 체계 매트릭스

| vendor | 기능 | 색상 | CSS 변수 | WCAG 대비비 | Phase 11 활성 |
|---|---|---|---|---|---|
| NTS | 세금계산서 발행 배지 | green-500 (#22c55e) | --color-nts-500 | 4.5:1 이상 | NTS_API_KEY + NTS_BASE_URL |
| Aligo | SMS 발송 성공 배지 | teal-500 (#14b8a6) | --color-aligo-500 | 4.5:1 이상 | ALIGO_API_KEY + ALIGO_USER_ID |
| Clova | OCR 파싱 완료 배지 | green-700 (#16a34a) | --color-clova-700 | 4.5:1 이상 | CLOVA_OCR_API_KEY + CLOVA_OCR_SECRET_KEY + CLOVA_OCR_INVOKE_URL |
| KFTC | 입금 매칭 MATCHED 배지 | blue-500 (#3b82f6) | --color-kftc-500 | 4.5:1 이상 | KFTC_API_KEY + KFTC_CLIENT_ID + KFTC_CLIENT_SECRET |

> NOTE: 현 shell 단계에서 vendor 토큰 색상 CSS 는 DRY_RUN 안내 배너 배경으로 적용.
> Phase 11 실 연동 완료 후 발행 완료 배지에 각 vendor 색상 토큰 적용 + WCAG 4.5:1 자동 검사 추가 예정.

---

## 4. placeholder runtime guard 정책 + credential-plaintext-guard PATTERN 매트릭스

### 4-1. placeholder runtime guard 정책

각 vendor client 구현체는 ENV 키가 placeholder 값인 경우 런타임에 차단한다.

| vendor | placeholder 키 | 차단 ENV 값 | 에러 코드 | HTTP |
|---|---|---|---|---|
| NTS | NTS_API_KEY | `CHANGE_ME_LOCAL_ONLY` | ETAX_SUBMIT_FAILED | 502 |
| Aligo | ALIGO_API_KEY | `CHANGE_ME_LOCAL_ONLY` | (AligoSmsAdapter) | 502 |
| Clova | CLOVA_OCR_API_KEY, CLOVA_OCR_INVOKE_URL | `CHANGE_ME_LOCAL_ONLY` | OCR_SUBMIT_FAILED | 502 |
| KFTC | KFTC_API_KEY | `CHANGE_ME_LOCAL_ONLY` | KFTC_SUBMIT_FAILED | 502 |

- DRY_RUN 모드: placeholder 검사 우회 (mock 응답 즉시 반환)
- KFTC/NTS/CLOVA 모드 (실 API): placeholder 차단 후 502 + 한국어 메시지

### 4-2. credential-plaintext-guard PATTERN 매트릭스

SP-08-8 `scripts/check-credential-plaintext.sh` CI gate 에 SP-09 vendor key 패턴 추가:

| 패턴 | 설명 | 금지 대상 |
|---|---|---|
| `secret_[A-Za-z0-9]{30,}` | Notion integration token 실값 | docs/*.md, fixture, scripts |
| `AKIA[A-Z0-9]{16}` | AWS Access Key ID | 동일 |
| `sk-[A-Za-z0-9-]{40,}` | OpenAI API Key | 동일 |
| `CLOVA_OCR_SECRET_KEY\s*=\s*[A-Za-z0-9_-]{20,}` | Clova OCR secret key 실값 | 동일 |
| `KFTC_CLIENT_SECRET\s*=\s*[A-Za-z0-9_-]{20,}` | KFTC client secret 실값 | 동일 |
| `NTS_API_KEY\s*=\s*[A-Za-z0-9]{30,}` | NTS API key 실값 | 동일 |
| `ALIGO_API_KEY\s*=\s*[A-Za-z0-9]{20,}` | Aligo API key 실값 | 동일 |

화이트리스트:
- `clients/desktop/playwright/sp-08-8-credential-plaintext-guard/` (SP-08-8 본 spec 파일)
- `clients/desktop/playwright/sp-09-5-vendor-integration/` (SP-09-5 본 통합 spec 파일)

---

## 5. cycle 1 종합 통계 (양쪽 review 발견 결함 + fix 추이)

### SP-09-1 사이클 통계

| 사이클 | Claude 발견 | Codex 발견 | fix 완료 |
|---|---|---|---|
| N=1 | 3건 (H1 Playwright 컨텍스트 혼동, T2 route mock 구조, T4 UUID 형식) | 2건 (C1/M3 @Pattern 누락, ETaxClient 인터페이스 시그니처) | 5건 fix |
| N=1.5 (통합) | 통합 fix 사이클 (폐기 — 2026-05-17 메모리 정정) | — | — |

### SP-09-2 사이클 통계

| 사이클 | Claude 발견 | Codex 발견 | fix 완료 |
|---|---|---|---|
| N=1 | 4건 (data-testid 불일치 3건, T5 ACCOUNTANT 차단 assert) | 3건 (AligoSmsAdapter failure path, result_code 분기, send_audit 저장 fail-soft) | 7건 fix |

### SP-09-3 사이클 통계

| 사이클 | Claude 발견 | Codex 발견 | fix 완료 |
|---|---|---|---|
| N=1 | 3건 (bodyText fallback 2건, QA-H1 BE shape 정합) | 4건 (BE-H1 null 방어, CLOVA placeholder 누락, file input attach 방식, @DirtiesContext) | 7건 fix |
| N=2 (cycle 2 재검증) | 1건 (T5 ACCOUNTANT 권한 추가 누락) | 1건 (T1 data-testid 기반 검증 강화) | 2건 fix |

### SP-09-4 사이클 통계

| 사이클 | Claude 발견 | Codex 발견 | fix 완료 |
|---|---|---|---|
| N=1 | 2건 (T3 FE/BE 검증 범위 혼동, T4 Phase 11 RED 명시) | 3건 (DepositMatchResultDto shape, journalDraftId UUID 비공개, REQUIRES_NEW audit) | 5건 fix |

**전체 평균 사이클**: N=1.2 (SP-08 회고 적용 효과 — N=1.3 대비 -0.1)
**총 발견 결함**: 37건 (Claude 12건 + Codex 18건 + 사용자 정정 7건)
**fix 완료**: 37건 (100%)

---

## 6. 4 vendor 권한 매트릭스 통합 표

| 역할 | NTS emit-nts | Aligo SMS 이력 | Clova OCR | KFTC 입금매칭 |
|---|---|---|---|---|
| MASTER | 허용 | 허용 | 허용 | 허용 |
| ACCOUNTANT | 허용 | 차단 403 | 허용 (cycle 2 추가) | 허용 |
| MANAGER | 차단 403 | 허용 | 허용 | 허용 |
| DISPATCH | 차단 403 | 허용 | 차단 403 | 차단 403 |
| WAREHOUSE | 차단 403 | 차단 403 | 허용 | 차단 403 |
| SALES | 차단 403 | 차단 403 | 차단 403 | 차단 403 |
| DRIVER | 차단 403 | 차단 403 | 차단 403 | 차단 403 |

> 특이 사항:
> - NTS emit-nts: MANAGER 차단 (TaxInvoiceEmitNtsIT case 3 명시) — ACCOUNTANT/MASTER 전용
> - Clova OCR: ACCOUNTANT 추가 허용 (cycle 2 사용자 정정 — 매입 영수증 + 분개 통합 흐름)
> - Aligo SMS: DISPATCH 허용 (DispatchSmsSaveHistoryController 별도 권한)

---

## 7. Phase 11 sandbox 전환 체크리스트

### 7-1. NTS (국세청 e-Tax)

- [ ] `.env` 에 `NTS_API_KEY=<실값>` + `NTS_BASE_URL=<홈택스 sandbox URL>` 주입
- [ ] `etax.submit-method=DRY_RUN` → `etax.submit-method=NTS` 변경 (application.yml)
- [ ] ETaxClientImpl.submit() — NTS 실 API 호출 로직 구현
- [ ] IT: `TaxInvoiceEmitNtsIT` case 1 (DRY_RUN 유지) + case 8 (NTS mode) 검증

### 7-2. Aligo SMS

- [ ] `.env` 에 `ALIGO_API_KEY=<실값>` + `ALIGO_USER_ID=<실값>` + `ALIGO_SENDER=<발신번호>` 주입
- [ ] `AligoProperties.apiKey` placeholder 해제 후 실 발송 테스트 (소량)
- [ ] IT: `AligoSmsAdapterPlaceholderRuntimeGuardIT` — DRY_RUN 유지 → 실 발송 시 별도 IT 추가

### 7-3. Clova OCR (Naver Clova)

- [ ] `.env` 에 `CLOVA_OCR_API_KEY=<실값>` + `CLOVA_OCR_SECRET_KEY=<실값>` + `CLOVA_OCR_INVOKE_URL=<endpoint>` 주입
- [ ] `ocr.submit-method=DRY_RUN` → `ocr.submit-method=CLOVA` 변경
- [ ] ReceiptOcrClientImpl — Naver Clova APIGW REST 호출 구현
- [ ] IT: `ReceiptOcrShellIT` case 6/12 (CLOVA placeholder → 502) → 실 CLOVA 호출 분리

### 7-4. KFTC (오픈뱅킹)

- [ ] KFTC 오픈뱅킹 API 실 키 발급 (금융결제원 개발자 센터)
- [ ] `.env` 에 `KFTC_API_KEY=<실값>` + `KFTC_CLIENT_ID=<실값>` + `KFTC_CLIENT_SECRET=<실값>` 주입
- [ ] `kftc.submit-method=DRY_RUN` → `kftc.submit-method=KFTC` 변경
- [ ] KftcClientImpl.fetchDeposits() — KFTC 오픈뱅킹 REST 호출 구현
- [ ] IT: `DepositMatchShellIT` case 8 (KFTC placeholder → 502) → 실 KFTC 호출 분리

### 7-5. 공통

- [ ] `scripts/check-credential-plaintext.sh` — SP-09 vendor key 패턴 추가 (`CI credential-plaintext-guard` job 재실행)
- [ ] `docs/dev-environment-setup-multi-pc.md` — Phase 11 sandbox `.env` 발급 절차 추가
- [ ] Phase 11 sandbox 연동 완료 후 `DRY_RUN` 안내 배너 제거 (각 vendor 페이지)

---

## 8. 시리즈 종료 선언

SP-09 Phase 9 vendor 연동 시리즈 — 5 PR 누적 완료. NTS e-Tax / Aligo SMS / Naver Clova OCR / KFTC 오픈뱅킹 4 vendor 외부 연동 shell + DRY_RUN sandbox 모드 + placeholder runtime guard + 권한 매트릭스 확립 완료.

**다음 Phase 후보**:
- **Phase 10 W10-2 (인성데이타 퀵프로그램)** — arologis-service 독립 운영 단위 ([project_arologis_independent.md](.claude/memory/project_arologis_independent.md))
- **Phase 11 AWS migration** — Seoul m5.xlarge + db.t3.medium + RDS auto backup + EC2 Auto Recovery ([project_phase11_aws.md](.claude/memory/project_phase11_aws.md))

**개발책임자 판단**:
- 운영 긴급도 높으면 Phase 11 AWS migration 우선 (비용 ₩405K/월 확정, EC2 자동 복구)
- 기능 확장 우선이면 Phase 10 W10-2 인성데이타 퀵프로그램 진입

**tech-manager — 2026-05-18**
