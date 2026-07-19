# #832 — #810 mock parity·감사 이력 정밀도 잔여 (기획 spec v2)

> OPUS 기획 · 백로그 번다운(B2-FE 잔여). #810 R3 적대검증(CODEX SOL) 발견 → 개발책임자 결정 A. **CODEX SOL 기획검수 R1(BLOCKING 4·계약 정의·검증 범위) 반영 v2.** 교차검증: 항목4 BOM=개발책임자 결정("BE 보존·mock 일치")·항목1~3 PM 자율.

## 0. 성격·범위
- mock parity(테스트 품질·vitest false-green 제거)·감사 표시 정밀도. **사용자 데이터 오염 아님**(fail-safe·BE ITs·라이브QA genuine). #810 핵심 머지 완료.
- 4항목: [1][2][4] = FE mock(`clients/desktop/src/renderer/api/mock.ts`) · [3] = BE(accounting) + DTO + FE 표시. **BE 정규화·revision allocator 무변경**(진실원).

## 1. 결정

### D-832-01 (항목1) mock 거래처 status hydration — 활성 계약 정확화(SOL B1)
mock(`mock.ts:16894` 응답 조립)이 거래처 status·isDeleted 를 버리고 항상 `ACTIVE/staleTarget=false` 로 만들고, 자동매칭(`mock.ts:17046`)도 status/isDeleted 검사 없이 적용 → FE stale 분기(`DepositorMappingPage.tsx:41`)가 vitest 에서 false-green.
- **활성 계약(BE 정확 일치)**: `status ∈ {null, blank, ACTIVE} → 활성` · `status ∈ {SUSPENDED, TERMINATED} 또는 isDeleted=true 또는 NOT_FOUND → stale`. (BE 근거: `PartnerSummary.java:43` null/blank 호환활성·`DepositorMappingService.java:304` SUSPENDED/TERMINATED stale.) ⚠️ **비활성 ≠ UNAVAILABLE** — stale 과 UNAVAILABLE(거래처 조회 실패/없음) 분기 별도.
- **fix**: mock 거래처 조회(mockPartnerByCode 등)에 실 status/isDeleted 반영 → 자동매칭은 **활성만** 성립·stale(SUSPENDED/TERMINATED/삭제/NOT_FOUND)은 stale 집계(`staleSkippedCount`/`staleNormalizedNames`) 실 반영. **목록 hydration·CODEF import·CSV import 세 경로 모두**.
- **검증**: SUSPENDED·TERMINATED·삭제 **각각** × (목록 hydration·CODEF import·CSV import) stale 집계 genuine(경로별 되돌리면 RED). null/blank/ACTIVE 활성 유지. 단일 "비ACTIVE 1건"은 부적정(경로 하나 되돌려도 false-green).

### D-832-02 (항목2) mock CODEF matchedCount 실계산 — BE 정의 일치(SOL B2)
`mock.ts:6277` `matchedCount:0` 하드코딩. 실 BE(`CodefImportService.java:210` 저장성공 후 `matched++`)는 **신규 저장 성공 행 중 자동매칭된 수**(중복·저장실패 제외)를 셈.
- **정의(BE 일치)**: `matchedCount = 중복이 아니어서 신규 적재된 행 중 partnerMatchSource ∈ {DEPOSITOR_MAPPING(입금자명), PARTNER_CODE_EXACT(은행/카드 코드정확)} 인 수`. ⚠️ dedup 이전 transformed 행 수 아님·`matchStatus`(회계반영 상태·`BankTransaction.java:201` applyPartnerMatch 무관)로 세지 말 것.
- **fix**: mock CODEF import 결과 조립 시 위 정의로 실계산.
- **검증**: ① 입금자명 매핑 적중 ② 코드정확일치(PARTNER_CODE_EXACT) 적중 ③ **동일 import 재호출 시 `importedCount=0, matchedCount=0`**(중복 제외). 단순 `matchedCount>0` 부적정.

### D-832-03 (항목3) 감사 이력 operation ordinal / 세대 라벨 — 작업 단위 그룹(SOL B3)
`DepositorMappingService.history`(:234)가 entity별 audit log 결합 → **각 entity revisionNo 가 #1 부터라 중복**. `BankDepositorPartnerMappingHistoryResponse`(DTO)·`DepositorMappingPage.tsx:421`(FE)가 revisionNo 를 회차로 표시.
- **작업 식별자 = `(entityId, revisionNo)`**(SOL B3): 한 작업은 여러 필드행 공유(`AccountingAuditLogService.java:73` 같은 revisionNo). **동일 작업의 전 필드행은 같은 `operationOrdinal` 공유**(행단위 유일 금지 — 한 수정이 여러 "작업 N"으로 쪼개짐).
- **operationOrdinal**: 작업 단위(=`(entityId,revisionNo)` distinct)로 **시간순 1..N 유일·연속**. 작업 시각 = 그룹 내 **`min(changedAt)`**. 동시각 tiebreak = **세대(entityId 최초등장 순)** + entity-내부 revisionNo(안정적·결정적). ⚠️ `revisionNo`는 entity-local 이라 전역 tiebreak 금지. 레거시 = `(entityId,revisionNo)` 동일하나 필드별 `changed_at` 분산 행 존재(10건) → **changedAt 동일성으로 그룹핑 금지**(작업 오분할). 행단위 유일성은 기존 `entryKey`(`historyEntryKey`) 유지.
- **세대 라벨**: entityId 최초등장 시간순 1세대/2세대…(삭제+재생성 신·구 매핑 구분). UUID 응답 미노출.
- **fix(BE)**: `history()`/`toHistory` 가 `operationOrdinal`·`generation` 파생(표시용)해 DTO 에 추가. **#830 revision allocator 무변경**(현행 채번 유지·표시 ordinal 만 파생·#830 결정과 무충돌). **fix(FE)**: 이력 표시를 revisionNo→"작업 N"(operationOrdinal)+세대 구분.
- **검증(IT·실 Spring/Postgres)**: ① **한 작업 다중 필드행 → 동일 ordinal** ② 같은 작업 `changedAt` 분산 레거시 행 → 오분할 없음 ③ 세대 간 동시각 → 안정 tiebreak ④ 반복 조회 안정성(동일 순서·ordinal). FE "작업 N"/세대 표시 회귀.

### D-832-04 (항목4) mock 입금자명 정규화 = BE 일치 (BOM 보존·전 경로·SOL B4)
런타임 확증: BE `DepositorNameNormalizer`(`:23`)는 `Character.isWhitespace(FEFF)=false`→**BOM 보존**(`normalize("﻿acme")="﻿ACME"`), mock `\s`+`trim()`은 **strip**("ACME"). 개발책임자 결정 = **BE 보존 유지·mock을 BE에 일치·BE 무변경**.
- **fix(mock 전 경로 replicate)**: mock 의 BOM-strip divergence 는 helper 뿐 아니라 **create/update/history/delete/learn 전 경로**:
  - `mockDepositorNameNormalize`(:16875 helper)
  - history key `.trim()`(:6532)·update old key `.trim()`(:6606)·delete key `.trim()`(:6659)·learn/수동매칭 blank판정+rawName 저장 `.trim()`(:17065)
  - → BE `normalizeRequired`/Java `String.trim()` 상당 로직으로 정확 replicate(BOM/U+FEFF·BE 미strip 문자 보존). key normalize 와 raw 저장 trim 분리 복제.
- **검증**: mock IT `normalize("﻿acme") === "﻿ACME"` 이고 `!== "ACME"`(strip 되돌리면 RED)·전 경로(create/update/history/delete/learn) BOM 접두 키 일치. **BE `DepositorNameNormalizerTest` 에 BOM 보존 계약 테스트 추가**(결정 재역전 방지·BE 로직 무변경).

## 2. 검증 (풀 캐논)
- **mock parity vitest**: D-01(각 status×3경로 stale genuine)·D-02(매핑·코드일치·재import 0/0)·D-04(전 경로 BOM 보존) — mock/가드 되돌리면 RED·`test.skip`/조건부 금지·skipped=0.
- **BE IT**: D-03(operationOrdinal 작업단위·다중필드·레거시 분산·동시각·반복안정)·D-04(DepositorNameNormalizerTest BOM 보존) — 실 Spring/Postgres·`--rerun-tasks` genuine. ci.yml accounting 잡 등재.
- **FE**: desktop vitest/Playwright mock — 이력 "작업 N"/세대·stale 표시 회귀. `npm run typecheck && lint && build`.
- **라이브QA**: mock OFF 실 게이트웨이 — 다세대 매핑 이력(작업 N/세대)·CODEF import matchedCount·비활성 거래처 stale 실증(#810 depositor-mapping 화면).

## 3. 워크플로우 (풀 캐논)
OPUS 기획(본 spec v2·PR #861) → CODEX SOL 기획검수(R1 BLOCKING 4→v2·재검수 GO) → CODEX LUNA 구현 → OPUS R1 5-agent+라이브QA → CODEX SOL R2(fix=LUNA) → 0수렴 → 재수렴 → PM 종합 → CI green → 머지·#832 close.

## 4. 스코프
4항목 한정. **#831**(lookup·businessNo=null 정책 대기)·BE 정규화/revision allocator 로직 변경·#810 재설계 = 밖. 항목4 BE `normalizeRequired` 무변경(mock 일치+계약테스트만).
