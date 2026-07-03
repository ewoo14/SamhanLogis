# 2026-07-03 — MIG-9 linkCash TOCTOU 소급 재검 fix (PR #712)

> E3 S2(#710, `1ee2f00c`) 머지 직후 소급 Opus full 5-agent 재검이 적발한 HIGH(시산표 잔존·linkCash 취소행 역레이스)의 fix PR. 회사PC에서 시작, 집PC에서 재검~머지 완결.

## 무엇을 고쳤나

- **linkCash 취소행 TOCTOU 가드**: MIG-9 배치의 `pendingRows` 조회와 링크 UPDATE 사이에 라이브 취소(CONFIRMED→CANCELLED)가 선커밋되면 취소행에 유령 POSTED 분개가 링크되던 레이스 — `status='CONFIRMED'` 재확인 + **version CAS**(`version=:cashVersion` + bump)를 **cash_receipts 한정**으로 추가. 0행 갱신 시 생성 분개를 같은 트랜잭션에서 보상삭제하고 skipped 처리.
- **42703 재발 방지**: `cash_disbursements` 테이블에는 status/version 컬럼이 없음 — version/status 술어를 receipts 분기에만 넣는 SQL 분기 + 부정 단언 테스트(`doesNotContain`)로 고정.
- **Mig9CashJournalLinkIT 신설**: ①실 PG 스키마 실행성 고정(양 테이블 링크 UPDATE) ②**결정적 TOCTOU 인터리빙 IT** — `@SpyBean NamedParameterJdbcTemplate` 로 pendingRows 조회 직후 별도 auto-commit 커넥션에서 CANCELLED 선커밋 주입(단일 스레드 프로그램 순서 — sleep/타이밍 비의존) → linkCash 0행 → skipped·journal_id NULL·orphan 분개/라인 0 단언. `--rerun` 3연속 통과.
- **ci.yml**: allowlist 등재(FQCN) + **skipped=0 hard-gate step**(선례 패턴 복제 — `AbstractPostgresIT` 의 Docker 미가용 silent skip 에 대한 skip-green 방어).
- **POSTED-only 스테일 문서 스윕**: report 패키지 29곳 Javadoc/`@Operation` + QA 시나리오 문서 — "POSTED 만 집계" → "POSTED+REVERSED(보상쌍 상쇄) 집계 — DRAFT 만 제외". 동계열 잔존 2곳(05-accounting-reports "역분개쌍" 신조어·integration-pr-9-slice 2.3.3) 추가 정정.

## 라운드 이력 (실행=게시 1:1)

1. 소급 Opus full 5-agent 재검(회사PC) → HIGH 적발 → fix 착수(PR 분리)
2. Opus 라운드 fix — version bump receipts 한정(42703 해소)·LinkIT 신설
3. Codex 5-agent 라운드 — version CAS 강화(Codex 직접)
4. **[집PC] Opus full 5-agent 재검** — FE 0 / BE MED1·nit3 / Design MED1·LOW1 / **DevOps HIGH1**(LinkIT hard-gate step 누락 + 선행 게시의 "hard-gate 등재" 주장이 실물과 불일치했음을 적발·기록 정정) / QA 0(targeted 24/24·라이브 왕복 GUI 7캡처·시산표 상쇄 실측)
5. Opus fix(`771ccc8d4`) — hard-gate step·결정적 인터리빙 IT(백로그 아닌 구현 성공)·용어 2곳·nit 3
6. **Codex full 5-agent 재검** — FE LOW1 / BE 0 / Design 0 / DevOps 0 / QA 0 + 라이브 GUI 재캡처 3장 → **blocking 0수렴**

검증: accounting-service 모듈 전체 **150 suites / 1,067 tests / 0 fail**(ignored 10 = 이카운트 raw fixture 게이트 — diff 무관·집PC 미보유 환경 게이트, 변경 영역 skip 0).

## backlog (명시 disposition)

- [LOW] `clients/desktop/src/renderer/api/mock.ts` 시산표 fixture 주석 "POSTED 분개" 스테일 + REVERSED 보상쌍 fixture 부재 → **E3 S4(FE 화면 슬라이스)** 의 mock 정비와 함께 처리.
- disbursement 경로 TOCTOU 미커버 = **의도적 공백**(REST/GUI 부재·status/version 컬럼 없음 — Codex QA 재검 판정). 기존 backlog "CASH_DISBURSEMENT 라이브화 시 reverse 가드"와 함께 라이브화 시점 재평가.
- `docs/manual/03-회계/01-분개-입력.md` VOID 용어 스테일(REVERSED 이전 구모델 서술) — 별계열 문서 스윕 후보.
- `clients/desktop/src/renderer/api/accounting.ts:70` "BE 가 캐시" Javadoc 표현 부정확(실제 라이브 reduce) — pre-existing, 후속 정정.

## 교훈

- **게시 주장 ≠ 실물**: 선행 라운드 게시가 "ci.yml hard-gate 등재"라 기록했으나 실물 diff 는 allowlist 1줄뿐이었고, 후속 두 라운드가 그 주장을 그대로 재확인 통과시킴 — fresh 재검이 실물 대조로 적발. 라운드 게시 시 "주장 문구 = 실물 diff" 대조를 게이트에 포함할 것.
- 결정적 인터리빙 재현(@SpyBean 프로그램 순서 주입)은 TOCTOU 계열 fix 의 표준 잠금 수단으로 재사용 가치 높음.
