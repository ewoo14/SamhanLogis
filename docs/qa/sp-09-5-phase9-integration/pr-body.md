## 요약

**Phase 9 vendor 연동 시리즈 종료 슬라이스** — SP-09-1~4 4 vendor (NTS / Aligo / Clova / KFTC) 통합 검증 + 종료 보고서 + **ETaxClient regression fix** (4 vendor 정책 위반 발견).

- 4 vendor 통합 Playwright 5 case (placeholder/DRY_RUN/권한/토큰/credential guard)
- 통합 IT 8 case (NTS+KFTC 동시 SpringBootTest 컨텍스트, accounting-service)
- 단위 테스트 — 3 service vendor placeholder guard cross-check (accounting/notification/slip)
- **regression fix** — `ETaxClientImpl.isPlaceholderApiKey()` 에 `CHANGE_ME_LOCAL_ONLY` 누락 → 4 vendor 정책 일관 (4 키워드)
- 종료 보고서 + 4 vendor 토큰 매트릭스 + Phase 11 cutover 체크리스트

## 변경 파일

### BE 통합 검증
- `services/accounting-service/.../vendor/Phase9VendorPlaceholderGuardConsistencyTest.java` — NTS + KFTC + ErrorCode + AuditRecorder 회귀 가드
- `services/accounting-service/.../it/Phase9VendorIntegrationIT.java` — 8 case (NTS+KFTC 동시 DRY_RUN, placeholder, 권한)
- `services/notification-service/.../adapter/sms/Phase9AligoPlaceholderGuardConsistencyTest.java`
- `services/slip-service/.../vendor/Phase9OcrPlaceholderGuardConsistencyTest.java`

### Regression Fix (CRITICAL)
- `services/accounting-service/.../client/ETaxClientImpl.java` — `isPlaceholderApiKey()` 에 `CHANGE_ME_LOCAL_ONLY` 추가 (4 vendor 일관)
- regression guard test GREEN 전환

### QA 통합 Playwright (5 case)
- `clients/desktop/playwright/sp-09-5-vendor-integration/sp-09-5-vendor-integration.spec.ts` — 1,236행

### Designer 통합
- HTML mock 4장 + PNG 4장 (245~437KB)
- `docs/design/sp-09-5-vendor-integration/decisions.md` (12 section)

### Docs (종료 보고서)
- `docs/dev-reports/sp-09-summary.md` (260행) — Phase 9 종합
- `docs/dev-reports/sp-09-5-vendor-integration-summary.md`
- `docs/handoff/CURRENT-WORK.md` — Phase 9 종료 + Phase 10/11 진입 안내

## QA 스크린샷

### 01. 4 vendor 통합 Dashboard (NTS/Aligo/Clova/KFTC 카드)
![01 vendor dashboard](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-5-phase9-integration-summary/docs/qa/sp-09-5-phase9-integration/screenshots/01-vendor-dashboard.png)

### 02. placeholder 입력 시 4 vendor 한국어 에러
![02 placeholder errors](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-5-phase9-integration-summary/docs/qa/sp-09-5-phase9-integration/screenshots/02-vendor-placeholder-errors.png)

### 03. 7 역할 × 4 vendor 권한 매트릭스
![03 permission matrix](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-5-phase9-integration-summary/docs/qa/sp-09-5-phase9-integration/screenshots/03-vendor-permission-matrix.png)

### 04. Phase 11 Cutover 흐름 (4 vendor 별 단계)
![04 phase 11 cutover](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-5-phase9-integration-summary/docs/qa/sp-09-5-phase9-integration/screenshots/04-phase-11-cutover-flow.png)

## 4 vendor 토큰 매트릭스

| Vendor | Primary | 슬라이스 | WCAG | 도입 PR |
|---|---|---|---|---|
| NTS 국세청 | `#0F6523` | SP-09-1 | AAA | #236 |
| Aligo SMS | `#0F766E` | SP-09-2/4 | AAA 9.1:1 | #237 (#239 토큰 등록) |
| Naver Clova OCR | `#03C75A` | SP-09-3 | AAA 10.8:1 | #238 |
| KFTC 오픈뱅킹 | `#0061A8` | SP-09-4 | AAA 9.4:1 | #239 |

## 외부 vendor 키 보안 정책 (사용자 결정 2026-05-18) — 4 vendor 일관

1. **env 템플릿 빈 값** — `infrastructure/env-templates/*.env`
2. **placeholder 4 키워드 차단** — `PLACEHOLDER_DEV_ONLY` / `CHANGE_ME_LOCAL_ONLY` / `changeme` / `dummy` (case-insensitive)
3. **runtime guard** — 각 Client (ETaxClientImpl / AligoSmsAdapter / ReceiptOcrClientImpl / KftcClientImpl) 일관
4. **CI guard** — `Credential Plaintext Guard` job + PATTERN 5종 (NTS/ALIGO/ALIGO_USERID/CLOVA/KFTC)
5. **실 키 주입** — 운영/sandbox PC `.env` (gitignore) 또는 Phase 11 AWS Parameter Store

## 권한 매트릭스 (7 역할 × 4 vendor)

| Role | NTS | Aligo | Clova OCR | KFTC |
|---|---|---|---|---|
| MASTER | ✅ | ✅ | ✅ | ✅ |
| MANAGER | ✅ | ✅ | ✅ | ✅ |
| ACCOUNTANT | ✅ | ❌ | ✅ | ✅ |
| WAREHOUSE | ❌ | ❌ | ✅ | ❌ |
| SALES | ❌ | ❌ | ❌ | ❌ |
| DISPATCH | ❌ | ✅ | ❌ | ❌ |
| DRIVER | ❌ | ❌ | ❌ | ❌ |

## Phase 11 sandbox 전환 체크리스트

각 vendor 별:
1. sandbox 키 발급 (NTS 홈택스 / Aligo / Naver Clova / KFTC)
2. `.env` 또는 AWS Parameter Store 에 실 키 주입 (placeholder 금지)
3. `*_SUBMIT_METHOD` property 변경 (DRY_RUN → NTS / KFTC / CLOVA / 실 Aligo)
4. credential-plaintext-guard CI PASS 유지
5. IT @MockBean 격리 — `*ClientImpl` 실 호출 미테스트 환경

## 검증

- [x] `./gradlew :services:accounting-service:test --tests Phase9VendorPlaceholderGuardConsistencyTest` BUILD SUCCESSFUL
- [x] BaseEntity / Soft Delete / 도메인 메서드 chain / UUID 비공개 / 한국어 / @MockBean
- [x] 4 vendor placeholder 4 키워드 정책 일관 (regression fix 후)
- [x] 4 vendor 토큰 design-system 등록
- [x] credential-plaintext-guard PASS

## Phase 9 vendor 시리즈 완성 (5/5)

- ✅ SP-09-1 NTS e-tax (#236)
- ✅ SP-09-2 Aligo SMS (#237)
- ✅ SP-09-3 Naver Clova OCR + 보안 정책 통합 (#238)
- ✅ SP-09-4 KFTC 오픈뱅킹 (#239)
- 🔄 **SP-09-5 Phase 9 통합 검증 + 종료 보고서 (본 PR)**

## 다음 Phase

- **Phase 10 W10-2** — 인성데이타 퀵프로그램 실 vendor 통합 (5만 프리랜서 풀, arologis-service)
- **Phase 11 AWS** — Seoul 단일 환경 RDS auto backup + EC2 Auto Recovery + Health Check Lambda + Parameter Store

연관 Issue: Phase 9 vendor 연동 시리즈 종료

🤖 Generated with [Claude Code](https://claude.com/claude-code)
