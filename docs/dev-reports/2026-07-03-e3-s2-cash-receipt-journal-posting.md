# E3 입금보고서 S2 — 라이브 POSTED 분개+역분개 (confirm 배선·수정 재게시·aging refresh)

**PR #710** · 2026-07-03 · accounting-service + clients/desktop(원장 UX·mock parity) · V50/V51/V52

## 목표
S1(#709) 배선점에 원장 게시 연결 — 확정 시 POSTED 분개 자동 게시, 취소/수정 시 역분개(+재게시), 거래처 aging 반영. 통장연계=S3·FE 화면=S4.

## 결정 (D-E3-02 계열)
- **D-E3-02 기본 차변 계정 = 102(보통예금)**: 확정 결정문의 "(103)"은 DepositMatchService 잘못된 주석발 오기 — 실 계정과목표(V1 시드)는 102=보통예금·103=당좌예금. 의미(보통예금) 기준 102 적용, V51 로 기본값+미게시 backfill 정정(분개 연결 행은 preflight abort 로 감사 보호). Mig9·DepositMatch 계정 해석을 `CashReceipt.DEFAULT_*` 단일원으로 통일.
- **D-E3-03 보상분개 상쇄 집계**: 원장 정정 모델=보상분개(원분개 REVERSED 마킹+swap 역분개 POSTED)이므로 **잔액 집계는 POSTED+REVERSED 동시 포함**이어야 쌍이 자체 상쇄되어 정확 — V52(partner_aging_snapshot 재정의)+JournalLineRepository 리포트 쿼리 17개+시산표/합계잔액시산표 소비처까지 전층 통일. total_*(gross)=원장 유량 의미(취소 왕복 포함) — "유효 발생분만" 축소는 별도 결정 대상.
- **D-E3-04 CONFIRMED 수정 = 역분개+재게시**: PATCH 상태분기(DRAFT=단순수정/CONFIRMED=autoReverse 후 신규 POSTED/CANCELLED=409). 무변경 요청=재게시 생략(원장 노이즈 차단). 재게시 적요="입금보고서 수정 재게시"로 최초 확정과 구분.
- **D-E3-05 마감·원천 가드**: confirm/재게시에 마감기간 409(수기 분개와 동일 규칙, cancel 역분개는 기존 정책대로 허용). REST `/journals/{id}/reverse` 는 CASH_RECEIPT 분개 409(원천 문서 경유 강제 — receipt 영구 stuck 방지), FE 는 비활성 안내+캡션.
- 감사 체인: 역분개 적요="[역분개] {원 전표번호} {적요}" — MIG 원분개(적요=memo)도 화면 텍스트만으로 체인 재구성. memo 494자 제한(역분개 prefix 여유)+공통 클램프.

## 구현 (Codex — 커밋 `85790107`)
confirm→`postAutoJournal(CASH_RECEIPT, 차 debit/대 credit 선택계정)`+`linkJournal`(재확정 409) / cancel→`autoReverse`+`linkReverseJournal`(V50) / CONFIRMED PATCH→역분개+재게시 / afterCommit aging refresh / X-User-Id actor 전파 / `reverseJournalNo` 문자열 노출(UUID 비노출).

## 순차 듀얼리뷰 5라운드 (0수렴 — 병렬 0·매 라운드 게시)
| 라운드 | 커밋 | 핵심 적발 |
|---|---|---|
| PM 개발검증 | (85790107 내) | **102/103 계정 오기** — 실 시드 대조로 적발, Codex 교정 |
| Opus 5-agent R1 | `94cecdbc` | **B**: CI RED(테스트 오기 409→404)·**aging refresh 100% 무동작**(afterCommit×NEVER — 라이브 로그+MV 6주 stale 실증, IT 는 @MockBean false-green) **H**: **V52**(MV 가 POSTED만 집계→취소마다 ±A 오염)·Mig9 취소행 유령분개. MED: 마감가드·memo 경계·reverse stuck·무변경 노이즈·(미조회) 각인 등 |
| Codex 5-agent R1 | `9d6bbb85` | **B**: linkCash 레이스 orphan(보상삭제) **H**: ON CONFLICT 멱등 skip 파손·**리포트 쿼리 17개 P+R 통일**(MV 만 고치면 리포트와 불일치)·FE 역분개 버튼 CASH_RECEIPT 차단. V51 preflight(연결 103 감사보호)·V52 lock_timeout |
| Opus 재검 5-agent | `09fd9ef5` | **B**: **시산표·합계잔액시산표 POSTED-only 잔존**(파라미터형 쿼리 소비처 누락 — 한 응답 내 기준 혼합) **H**: 리포트 통일 테스트 무고정(리버트 false-green) → 역분개쌍 시드 report IT 로 고정. 감사체인 적요·API 명세(confirm 422 과잉/400 누락)·mock parity·관측성 WARN 등 14건. **fix 실행=Codex 위임** |
| Codex 재검 | `a39e77d5` | **0 판정**(5차원 잔여 0) + mock reverse 409 오배치 자체 수정 |

## 검증 (전부 실측)
- **BE 1064 tests 0 fail(실 IT)** — 🔑 회사PC Testcontainers skip **근본 규명+우회**(Docker 29.x 가 구 docker-java API 거부 → `DOCKER_HOST=npipe:////./pipe/dockerDesktopLinuxEngine`+`~/.docker-java.properties` api.version=1.44) 로 349 skip→2(Mig5 fixture 조건부). FE vitest **515**·typecheck.
- **라이브 QA**(실 게이트웨이 :8080·dev_master·mock OFF): 분개 체인 GUI 4캡처(docs/qa/e3-s2-cash-receipt-journal/ — 역분개 필터 목록·재게시 101/180,000·취소 역분개+안내 캡션 실렌더·원분개 무수정)·**aging 결함 실증→fix 후 MV 전진+상쇄 수학 실측**(net_cash=확정분만·취소 왕복 자체상쇄)·fresh PG V1→V52 probe·real-qa 스펙 `e3-s2-cash-receipt-journal-real-qa`(차단버튼 단언 포함 1 passed).
- 라이브 QA 가 **stale 컨테이너 2건**(partner 6/19·auth V78) 적발→재빌드 정합(partner 표시필드·V79/V80 시드).

## 교훈 (메모리 박제)
- 미머지 브랜치 마이그의 리뷰단계 수정 시 로컬 재적용 = **해당 버전 이후 전부** history 삭제 후 순서 재적용(V51 단독 삭제→out-of-order validate 부팅 실패 실측) → [[feedback_applied_migration_immutable]] 보강.
- Testcontainers 회사PC 우회법 → [[feedback_testcontainers_windows_docker]] 갱신.
- 내부 로직 @MockBean = mock-green/live-red 은폐(aging refresh) — 실 빈+실효 단언으로 전환.

## backlog (비차단)
분개장 목록 `page:0` 고정(최신 분개 GUI 미노출 — pre-existing, 라이브 분개 시대 시급도↑)·**로컬 dev 시드 중복(구 J- 형식 5쌍, 5/12 적재분) 정리 — 개발책임자 승인 대기**·TaxInvoice DTO journalId/reverseJournalId UUID 원시 노출·SLIP 분개 직접 reverse 동종 stuck(TaxInvoice 계열)·journal_lines.account_code VARCHAR(6) 폭·KFTC_DEPOSIT FE sourceType union·Phase11 rolling 구코드 103 재유입 체크리스트·aging refresh coalesce/@Async·gross 유효발생분 축소 여부(개발책임자 결정 대상)·CASH_DISBURSEMENT 라이브화 시 동종 reverse 가드·V51 preflight 발동 runbook 문단·MIG-9 보상 카운트 별도 상태(COMPENSATED) 분리.
