# #810 입금자명↔거래처 자동 매핑 (bank depositor → partner mapping)

- **PR**: #829 · **에픽**: 회계 H(입금/통장거래) · **일자**: 2026-07-17
- **상태**: ✅ 구현·3라운드 적대검증·라이브QA 완료 (개발책임자 결정 A 수렴)
- **spec**: [docs/specs/810-bank-depositor-partner-mapping-spec.md](../specs/810-bank-depositor-partner-mapping-spec.md)

## 1. 개요

통장거래(입금)의 입금자명을 거래처에 **한 번 지정하면 기억**하여, 이후 동일 입금자명이 들어오면 자동으로 그 거래처에 매칭한다. "홍길동" 입금을 삼한상사로 한 번 배정하면, 다음 "홍길동" 입금은 자동 배정.

## 2. 도메인 설계

- **엔티티** `BankDepositorPartnerMapping` (BaseEntity 7 audit + Soft Delete) — `normalizedName`(정규화 입금자명) 단위 유일 매핑. `UNIQUE(normalized_name) WHERE NOT is_deleted` partial unique + `INSERT ... ON CONFLICT` 원자 upsert.
- **정규화** `DepositorNameNormalizer` — trim + 공백 1칸 축약 + `Locale.ROOT` 대문자 (NFKC/특수문자 제거 없음). 단일 진실원.
- **provenance** — `bank_transaction`에 `partner_match_source`(MANUAL/DEPOSITOR_MAPPING/PARTNER_CODE_EXACT) + `matched_mapping_id` + snapshot(`matched_mapping_raw_name/normalized_name`) + `partner_matched_at/by`. 행 단위 매칭 근거 보존.
- **학습 = 인간기원만** — 수동 매칭(match-partner)·관리 CRUD에서만 매핑 학습(upsert). import/CODEF/KFTC resolver는 read-only(자기강화 루프 차단). 입금(DEPOSIT)+입금성 source 한정.
- **자동적용 경로별** — CSV/CODEF 입금(매핑 우선) · KFTC 분개후보(evidence). 우선순위: 활성 매핑 > partnerCode 정확일치 > 미매칭. stale(삭제/비활성 거래처) 시 코드일치 폴백 없이 미매칭+경고.
- **권한 이중경로** — 단건 배정 = `accounting.bank-matching:UPDATE` · 매핑 학습/삭제 = `accounting.deposit-mapping:UPDATE/DELETE` 보유 시. SYSTEM MASTER는 내부 게이트 bypass(게이트웨이 JWT `X-Is-System-Master` 단일권위).
- **감사** — append-only, 변경분만(값 동등 제외), 작업당 단일 timestamp, entityId 기준 전 필드 이력(rename 연속성), opaque entryKey.

## 3. 마이그레이션 (V57~V60)

| V | 내용 |
|---|---|
| V57 | mapping 테이블 + bank_transaction provenance 컬럼 + CHECK + 기존 matched 행 MANUAL backfill |
| V58 | provenance snapshot CHECK(1차) |
| V59 | snapshot CHECK NULL-safe 재작성 + `partner_code` snapshot 컬럼(stale 삭제 감사 보존) |
| V60 | snapshot CHECK를 NULL-safe **CASE** 식으로 완결(양방향 불변식·고아행 거부) |

## 4. 적대검증 여정 (표준 워크플로우 · 라운드별)

| 라운드 | 모델 | 결함 | 성격 |
|---|---|---|---|
| R1 | OPUS 4.8 6렌즈 | 22 (H4·M9·L9) | 신규 기능 결함(권한게이트·stale·이력·learn한정) |
| R2 | CODEX SOL 5세션 | 22 (H7·M10·L5) | R1 fix 회귀 다수(MASTER 권한상실·transient stale·V58 CHECK) → **비수렴 보고** |
| R3 | OPUS 5렌즈 + CODEX 5세션 | OPUS 11(H0) + CODEX ~14(거래유실 회귀) | resilience/엣지 정제 + fix가 회귀(거래유실) |

### 핵심 fix 계보
- 권한: clear-and-delete 서버 게이트 → MASTER-aware(내부 dynamicPermissionClient가 MASTER 미반영 회귀 해소).
- stale/lookup: 존재만 검사 → PartnerStatus 활성검증 → lookup FOUND/NOT_FOUND/**UNAVAILABLE** 3분류 전 경로 sweep(일시장애 stale 오염 차단).
- **거래유실(R3-OPUS fix 회귀)**: UNAVAILABLE 행격리가 거래 자체를 미저장 → **UNMATCHED로 영속화·매칭만 보류**로 수정(왕복 IT 검증).
- 이력: 정규화명 행만 반환 → entityId 전 필드 + 시간순 정렬 + 단일 timestamp + entryKey.
- 마이그: V58→V59→V60 CHECK 3회 반복 끝에 NULL-safe CASE로 완결.
- 동시성: normalized key advisory lock 대칭(create/update/delete/learn) + 64bit hashtextextended 정렬획득(32bit hashtext 데드락 psql 실재현 해소).

### 개발책임자 결정
- **결정 B** (R2 비수렴): "R2 fix 완주 후 정식 R3 한 라운드 더".
- **결정 A** (R3 비수렴): "거래유실+#810 핵심 fix→포커스 재검증→머지, 엣지는 후속분리". **인위 bound로 수렴**(핵심 견고·엣지는 fail-safe/pre-existing/test-parity).

## 5. 최종 검증

- **genuine** (`--rerun-tasks --no-build-cache`): accounting+auth **1653 tests / 0 fail / 0 error** (skip 10 = 기존 Ecount/마이그 픽스처, 무관). DepositMatchShellIT 11 tests(unavailableSkippedCount 집계). MASTER 실HTTP·V60 CHECK probe·거래유실 왕복·데드락 정렬획득·권한 enforcement 실HTTP IT 포함.
- **FE**: typecheck 0(node+web) · vitest 113 files/810 pass.
- **라이브QA** (실 게이트웨이 :8080·mock OFF·**V60 실 적용**·dev_master MASTER): 관리화면 CRUD·이력(회차·한국어 라벨·거래처변경·변경분만·단일 timestamp·entryKey)·배지(수동/자동) 실 렌더. `docs/qa/810-depositor-mapping/`.

## 6. 후속 이슈 (개발책임자 결정 A로 분리)

- **#830** — 감사 revision 채번 멀티인스턴스 안전화(AtomicInteger·공유 인프라·단일인스턴스 무위험).
- **#831** — partner lookup UNAVAILABLE→NOT_FOUND 붕괴 계열 sweep(pre-#810 회계 도메인 10곳·**tax invoice businessNo=null 확정 HIGH 포함·우선순위 주목**).
- **#832** — mock 거래처 status hydration·mock matchedCount·이력 세대 라벨·BOM 정규화 divergence(test-parity·표시 정밀도).

## 7. 교훈

- **2라운드 캐논의 가치**: OPUS 라운드+라이브QA가 놓친 MASTER 권한상실·거래유실을 CODEX 독립검증이 포착.
- **fix가 회귀를 낳는 사이클**: resilience/엣지가 깊은 슬라이스는 fix가 새 결함을 낳음(V58→V60 CHECK 3회, lookup fix→거래유실). PM이 **비수렴을 조기 보고**하고 개발책임자 바운드(결정 A) 후 수렴 — 무한 iterate 방지 ([[feedback_pm_regulate_slice_effort]]).
- **identity 헤더 신뢰경계**: MASTER-aware 내부 게이트가 게이트웨이 단일권위(remove-then-set) 재사용이라 안전(공격표면 확장 0) — R3에서 확증.
- **defect-family sweep**: lookup 3분류를 일부 경로만 적용하면 잔여(matchPartner·toResponse) 붕괴 — 전 경로 sweep 필수.
