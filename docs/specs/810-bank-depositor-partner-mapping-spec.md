# #810 — 입출금내역 입금자명↔거래처 매핑 기억 + 자동제안 + 매핑 설정화면

- **상태**: 🟢 **구현 착수** (2026-07-17 자율) — 개발책임자 스코프 결정 **6건 전부 확정**(이슈 #810 · 2026-07-16 · 6건 모두 PM 권고 수렴). #809 완주 후 백로그 1순위.
- **연관**: 이슈 #810(개발책임자 요청·현재코드 분석 포함)·`accounting-service`(BankTransaction·DepositMatch)·`clients/desktop`
- **민감도**: 🔴 **회계(입금매칭) 도메인** — 실 입금 거래처 배정에 영향. 자율 구현보다 개발책임자 결정 확정 후 착수 권장([[feedback_integrity_domain_policy_preconfirm]]·회계 정책).

## 목표 (이슈 확인)
입출금내역에서 **입금자명↔거래처 매핑을 한 번 수동 지정하면 기억** → 같은 입금자명 재등장 시 자동 거래처. **매핑 설정 화면**에서 별도 CRUD.

## 정찰 요약 (이슈 본문 상세·3요소 모두 부재)
- 수동 지정: `BankTransactionPage` 행별 PartnerAutocomplete → `PATCH match-partner` → `bank_transaction.matched_partner_id`만 세팅(CODEF import는 항상 NULL·매 행 재지정).
- KFTC 자동매칭 `DepositMatchService.resolvePartnerForCounterparty` = 입금자명을 거래처'코드'로 간주한 **정확일치**(퍼지X·상태저장X·매실행 재계산).
- **입금자명 key 저장/제안 테이블·엔티티·로직 없음**·partner-service 별칭 없음·매핑 설정화면 없음.

## 🔑 스코프 결정 (✅ 개발책임자 확정 2026-07-16 · 6건 전부 PM 권고 수렴)

| # | 결정 | ✅ 확정 | 근거 |
|---|---|---|---|
| ① | **매핑 키 정규화** | trim + 내부 공백 1칸 축약 + 대문자화(보수적). raw+normalized 병행 저장 | 과도 정규화(괄호/특수문자 제거)는 상이 입금자 병합 위험 → 보수적 |
| ② | **자동적용 vs 제안** | **자동적용(matched_partner_id 자동 세팅)·사용자 override 항상 가능** | 이슈 의도="자동으로 그 거래처가 나오게". override 시 매핑 갱신 |
| ③ | **학습 시점** | 행 수동지정(`match-partner`) 시 매핑 **자동 upsert**(학습) | "한 번 지정하면 기억" 의도 직결 |
| ④ | **동명이인(1:N)** | 정규화명당 **최신 매핑 1건**(latest-wins). 최신 수동지정이 갱신 | 단순·예측가능. 이력은 감사로그로 보존 |
| ⑤ | **KFTC vs 매핑 우선** | **학습 매핑 우선** > KFTC 코드정확일치 폴백 | 명시적 사용자 지정 > 휴리스틱 코드추정 |
| ⑥ | **관리화면 권한/감사** | `accounting.deposit-mapping`(신규 page-code)·ACCOUNTANT/MANAGER/MASTER·BaseEntity 감사(누가/언제) | 회계 도메인 권한·감사 필수 |

## 구현안 (결정 ①~⑥ 가정·확정 후 조정)
1. **BE(accounting-service)**: `BankDepositorPartnerMapping`(BaseEntity·normalizedName 유니크·rawName·partnerId·updatedBy) + repo + Flyway V+. `BankTransactionService.matchPartner`가 매핑 upsert 동반. import/`DepositMatchService`가 매핑 우선 조회→자동 세팅. 관리 CRUD endpoint(`/accounting/deposit-mappings` GET/POST/PUT/DELETE·@RequirePermission).
2. **FE(clients/desktop)**: `BankTransactionPage` 매핑 자동 세팅 반영 + **매핑 관리 화면 신규**(입금자명↔거래처 목록 CRUD·PartnerAutocomplete).
3. **테스트+라이브 QA**: 입금자명 수동지정→재등장 시 자동 거래처 실증·관리화면 CRUD(#815/#816 패턴·실 회계 DB).

## 캐논 워크플로우 (2026-07-16 개편 반영)
**OPUS 4.8 기획**(본 spec + 조기 PR OPEN + 기획 리뷰 게시) → **CODEX SOL 5.6 기획검수**(게시) → **CODEX LUNA 5.6 구현**(게시) → **OPUS 4.8 5+agent 적대검증**(라이브QA·스샷 다수·fix·게시) ↔ **CODEX SOL 5.6 5+agent 동일**(게시) → 양측 0수렴 → PM 종합(게시) → CI green → PM 머지. PM 페이싱 조절 유지([[feedback_pm_regulate_slice_effort]]).

## ⚠️ 결정 ②(자동적용) 리스크 — 구현 필수 요건 (개발책임자 명시)
자동적용은 **잘못 학습된 매핑이 조용히 오귀속**될 수 있다(회계 입금매칭 = 실 입금 거래처 배정에 영향). 아래를 **구현 필수 요건**으로 둔다:
1. **사후 추적 가능** — 자동배정 행은 감사로그로 추적(결정 ⑥ BaseEntity 감사 + 배정 출처 기록).
2. **override 항상·즉시 가능** — 사용자가 언제든 수동 재지정(→ 매핑 갱신). 자동배정이 override 를 막지 않는다.
3. **자동배정 근거 확인 가능** — 어느 매핑이 적용됐는지 사용자가 화면에서 볼 수 있어야(예: '자동매핑' 배지/툴팁 + 적용 매핑 식별).

신규 page-code `accounting.deposit-mapping`(⑥)는 **권한 seed 동반**([[feedback_pgc_c2_widening_option_a]] Option A = seed 진실원). BaseEntity 7 audit + Soft Delete([[project_build_conventions]]).
