# Phase 11 AWS migration 진입 전 운영 검증 종합 체크리스트

> **목적** — Phase 10 (GAS 이식 + e-Count 대체) 100% 완료 후, Phase 11 AWS migration 진입 전에 **로컬에서 모든 service 정상 동작 + 실 데이터 + 외부 spec** 을 검증하여 단일 환경 cutover 의 회귀 위험을 0 에 가깝게 한다.
>
> **결정 근거** — `MEMORY.md` 의 `project_phase11_aws.md` (Seoul m5.xlarge + db.t3.medium + ₩405K/월) — 단일 환경 + 자동 복구 구조에서는 production 부팅 전 **로컬 dry-run** 이 유일한 안전망.
>
> **AWS 진입 가드** — 본 문서의 6 항목 모두 ✅ 후 Phase 11 PR 진입 권고. 1 건이라도 미검증 시 사용자/PM 합의 후 위험 수용 명시.

---

## 1. 검증 6 항목 + 산출물 매핑

| # | 항목 | 산출물 | 사용자 작업 | Claude (PM) 작업 |
| - | ---- | ------ | ----------- | ---------------- |
| 1 | Tesseract OCR 설치 + vendor 발주 실 검증 | [tesseract-validation.md](./tesseract-validation.md) | UB Mannheim installer 다운로드 + 설치 + PATH 등록 + 검증 명령 실행 | 가이드 (PR-F2 commit `f4232ba` 의 `docs/dev-environment/tesseract-setup.md` 활용) |
| 2 | SMTP 설정 (notification-service) | [smtp-validation.md](./smtp-validation.md) | cafe24 SMTP / AWS SES 등 실 SMTP secret 입력 + 비밀번호 재설정 메일 발송 테스트 | env 변수 명세 + 테스트 endpoint 안내 |
| 3 | 알리고 API 실 spec 적용 | [aligo-api-validation.md](./aligo-api-validation.md) | 알리고 주소록 API 인증 정보 + endpoint spec 첨부 → `RestClientAligoAddressBookClient` 작성 | mock → 실 RestClient 교체 가이드 + 인터페이스 계약 |
| 4 | 4 CSV DB 이관 실 데이터 (Notion export 활용) | [notion-csv-import-validation.md](./notion-csv-import-validation.md) + [import-notion-csv.ps1](../../tools/operational-validation/import-notion-csv.ps1) | start-local-full.ps1 부팅 후 본 스크립트 실행 + 결과 row count 검증 | 자동화 PowerShell 스크립트 (admin endpoint 4 회 POST, 이후 DB CRUD만 사용) |
| 5 | Service Account 키 설정 + 종합견적서/주문서 원본 검증 | [google-sheets-sa-validation.md](./google-sheets-sa-validation.md), [google-sheets-source-validation.md](./google-sheets-source-validation.md), [google-sheets-live-source-snapshot.md](./google-sheets-live-source-snapshot.md) | GCP console 에서 SA 키 발급 + `%USERPROFILE%\.samhan\sa-key.json` 배치 + 시트 공유 설정 | 위치 가이드 + product-service / partner-order-service 공통 의존 명세 + legacy GAS source tab 대조 |
| 6 | 로컬 모든 service 부팅 + 동작 검증 | [boot-and-smoke-validation.md](./boot-and-smoke-validation.md) + [run-smoke-tests.ps1](../../tools/operational-validation/run-smoke-tests.ps1) | start-local-full.ps1 부팅 후 본 스크립트 실행 + 결과 표 확인 | 14 service 헬스 + 주요 endpoint smoke test 자동화 스크립트 |

---

## 2. 진행 상황 chart

> 사용자가 검증 완료 시 본 표의 `상태` 를 ⬜ → ✅ 로 update.

| # | 항목 | 상태 | 검증 일자 | 비고 |
| - | ---- | ---- | --------- | ---- |
| 1 | Tesseract OCR 설치 | ⬜ |  |  |
| 2 | SMTP 설정 + 비밀번호 재설정 메일 발송 | ⬜ |  |  |
| 3 | 알리고 API 실 spec 적용 + 1 회 동기화 | ⬜ |  |  |
| 4 | 4 CSV DB 이관 (REGION/DC/CHAT/BLOCK — CSV 실제 non-empty row 기준) | ✅ | 2026-05-16 | REGION 20 / DC 213 / CHAT 112 / BLOCK 6 모두 HTTP 200, rejected 0 |
| 5 | Service Account 키 + 종합견적서/주문서 Google Sheet 원본 검증 | ⬜ |  | 2026-05-16 connector live snapshot + targeted test PASS. runtime SA 키 검증은 키 배치 후 진행 |
| 6 | 14 service 부팅 + smoke test green | ✅ | 2026-05-16 | service health UP 15/15, endpoint smoke OK 7/7 |

---

## 3. 사용자 / Claude 작업 분담 원칙

### 사용자 (개발책임자) 작업
- **외부 secret 입력** — SMTP 자격증명 / 알리고 인증 / GCP SA 키 (보안상 Claude 가 절대 다룰 수 없음)
- **외부 software 설치** — Tesseract installer 실행 (OS native)
- **검증 명령 실행** — 본 디렉토리의 PowerShell 스크립트 + curl 명령 직접 실행
- **결과 판정** — ✅ / ❌ 표시 + 회귀 발견 시 issue 등록

### Claude (PM) 작업
- **자동화 스크립트** — `tools/operational-validation/*.ps1` (PowerShell 5.1 호환)
- **endpoint 명세 + payload schema** — admin endpoint 호출 가이드
- **fix 절차 안내** — 실패 항목 발견 시 backlog 정리 + 작업 분배
- **AWS 진입 판정 보조** — 6 항목 종합 + 위험 수용 여부 권고

---

## 4. 권장 검증 순서

```
[1] Tesseract OCR 설치        ─┐
                               ├─→ [6] 14 service 부팅 + smoke test
[5] Service Account 키 배치   ─┘                │
                                                ▼
[2] SMTP 설정                  ────────→ [실 SMTP 메일 1 회 송신 검증]
                                                │
                                                ▼
[4] 4 CSV import               ────────→ [REGION/DC/CHAT/BLOCK row count]
                                                │
                                                ▼
[3] 알리고 실 spec 적용        ────────→ [주소록 1 회 동기화 검증]
                                                │
                                                ▼
                                        [Phase 11 AWS PR 진입]
```

> **순서 근거** — Tesseract + SA 키 = 부팅 사전 의존. SMTP / 알리고 = 외부 자격증명 부재 시 graceful skip 가능. CSV import = 부팅 후 admin endpoint 호출.

---

## 5. 실패 시 fix 절차

### 5-1. 항목 1 (Tesseract) 실패
- 설치 미완료 → `docs/dev-environment/tesseract-setup.md` §2 PATH 등록 재확인
- `tesseract --list-langs` 에 `kor` 누락 → installer 재실행 시 언어팩 체크
- partner-order-service `SAMHAN_OCR_ENABLED=false` (default) 상태에서는 endpoint 503 — 검증 시 `true` 로 toggle

### 5-2. 항목 2 (SMTP) 실패
- cafe24 SMTP — 한글 from / port 25 차단 → port 587 + STARTTLS 권장
- AWS SES sandbox 모드 — 송신/수신 모두 verified 주소만 허용 → production access 신청 (별도 작업)
- SmtpEmailAdapter NoOp 동작 → username 미설정 의심, env 변수 다시 export

### 5-3. 항목 3 (알리고) 실패
- 인증 fail (HTTP 401) → `SAMHAN_ALIGO_KEY` / `SAMHAN_ALIGO_USERID` 오타 확인
- chunk 50 초과 시 429 → backoff 정상 동작 확인 (`AligoAddressBookSyncService` 로그)
- 실 spec 부재 → mock 유지 + Phase 11 cutover 후 별도 PR 작성

### 5-4. 항목 4 (CSV import) 실패
- HTTP 401 → JWT 발급 실패. `kimmiseon` 로그인 응답 token 환경변수 export 확인
- HTTP 400 (CSV 파싱) → UTF-8 BOM 누락 / 한국어 datetime 형식 차이 → import 서비스 reject 보고서 확인
- DB row count 부족 → admin endpoint 응답의 `rejected` 배열 검토 + lookup miss 추적

### 5-5. 항목 5 (SA 키 / Google Sheets 원본) 실패
- `FileNotFoundException: /etc/samhan/sa-key.json` (Linux 경로) → Windows 환경 시 `GOOGLE_SERVICE_ACCOUNT_KEY` env 로 override (`%USERPROFILE%\.samhan\sa-key.json`)
- HTTP 403 (시트 접근) → SA email 을 시트 공유 (편집자) 추가 누락
- HTTP 404 (sheet-id) → `GOOGLE_SHEETS_SHEET_ID` env 또는 application.yml 명시 sheet-id 불일치
- `종합견적서!A2:C`에서 모델 lookup 시도 → 잘못된 range override. `INTEGRATED_QUOTE_RANGE`를 비우고 `*_단가인상` 원본 tab + product DB/PriceHistory 매핑을 사용

### 5-6. 항목 6 (smoke test) 실패
- 특정 service DOWN → `.local-logs/<service>.log` 추적
- auth-service DOWN → user-service OrgChartSeeder cascade fail (W10-5 회고)
- DB connection — `max_connections` 부족 (W10-6 회고) → `start-local-full.ps1` 의 `[1a/6]` 검증 결과 확인

---

## 6. AWS 진입 가드 (Phase 11 PR 작성 사전 조건)

본 6 항목 중 **실 외부 spec 의존이 부재한 경우 (#3 알리고)** 만 mock 유지로 통과 인정. 그 외 모든 항목은 실 데이터 / 실 자격증명으로 ✅ 의무.

| 항목 | mock 통과 허용? | 미달 시 Phase 11 진입 |
| ---- | --------------- | --------------------- |
| #1 Tesseract | ✗ (binary 의존) | 차단 |
| #2 SMTP | ✗ (메일 1 회 송신 의무) | 차단 |
| #3 알리고 | ⭕ (실 spec 부재 시 mock 유지) | 위험 수용 후 진입 가능 |
| #4 4 CSV | ✗ (row count 의무) | 차단 |
| #5 SA 키 / 종합견적서·주문서 원본 | ✗ (시트 의존) | 차단 |
| #6 smoke test | ✗ (service 14 모두 healthy 의무) | 차단 |

**위험 수용 절차** — 항목 #3 만 미검증 상태로 Phase 11 진입 시, PR 본문에 `알리고 spec 후속 PR` 명시 + 사용자 승인 댓글 필수.

---

## 7. 참조

- `MEMORY.md` `project_phase11_aws.md` — AWS 단일 환경 + 자동 복구 구조
- `docs/migration/decisions/DECISIONS.md` — Phase 10 결정 이력
- `docs/dev-environment/tesseract-setup.md` — PR-F2 DevOps Tesseract 가이드
- `infrastructure/scripts/start-local-full.ps1` — 14 service 부팅 스크립트 (본 검증의 사전 의존)
- `tools/legacy-gas/종합견적서/Code.js`, `tools/legacy-gas/거래처 발송 주문서/Code.js` — Google Sheet source tab 계약
