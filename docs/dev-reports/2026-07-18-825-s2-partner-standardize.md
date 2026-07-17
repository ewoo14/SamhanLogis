# #825 슬2 — 거래처 입력 표준화 + ACCOUNTANT lookup 계약 (dev-report)

- 기준일: 2026-07-18
- PR: #835 · 브랜치 `feat/825-s2-partner-standardize` → main
- 에픽: #825 전역 입력 UX (슬2/7)
- spec: `docs/specs/825-s2-partner-standardize-spec.md` · 진실원: 슬1 감사표(`2026-07-17-825-s1-…audit.md`)

## 스코프 (6요소)

| # | 요소 | 결과 |
|---|---|---|
| ① BE | ACCOUNTANT `partners.search` VIEW 복구 | **V88**(그룹104 단일·VIEW-only·override-aware materialize·4테이블) + `AuthFlywayV88SeedIT`(행동 IT) + ci.yml hard gate. FE 무변경 |
| ② FE (ii) 통일 | CollectionPlan·NotesReceivable·JournalStatusReport (5인스턴스) | 원시 `AsyncAutocomplete<JournalStatusPartnerOption>` → `PartnerAutocomplete`(④하이라이트 자동)·`searchJournalStatusPartners`+DTO 삭제·`partnerApi.searchPartners` 통일 |
| ③ FE (iii) 전환 | DailyClosing(execPartner)·BlockedPartners(partnerCode) | plain input → PartnerAutocomplete. DailyClosing optional+해제 버튼·draft 가드 / BlockedPartners required·비ACTIVE·draft 가드 |
| ④ FE (iii)* | DocumentReferencePicker | 하이라이트만(PARTNER_LEDGER·resolvedQuery·matchMark AA)·저장계약/딥링크 불변 |
| ⑤ FE/BE | TaxInvoice partnerId+partnerCode 무결성 | FE `partnerId`/`partnerCode` 분리 전송(검색소스 partnerApi 교체·L6/M4 해소)·BE `updateBasic(partnerId, partnerCode)` 편집 반영(CH1/CM-a)·partnerCode VARCHAR(100) 계약(#1) |
| ⑥ (i) 무변경 | BankTransaction·DepositorMapping·EstimateForm | 이미 PartnerAutocomplete → ④자동. 라이브 QA 확인 |

## 근본원인 (BE)
ACCOUNTANT `partners.search` 403 = seed 결손 1곳(원 seed V34가 MASTER/MANAGER/SALES만 부여·CROSS JOIN이 ACCOUNTANT view=FALSE 생성·전 체인 전파). 정공법 = 신규 V88 surgical grant(override 최우선 보존·다중그룹 OR·master 제외). widening=Option A parity(MANAGER/SALES 동일·노출면 IT 문서화).

## 개발책임자 결정
- D-S2-01 DocumentReferencePicker=하이라이트만 · D-S2-02 TaxInvoice=슬2 fix 완결 · D-S2-03 activeOnly(등록/DailyClosing/TaxInvoice=ACTIVE·필터/BlockedPartners=전체) · D-S2-04 ACCOUNTANT Option A parity widening
- 재수렴 바운드: CH1(TaxInvoice partnerId BE) fix · CM-a(partnerCode) fix · 잔여 narrow 엣지 후속 분리

## 워크플로우 (캐논 전수)
OPUS 기획 → CODEX SOL 기획검수(6 BLOCKING) → CODEX LUNA 구현 → **OPUS 4.8 5-agent 적대검증 + 라이브 QA** → **CODEX SOL 5.6 5-agent 적대검증** → 3회 머지 전 재수렴(OPUS+CODEX) → 0수렴(fix 신규 HIGH/MED 0·양 모델 일치) → PM 종합 → CI green → 머지. 실행=게시(PR #835 전 단계 코멘트).

## 검증 (genuine)
- **BE**: V88 IT 4/0/0·TaxInvoice 91 tests 0/0·accounting 모듈 1284 tests 0 fail(`--rerun-tasks --no-build-cache`)·fresh Postgres probe(partner_code varchar 100)
- **FE**: DS vitest·desktop typecheck 0·vitest 836·Playwright **ac-2/3/4 24/24**(신규 ac-4=통일 5화면 회귀 게이트·activeOnly 차등·mutation-probe RED 실증)
- **라이브 QA**: 실 :8080·mock OFF·**dev_accountant(ACCOUNTANT) partners.search 403→200 실증**+통일 4화면 ④하이라이트(mark=4)+BlockedPartners 전환 (8스샷·`docs/qa/825-s2-partner-standardize/`)
- **CI**: exact SHA green(CI·QA E2E·arologis)

## 후속 바운드 이슈
- #834 DS AsyncAutocomplete debounce/a11y pre-existing LOW
- #836 PartnersPage V88 위드닝 후 신규등록/행클릭 403 UX
- #837 DocumentReferencePicker pre-existing 상태머신(seq 가드·디바운스 stale)
- #838 세금계산서 동일명 P1→P2 audit 누락
- #839 partner_code VARCHAR(50)/@Size(50) 전수 정합 100 (defect-family)
- #840 autocomplete selection-confirmed 계약(동명 거래처 draft 가드 우회)

## 핵심 교훈
- **머지 전 재수렴 의무**([[feedback_reconvergence_before_merge]]) — 슬1 교훈 적용. 3회 재수렴으로 fix가 낳은 신규 결함(AA·autoFocus·ac-4 갭)·pre-existing residual(partnerCode 길이·동명 가드) 포착·바운드.
- **2-model 재수렴 가치** — OPUS "수렴" 판정을 CODEX가 반복 반증(partnerCode 길이·CM-b 빈draft·동명 우회). 독립 2nd-model이 실엣지 포착.
- **design-system 변경=Playwright mock 스위트**([[feedback_design_system_playwright_mock_suite]]) — ac-4 신설로 통일 5화면 회귀 게이트 확보.
