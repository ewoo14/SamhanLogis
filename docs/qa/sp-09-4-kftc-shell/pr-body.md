## 요약

**Phase 9 vendor 연동 시리즈 4번째 슬라이스** — KFTC 오픈뱅킹 입금 매칭 + 자동 분개 shell. SP-09-1/2/3 패턴 일관 (placeholder runtime guard + 빈 값 ENV + DRY_RUN 우선).

- `KftcClient` interface + DRY_RUN/KFTC 분기 `KftcClientImpl` (3개 키 모두 4 키워드 placeholder 차단)
- `DepositMatchService` — 입금 거래 조회 → 거래처/세금계산서 자동 매칭 → 자동 분개 (차변 보통예금 / 대변 외상매출금)
- 권한: ACCOUNTANT/MANAGER/MASTER (SP-09-1 NTS 와 일관)
- FE 입금 매칭 조회 화면 + 결과 요약 + 테이블
- design-system `--color-kftc-*` 6종 신규 (KFTC 파란 #0061A8) — 4색 vendor 시각 구분 완성

## 변경 파일

### BE (accounting-service)
- `client/KftcClient.java` interface + `KftcClientImpl.java` (DRY_RUN/KFTC 분기)
- `client/KftcDepositRecord.java` record
- `service/DepositMatchService.java` — 매칭 + 분개 DRAFT 생성
- `service/DepositMatchAuditRecorder.java` — REQUIRES_NEW 별도 트랜잭션
- `web/DepositMatchController.java` POST /accounting/deposits/fetch-and-match
- `web/dto/DepositFetchRequest.java` / `DepositMatchResponse.java` / `DepositMatchResultDto.java`
- `domain/JournalSourceType.java` — `KFTC_DEPOSIT` 추가
- `service/JournalExcelExportService.java` switch 커버리지 보완
- `application.yml` kftc.* 5 키 블록
- `db/migration/V11__*.sql` journals.source_type comment
- `shared/common/ErrorCode.java` — KFTC_SUBMIT_FAILED(502) + DEPOSIT_DATE_RANGE_INVALID(422)

### IT (10 case)
- `DepositMatchShellIT.java`
- 기존 IT 19개 `@MockBean KftcClient` 격리 (ETaxClient 패턴 일관)

### FE (desktop)
- `api/depositMatchApi.ts` (BE shape 정확 1:1, `journalDraftId` 미노출)
- `routes/DepositMatchPage.tsx`
- `api/mock.ts` POST handler (DRY_RUN 5건 / 422 / 502)
- `routes/index.tsx` + `components/AppLayout.tsx` 입금 매칭 메뉴

### Designer
- `tokens.css` + `tokens/index.ts` — `--color-kftc-*` 6종 (`#0061A8`)
- HTML mock 4 + PNG 4 (176~220KB)

### QA
- `playwright/sp-09-4-kftc-shell/sp-09-4-kftc-shell.spec.ts` T1~T5 (T4 modal Phase 11 이관 RED 처리)

### DevOps + 보안 정책
- `infrastructure/env-templates/accounting-service.env` KFTC 5 키 빈 값 + DRY_RUN
- `docs/dev-environment-setup-multi-pc.md` 보안 정책 표 갱신
- `scripts/check-credential-plaintext.sh` PATTERN_KFTC + placeholder 화이트리스트 우회 차단

## QA 스크린샷

### 01. 조회 폼 + DRY_RUN 안내
![01 form](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-4-kftc-shell/docs/qa/sp-09-4-kftc-shell/screenshots/01-deposit-fetch-form.png)

### 02. 결과 요약 + 테이블 (총 5 / 매칭 3 / 미매칭 2)
![02 result](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-4-kftc-shell/docs/qa/sp-09-4-kftc-shell/screenshots/02-deposit-match-result-success.png)

### 03. 매칭 상세 modal + 자동 분개 미리보기
![03 detail](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-4-kftc-shell/docs/qa/sp-09-4-kftc-shell/screenshots/03-deposit-match-detail.png)

### 04. 실패 (from > to 422 / KFTC placeholder 502)
![04 failure](https://github.com/ewoo14/SamhanLogis/raw/feat/sp-09-4-kftc-shell/docs/qa/sp-09-4-kftc-shell/screenshots/04-deposit-fetch-failure.png)

## 권한 (SP-03 §4.2 + SP-09-1 일관)

| Role | 입금 매칭 |
|---|---|
| MASTER | ✅ |
| MANAGER | ✅ |
| ACCOUNTANT | ✅ |
| SALES / WAREHOUSE / DISPATCH | ❌ (403) |

## 외부 vendor 키 보안 정책 (사용자 결정 2026-05-18)

| vendor | 슬라이스 | client | 현재 상태 |
|---|---|---|---|
| NTS | SP-09-1 | `ETaxClientImpl` | 빈 값 + DRY_RUN |
| Aligo SMS | SP-09-2 | `AligoSmsAdapter` | 빈 값 + stub |
| Naver Clova OCR | SP-09-3 | `ReceiptOcrClient` | 빈 값 + DRY_RUN |
| **KFTC** | **SP-09-4 (본 PR)** | `KftcClientImpl` | **빈 값 + DRY_RUN** |
| 인성데이타 퀵 | Phase 10 W10-2 | `InsungQuickClient` | 빈 값 |

## 검증

- [x] `./gradlew :services:accounting-service:compileJava :services:accounting-service:compileTestJava` BUILD SUCCESSFUL
- [x] `npm run typecheck` (clients/desktop) PASS
- [x] `bash scripts/check-credential-plaintext.sh` PASS
- [x] BaseEntity 7 audit + Soft Delete 준수
- [x] UUID 비공개 (journalDraftId 미노출, matchedPartnerCode 비즈니스 식별자만)
- [x] 도메인 메서드 chain
- [x] @MockBean KftcClient 19개 IT 격리
- [x] SP-09-3 cycle 1 회귀 가드 (false green 0건, BE/FE shape 1:1, HashRouter URL 정합)

## Phase 9 진행

- ✅ SP-09-1 NTS e-tax (#236)
- ✅ SP-09-2 Aligo SMS (#237)
- ✅ SP-09-3 Naver Clova OCR (#238)
- 🔄 **SP-09-4 KFTC 오픈뱅킹 (본 PR)**
- ⏭️ SP-09-5 통합 검증

## Phase 11 이관

- KFTC 실 sandbox API 호출 (`KftcClientImpl.submitKftc()`) — 현재 placeholder runtime guard 후 BusinessException
- T4 매칭 상세 modal — Phase 11 구현 (현재 RED)
- 분개 DRAFT 자동 → 회계담당자 검수 후 POSTED 흐름

연관 Issue: Phase 9 vendor 연동 시리즈 4번째 슬라이스

🤖 Generated with [Claude Code](https://claude.com/claude-code)
