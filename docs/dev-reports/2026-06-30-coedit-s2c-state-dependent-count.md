# 코-에디팅 S2c — 상태의존 수정 카운트 (dev-report)

> 2026-06-30. 라이브 코-에디팅 에픽(#16) S2c. PR #676. spec `docs/superpowers/specs/2026-06-30-coedit-s2c-state-dependent-count-design.md` · plan `docs/superpowers/plans/2026-06-30-coedit-s2c-state-dependent-count.md`.

## 목적
사용자 노출 **"전표수정내역"**(`SlipResponse.editHistoryCount`, SalesQueryPage 컬럼)을 상태의존으로 게이트. 작성자 드래프트 단계 편집은 카운트하지 않고, 전표가 확정/이관된 後 편집만 센다. 감사 로그(S2b `slip_revisions`)는 모든 편집을 첫 작성부터 계속 보존 — S2c는 **표시 카운트만** 게이트한다.

## 확정 룰 (개발책임자)
| 전표 | 카운트 시작 임계 | 코드 전이 |
|---|---|---|
| 판매전표(OUTBOUND) | 작성완료·**창고이관**(재고차감) 後 | `inspect()` = INSPECTING→COMPLETED |
| 그 외(비-OUTBOUND, INBOUND) | 작성완료 後 **다음 결재선** | `send()` = SAVED→SENT |

## 설계 — baseline 컬럼
`revisionCount`(=audit revisionNo)는 불변. 신규 `slips.revision_count_baseline`(Flyway V53)에 **임계 전이 시점 revisionCount 스냅샷**.
- `editHistoryCount = baseline == null ? 0 : max(0, revisionCount - baseline)`.
- 편집 경로(overlay/batch/PUT)·audit·S2b 로그 **무변경** — 게이트는 순수 표시 계산.

## 구현 (함수 단위)
- `Slip.captureRevisionBaselineIfAbsent()` — 임계 전이 시 1회·idempotent baseline 기록.
- `Slip.editHistoryCount()` — 상태의존 표시 카운트.
- `Slip.send()`/`inspect()` — 타입 가드로 baseline 캡처(비-OUTBOUND send / OUTBOUND inspect).
- `SlipResponse.from()` — raw revisionCount → `slip.editHistoryCount()`.
- V53 — 컬럼 ADD + 기존 임계통과 전표 `baseline=0` backfill.
- FE `mock.ts` — editHistoryCount 룰 반영(임계前 0 / 임계後 N), `mock.test.ts` 양방향 계약테스트.

## 테스트
- 단위: `SlipDomainTest`(31/31 — baseline 캡처·editHistoryCount·idempotent), `SlipResponseTest`(상태의존 배선).
- 실 DB IT: `SlipQueryRedesignIT` TC-6(OUTBOUND)/TC-7(INBOUND) — 드래프트 편집→0, 임계 後 편집→N (Testcontainers, CI Linux 실행).
- FE: `mock.test.ts` 양방향, Playwright sales-query.
- 마이그: fresh Postgres V53 probe(backfill 임계통과만 baseline=0 확인).

## ⚠️ 알려진 트레이드오프 / 비목표
- **backfill 신/구 불연속**(spec §3.4): 기존 임계통과 전표는 baseline=0 → editHistoryCount=revisionCount(드래프트 편집 포함, 현 표시 보존). 신규 전표는 임계 後 편집만. 동일 성격 전표가 V53 전/후 생성에 따라 카운트 산정이 다름(영구). 과거 baseline 복원 불가에 따른 의도된 단순화 — 상세 이력은 S2b 버전로그에 전부 보존.
- **INBOUND(SENT 임계)는 BE·mock 구현됐으나 화면 미노출**: `PurchaseQueryPage`에 전표수정내역 컬럼 부재. 룰은 forward-compatible(컬럼 추가 시 즉시 동작), 현재 라이브 화면 QA는 판매조회(OUTBOUND)만 가능. 컬럼 노출은 개발책임자 결정 대기.
- REJECTED/CANCELED 종결 전표의 신/구 카운트 경미 불일치(저노출).
- **복원=카운트(D-COEDIT-S2C 검토가능)**: 임계 통과 후 버전 복원은 사용자 관점의 수정으로 보아 `revisionCount`를 1회 증가시킨다. 복원 이력은 `slip_revisions` RESTORE 행으로 남고, `slip_audit_logs`에는 빈 revisionNo 행을 만들지 않아 audit timeline 표시에는 영향이 없다.

## 듀얼리뷰
Opus 5-agent(BE/FE/Design/DevOps/QA) ↔ Codex 5-agent 순차 0수렴. BE=baseline 계열 완전성 실증(seeder transition chain·restore 비복원·우회 status mutation 없음), DevOps=ci.yml 신규 테스트 3종 CI 커버 실증(XML), FE=mock 24/24 정합. 라이브 QA=slip-service 재빌드 + 실 DB V53 검증 + 전표수정내역 컬럼 0/N건 캡처.
