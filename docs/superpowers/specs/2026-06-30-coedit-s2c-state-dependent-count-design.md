# 협업 코-에디팅 S2c — 상태의존 수정 카운트 설계

> 2026-06-30. 라이브 코-에디팅 에픽(#16) S2c. 개발책임자 확정 룰 + PM 자율 설계.
> 선행: S2b(#675 머지, 문서전역 수정/버전 로그) — 모든 편집을 `slip_revisions`에 첫 작성부터 기록. **S2c는 사용자 노출 "수정 카운트"(`editHistoryCount`)의 증가를 상태의존으로 게이트한다.**

## 1. 목표 / 확정 룰 (개발책임자)

사용자가 보는 **"전표수정내역"**(`editHistoryCount`, SalesQueryPage 컬럼 — "0" / "N건")은 **전표가 작성자의 드래프트 단계를 벗어나 확정/핸드오프된 後의 편집만** 세어야 한다. 그 전(드래프트) 편집은 S2b 버전로그에는 남되 카운트에는 반영하지 않는다.

| 전표 타입 | 카운트 시작 임계 | 코드 매핑 |
|---|---|---|
| **판매전표 (OUTBOUND)** | 작성완료·**창고이관**(재고차감) 後 | `complete()` 전이 = **COMPLETED** (InventoryClient.deduct 발생 시점) |
| **그 외 전표 (비-OUTBOUND: INBOUND 등)** | 작성완료 後 **다음 결재선으로 넘어가면** | `send()` 전이 = **SENT** (SAVED→SENT, 다음 결재선 핸드오프) |

임계 前(OUTBOUND: DRAFT~INSPECTING / 비-OUTBOUND: DRAFT·SAVED) 편집 = 카운트 X. 임계 後 편집 = 카운트 O.

## 2. 핵심 기술 제약 — `revisionCount` 이중 역할

현재 `slip.revisionCount`는 두 역할을 겸한다:
1. **audit 로그 `revisionNo`** — `SlipAuditLogService`가 `slip.incrementRevision()` 반환값을 `slip_audit_logs.revision_no`로 사용. 편집마다 +1, 감사 타임라인 그룹핑 키.
2. **사용자 노출 `editHistoryCount`** — `SlipResponse.editHistoryCount = revisionCount`.

→ `incrementRevision()` 자체를 게이트하면 **audit revisionNo가 멈춰 감사 타임라인이 깨진다.** 따라서 **revisionCount(=audit revisionNo)는 불변 유지**하고, 표시용 카운트만 별도 게이트한다.

## 3. 채택 설계 — baseline(기준선) 컬럼

### 3.1 스키마 (Flyway V53, slip_db)
- `slips.revision_count_baseline INTEGER NULL` 신규 컬럼.
- 의미: **임계 전이 시점의 `revision_count` 스냅샷**. null = 아직 임계 미통과(드래프트).

### 3.2 baseline 세팅 (도메인, 1회·idempotent)
- **OUTBOUND**: `complete()`(→COMPLETED) 안에서 `if (revisionCountBaseline == null) revisionCountBaseline = revisionCount;`
- **비-OUTBOUND**: `send()`(→SENT) 안에서 동일 조건 세팅.
- 타입-부적합 전이에서는 세팅하지 않는다(OUTBOUND의 send()는 baseline 미세팅 — OUTBOUND는 complete()에서만). 도메인 헬퍼 `captureRevisionBaselineIfAbsent()`로 캡슐화하되 호출 위치(send/complete)에서 타입 가드.
- 상태 전이 자체는 `incrementRevision()`을 호출하지 않으므로(콘텐츠 편집 아님) baseline=드래프트 편집 수, 직후 첫 편집이 카운트 1.

### 3.3 표시 계산 (SlipResponse)
```
editHistoryCount =
    (revisionCountBaseline == null) ? 0
                                    : max(0, revisionCount - revisionCountBaseline)
```
- 타입 분기 불필요 — baseline이 타입별 올바른 시점에 세팅되므로 공식은 동일.
- 편집 경로(overlay/batch/PUT update)·audit·S2b 로그 **전부 무변경**. 게이트는 순수 *표시 계산*에만 존재 → 회귀 위험 최소.

### 3.4 기존 전표 backfill (V53 동일 마이그레이션)
임계 이미 통과한 기존 전표는 baseline=null → 표시 0 회귀. 방지:
```sql
UPDATE slips SET revision_count_baseline = 0
WHERE revision_count_baseline IS NULL AND (
  (slip_type = 'OUTBOUND'  AND status IN ('COMPLETED','SHIPPING','DELIVERED','CONFIRMED'))
  OR (slip_type <> 'OUTBOUND' AND status IN ('SENT','ACCEPTED','PROCESSING','INSPECTING','COMPLETED','SHIPPING','DELIVERED','CONFIRMED'))
);
```
- 효과: 기존 임계통과 전표는 `editHistoryCount = revisionCount`(현 표시 보존). 미통과 전표는 null 유지(→0, 올바름).
- 트레이드오프: 기존 임계통과 전표는 드래프트 편집까지 포함(과거 baseline 복원 불가). **신규 전표는 정확 게이트.** 정직 명시.
- REJECTED/CANCELED는 backfill 제외(드래프트 중 취소 = 미통과로 간주).

## 4. 엣지 처리

1. **되돌리기/복원**(audit `revertToRevision`·S2b `restore`): `revisionCount`가 이미 +1되므로 **baseline 後면 자동으로 카운트에 포함**. 되돌림도 확정 전표의 수정으로 간주(개발책임자 룰 정합).
2. **임계 전이 자체**(send/complete): `incrementRevision` 미호출 → baseline만 세팅, 카운트 0에서 시작.
3. **재전이/역전이**: 라이프사이클 forward-only(도메인 강제). baseline은 1회만 세팅(idempotent) → 멱등.
4. **OUTBOUND의 SENT 통과**: OUTBOUND는 send()에서 baseline 미세팅(complete()에서만) → SENT~INSPECTING 편집 카운트 X(룰 정합).

## 5. FE

- `editHistoryCount` **shape 불변**(SalesQueryPage "전표수정내역" 컬럼·`fmtEditCount` 그대로). BE 계산값만 게이트.
- `mock.ts` editHistoryCount 값을 룰 반영해 갱신(드래프트 상태 mock은 0, 임계통과 mock은 N).

## 6. 테스트

- **단위**(Slip 도메인): baseline 세팅 — OUTBOUND complete()시 세팅·send()시 미세팅 / 비-OUTBOUND send()시 세팅. idempotent 재호출. editHistoryCount 계산(null→0, baseline→차감).
- **실 DB IT**(Testcontainers): OUTBOUND DRAFT 3회 편집→count 0 → complete() → 편집 2회 → count 2. 비-OUTBOUND SAVED 편집→0 → send() → 편집 1회 → count 1. backfill 마이그레이션 fresh-DB probe.
- **FE**: 전표수정내역 표시 0/N건 (vitest + playwright).

## 7. 비목표 (YAGNI)

- editHistoryCount 외 다른 카운트 UI 추가 안 함.
- audit 로그/S2b 버전로그 표시 변경 없음(그들은 모든 편집을 계속 기록·표시).
- S2d(레드라인)·S3(6문서 롤아웃)은 별도 슬라이스.

## 8. 워크플로우

표준 슬라이스: 조기 PR → Codex 구현 → Opus 5-agent + fix + 라이브QA → Codex 5-agent + fix + 라이브QA → 0수렴 → PM 종합 → CI green → 머지. 마이그레이션 fresh Postgres probe 검증, page-code/UUID 가드 해당 없음(BE 계산·1컬럼).
