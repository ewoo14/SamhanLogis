# #832 — #810 mock parity·감사 이력 정밀도 잔여 (기획 spec v1)

> OPUS 기획 · 백로그 번다운(B2-FE 잔여). #810 R3 적대검증(CODEX SOL) 발견 → 개발책임자 결정 A(핵심 fix·엣지 후속분리). **교차검증**([[feedback_spec_cross_check_prior_decisions]]·[[project_pending_decisions_2026_07_19]]): 항목4 BOM = **개발책임자 결정 "BE 보존 유지 + mock을 BE에 일치"**·항목1~3 PM 자율. 정책 블로커 없음.

## 0. 성격·범위
- mock parity(테스트 품질·vitest false-green 제거)·감사 표시 정밀도. **사용자 데이터 오염 아님**(fail-safe·BE ITs·라이브QA 이미 genuine 검증). #810 핵심은 이미 머지됨.
- 4항목: [1][2][4] = FE mock(`clients/desktop/src/renderer/api/mock.ts`) · [3] = BE(accounting) + FE 표시.

## 1. 결정

### D-832-01 (항목1) mock 거래처 status hydration
`mock.ts` `normalizeAdminPartner`(:502 `status ?? 'ACTIVE'`·`isDeleted`)는 존재하나, **입금자명 매핑 자동매칭·stale 집계 경로**가 거래처 SUSPENDED/TERMINATED/삭제를 반영 안 하고 항상 ACTIVE/staleTarget=false 로 취급 → FE stale/UNAVAILABLE 로직이 vitest 에서 false-green(BE ITs·라이브QA 는 실 status 로 genuine).
- **fix**: mock 거래처 조회(mockPartnerByCode 등)에 `status`/`isDeleted` 실 반영 → 입금자명 자동매칭은 **ACTIVE 만** 성립·비ACTIVE(SUSPENDED/TERMINATED/삭제)는 stale 대상 집계(`staleSkippedCount`/`staleNormalizedNames` 등 실 반영). 실 BE `DepositorMappingService`/`bank-transactions` 자동매칭·stale 계약과 일치.
- **검증**: vitest 에서 비ACTIVE 거래처 매핑 시 stale/UNAVAILABLE 경로가 실제 활성(mock을 항상-ACTIVE 로 되돌리면 RED).

### D-832-02 (항목2) mock CODEF matchedCount 실계산
`mock.ts` CODEF import result 가 `matchedCount: 0` 하드코딩 → 매핑 적중해도 요약 "자동매칭 0건".
- **fix**: import 된 행 중 **실 신규매칭 수**(입금자명 매핑 적중으로 matchStatus/ matchedPartner* 채워진 신규 행) 계산해 `matchedCount` 반환. 실 BE CODEF import 응답 계약과 일치.
- **검증**: 매핑 적중 행 포함 import 시 `matchedCount>0`(하드코딩 0 으로 되돌리면 RED).

### D-832-03 (항목3) 감사 이력 operation ordinal / 세대 라벨
`DepositorMappingService.history`(:234)가 entity-local revisionNo 를 합쳐(삭제+재생성 신·구 매핑) 동일 **#1 반복** → 사용자에게 회차 혼동.
- **fix(BE)**: `history()`/`toHistory` 가 결합된 전 이력 행을 **시간순(changedAt·revisionNo tiebreak) operation ordinal**(1..N 전역 채번) + **세대 라벨**(entityId 별 최초등장 시간순 1세대/2세대…) 제공. `BankDepositorPartnerMappingHistoryResponse` DTO 에 `operationOrdinal`·`generation`(또는 동등) 추가.
- **fix(FE)**: 이력 표시를 entity-local revisionNo 대신 **"작업 N"**(operationOrdinal) + 세대 구분 표기. #810 이력 모달/패널.
- **검증**: 삭제+재생성(2세대·각 revisionNo 1) 이력에서 operationOrdinal 이 1,2,3… 유일·세대 라벨 구분(IT: 실 audit log 다세대 시드→ordinal 유일성·시간순). FE 표시 "작업 N" 회귀.
- ⚠️ **스코프 확장 인지**([[feedback_expanded_scope_reinstate_review]]): 항목3 = BE(accounting) + DTO + FE — mock 아닌 실 코드. 본 슬라이스 풀 캐논 R1/R2 가 커버.

### D-832-04 (항목4) mock 입금자명 정규화 = BE 일치 (BOM 보존·개발책임자 결정)
`mock.ts` `mockDepositorNameNormalize`(:16886 `replace(/[\s-]+/gu,' ').trim().toUpperCase()`)의 `\s`(**U+FEFF 포함**)+`trim()`이 BOM 을 strip → mock 은 BOM 제거 vs BE `normalizeRequired`는 **보존** → 매핑 적중 상이(vitest divergence).
- **fix(개발책임자 결정: BE 보존 유지·mock을 BE에 일치)**: `mockDepositorNameNormalize`(+ create/update 경로 `rawNameInput.trim()`)를 **BE `DepositorMappingService.normalizeRequired` 실 로직과 정확 replicate**(BOM/U+FEFF 보존·BE 가 strip 하지 않는 문자 mock 도 보존). **BE 무변경**(BE 가 진실원).
- **검증**: BOM 접두 입금자명이 mock·BE 동일 정규화 키 산출(mock IT: BOM 포함/미포함 키 일치성이 BE 계약과 부합·BOM strip 으로 되돌리면 RED).

## 2. 검증 (풀 캐논)
- **mock parity vitest**: 항목1(비ACTIVE stale genuine)·항목2(matchedCount 실계산)·항목4(BOM 보존 parity) — 각 mock 되돌리면 RED·`test.skip`/조건부 금지·skipped=0.
- **BE IT(항목3)**: 다세대 audit log 시드→operationOrdinal 유일·시간순·세대 라벨(실 Spring/Postgres·`--rerun-tasks` genuine). ci.yml accounting 잡 등재.
- **FE 표시(항목3)**: desktop vitest/Playwright mock — 이력 "작업 N"·세대 표기 회귀. `npm run typecheck && lint && build`.
- **라이브QA**: mock OFF 실 게이트웨이 — 입금자명 매핑 이력(다세대 시 작업 N·세대)·CODEF import matchedCount·비ACTIVE 거래처 stale 실서버 실증(#810 depositor-mapping 화면).

## 3. 워크플로우 (풀 캐논)
OPUS 기획(본 spec·조기 PR) → CODEX SOL 기획검수 → CODEX LUNA 구현 → OPUS R1 5-agent+라이브QA → CODEX SOL R2(fix=LUNA) → 0수렴 → 재수렴 → PM 종합 → CI green → 머지·#832 close.

## 4. 스코프
4항목(mock status hydration·CODEF matchedCount·감사이력 ordinal/세대·mock BOM=BE 일치) 한정. **#831**(lookup UNAVAILABLE→NOT_FOUND·⚠️businessNo=null 정책 대기)·BE 정규화 로직 변경·#810 핵심 재설계 = 밖. 항목4 BE normalizeRequired **무변경**(mock 만 일치).
