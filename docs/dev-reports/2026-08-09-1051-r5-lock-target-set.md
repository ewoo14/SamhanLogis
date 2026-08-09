# PR #1129 R5 — 잠금 대상 집합 축소

> 검증자: CODEX LUNA 5.6  
> 브랜치/HEAD: `fix/1051-product-link-track` / `c0a3a150c` 기준 작업 트리  
> 측정일: 2026-08-09 KST  
> 정책: 실 DB read-only 조회만 수행. INSERT/UPDATE/DELETE, Docker 재배포, 기존 끊긴 행·QA 잔재 수정/삭제, commit/push는 수행하지 않았다.

## 1. 결론

R4의 `min(confirmedSeedDates)`~`max(confirmedSeedDates)` 연속 구간 조회를 제거했다. R5는 날짜를 잠금 식별자로 사용하지 않고, 시더 계획에서 재생성한 정확한 `(slipType, slipNo)` 집합에 `created_by='system'`, `status=CONFIRMED`, `lock_flag=false`, `is_deleted=false`를 함께 적용한다.

## 2. 시더 산물 식별 축

| 축 | 근거 |
|---|---|
| 대상 상태/개수 | `SlipSeeder.java:344`, `SlipSeeder.java:383` — CONFIRMED spec은 OUTBOUND 4건 + INBOUND 1건 |
| 전표번호 생성 | `SlipSeeder.java:269-271`, `SlipSeeder.java:520-522`, `SlipSeeder.java:562-565` — 동일 spec 순서·날짜별 유형 순번으로 `yyyy/MM/dd-N` 생성 |
| 정확한 대상 집합 | `SlipSeeder.java:546-558` — `confirmedSeedSlipNosByType()`가 실제 채번 결과에서 유형별 번호를 산출 |
| provenance | `BaseEntity.java:25`, `JpaAuditingConfig.java:17-23` — dev 시더 실행 시 principal 부재의 `created_by` fallback은 `system` |
| 보조 provenance | `SlipSeeder.java:570-579` — 시더 메모리 `[Stage 2 시드]`를 생성. 이번 조회의 유일 조건은 아니며 전표번호 집합이 1차 식별자다. |

R5의 repository 계약은 `SlipRepository.java:529-530`, runner 사용부는 `SlipLockSeeder.java:48-79`다. 기존 날짜 구간은 잠금 대상 조회에서 사용하지 않는다.

## 3. 잠기는 전표 전수와 시더 근거

공유 DB 전수는 2026-08-09 07:31:57 KST의 read-only 측정 결과를 기준으로 했다. 해당 구간의 활성 `CONFIRMED`는 7건이었고, R4가 이미 잠근 5건 외에 날짜 사이의 2건이 있었다. R5가 잠그는 전표는 다음 정확히 5건이다.

| 전표번호 | 유형/일자 | 시더 근거 | 현재 DB lock |
|---|---|---|---:|
| `2026/02/15-1` | OUTBOUND / 2026-02-15 | Stage 2 `idx=45`, CONFIRMED spec; `created_by=system` | true |
| `2026/02/16-1` | OUTBOUND / 2026-02-16 | Stage 2 `idx=46`, CONFIRMED spec; `created_by=system` | true |
| `2026/02/17-1` | OUTBOUND / 2026-02-17 | Stage 2 `idx=47`, CONFIRMED spec; `created_by=system` | true |
| `2026/02/18-1` | OUTBOUND / 2026-02-18 | Stage 2 `idx=48`, CONFIRMED spec; `created_by=system` | true |
| `2026/04/08-1` | INBOUND / 2026-04-08 | Stage 2 `idx=97`, CONFIRMED spec; `created_by=system` | true |

숫자로 보면:

- R5 잠금 대상: **5건**
- 위 5건 중 시더 산물: **5건**
- 실 업무 전표 잠금: **0건**
- R4 구간 내 추가 2건: **0건 잠금** — `2026/03/08-1`(idx 66, 후속 작업으로 CONFIRMED), `2026/03/09-1`(idx 67, 후속 작업으로 CONFIRMED)은 CONFIRMED 날짜 구간에는 있지만 R5의 정확한 대상 번호 집합에는 없다.

실 업무 전표는 현재 전수에서 0건이지만, R5는 그 사실에 의존하지 않는다. 날짜 사이에 업무 전표가 생성되어도 정확한 전표번호 집합과 `created_by=system`을 동시에 만족하지 않으므로 대상에서 제외된다.

## 4. 5건 유지와 재기동 불변

- `SlipLockSeederTest.java:19-42`가 OUTBOUND 4개와 INBOUND 1개의 정확한 번호, `created_by=system`, `CONFIRMED` 조건을 검증하고 5회 `lock()`을 확인한다.
- repository 조회에 `lock_flag=false`가 포함되어 이미 잠긴 5건은 재기동 시 반환되지 않는다.
- 따라서 fresh 시드 후 5건이 잠기고, 재기동해도 추가 잠금은 **0건**이다.
- 날짜 사이의 R4 추가 2건은 시더 대상 집합 밖이므로 재기동 여부와 무관하게 잠기지 않는다.

## 5. 검증

### Seeder 관련 묶음

```text
.\gradlew.bat :services:slip-service:test --tests '*Seeder*' --rerun-tasks --console=plain
BUILD SUCCESSFUL in 47s
18 actionable tasks: 18 executed
Seeder tests: 11 passed, failures 0, errors 0, skipped 0
exit code: 0
```

단일 회귀 테스트도 동일하게 `--rerun-tasks`로 실행했고 exit code 0이다. slip-service 전체 테스트는 약 304초 타임아웃이므로 이번 R5에서는 요청된 Seeder 관련 묶음만 실행했다.

### typecheck 정본

정본 명령은 실제 web project를 직접 지정하는 다음 명령이다.

```text
cd clients/desktop
npx tsc --noEmit -p tsconfig.web.json
```

결과: exit code 1, 기존 무관 오류 **2건** 재현.

1. `src/renderer/routes/BankTransactionPage.tsx:424` — `PartnerAutocompleteProps`에 `autoSelectSingleResult` 없음.
2. `src/renderer/routes/components/MergeConvertDialog.tsx:711` — `WarehouseAutocompleteProps`에 `resultSelectionMode` 없음.

이번 변경은 Java/Spring slip-service와 Seeder 테스트만 수정했으며 위 web 오류를 새로 추가하지 않았다. `npx tsc --noEmit -p tsconfig.json`는 `files: []`와 project references만 읽어 exit 0인 false green이므로 정본으로 보고하지 않는다.

## 6. 셋째 가능성 및 범위 밖 관찰

`created_by='system'`만으로는 다른 내부 시스템 산물을 완전히 구분할 수 있다는 보장이 없다. 그래서 R5는 created_by를 단독 식별자로 쓰지 않고, 시더가 실제로 산출한 유형별 정확한 전표번호 집합을 1차 조건으로 사용한다. 이 외에 새 표면은 고치지 않고 보고만 한다.

## 7. 신규 파일 경로

- `docs/dev-reports/2026-08-09-1051-r5-lock-target-set.md`
