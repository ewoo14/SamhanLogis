# #1142 S1 되돌림 가능성 판정 — LUNA

- 조사/구현일: 2026-08-13 (KST)
- 범위: 읽기·판정·표시만. 실제 상태·재고·연결 변경 없음.
- 변경 서비스: slip-service, inventory-service, Desktop.

## 판정 결과 — 실데이터 원문

공유 DB에는 쓰지 않고 `default_transaction_read_only=on`으로 조회했다. 원문 조회 결과는 다음과 같다.

```text
활성 COMPLETED 13건
INBOUND 9건 · OUTBOUND 4건
재고 결과물 연결 13/13
source journal 연결 0/13
활성 후속 배차그룹 연결 1/13
배차 연결: 2026/08/03-4 -> QA-1039-GROUP-S9
```

inventory_db 읽기 결과 원문(재고 결과물 수 = lot + instance, source journal 수):

```text
2026/08/03-2|4|0
2026/08/03-3|4|0
2026/08/03-4|4|0
2026/08/08-6|1|0
2026/08/08-7|1|0
2026/08/08-8|1|0
2026/08/08-9|1|0
2026/08/08-20|1|0
2026/08/08-21|1|0
2026/08/09-10|1|0
2026/08/10-6|1|0
2026/08/10-7|1|0
2026/08/10-9|1|0
```

| 전표 | 가능 여부 | 사유 |
|---|---|---|
| 2026/08/03-2 | 불가 | 재고 결과물 연결, source journal 없음 — 자동 되돌림 근거 없음 |
| 2026/08/03-3 | 불가 | 재고 결과물 연결, source journal 없음 — 자동 되돌림 근거 없음 |
| 2026/08/03-4 | 불가 | 재고 결과물 연결, source journal 없음 — 자동 되돌림 근거 없음; 완료 후 연결된 배차그룹 QA-1039-GROUP-S9가 있어 먼저 연결 해제 필요 |
| 2026/08/08-6 | 불가 | 재고 결과물 연결, source journal 없음 — 자동 되돌림 근거 없음 |
| 2026/08/08-7 | 불가 | 재고 결과물 연결, source journal 없음 — 자동 되돌림 근거 없음 |
| 2026/08/08-8 | 불가 | 재고 결과물 연결, source journal 없음 — 자동 되돌림 근거 없음 |
| 2026/08/08-9 | 불가 | 재고 결과물 연결, source journal 없음 — 자동 되돌림 근거 없음 |
| 2026/08/08-20 | 불가 | 재고 결과물 연결, source journal 없음 — 자동 되돌림 근거 없음 |
| 2026/08/08-21 | 불가 | 재고 결과물 연결, source journal 없음 — 자동 되돌림 근거 없음 |
| 2026/08/09-10 | 불가 | 재고 결과물 연결, source journal 없음 — 자동 되돌림 근거 없음 |
| 2026/08/10-6 | 불가 | 재고 결과물 연결, source journal 없음 — 자동 되돌림 근거 없음 |
| 2026/08/10-7 | 불가 | 재고 결과물 연결, source journal 없음 — 자동 되돌림 근거 없음 |
| 2026/08/10-9 | 불가 | 재고 결과물 연결, source journal 없음 — 자동 되돌림 근거 없음 |

판정 API는 `GET /slips/revertability`(활성 COMPLETED 전체), `GET /slips/{id}/revertability`(단건)이다. 응답에는 전표번호·사유·배차그룹번호만 넣고 UUID는 넣지 않는다. 상세 화면의 “되돌림 가능성” 카드도 불가 사유를 그대로 표시한다. 기존 전표 목록·상세 응답과 lifecycle mutation endpoint는 변경하지 않았다.

## RED → GREEN 원문

### RED

구현 전 `RevertabilityDecisionServiceTest` 실행:

```text
> Task :services:slip-service:compileTestJava FAILED
error: cannot find symbol RevertabilityDecisionService
error: cannot find symbol RevertabilityEvidence
error: cannot find symbol RevertabilityDecision
error: cannot find symbol RevertabilityReason
14 errors
BUILD FAILED
```

불변식별 RED 테스트:

1. 13개 입력을 각각 판정하고 결과 13개를 요구.
2. 판정 전후 evidence의 COMPLETED 상태가 같음을 요구. 상태 변경 구현이면 이 assertion이 실패하도록 고정.
3. QA-1039-GROUP-S9가 사유에 포함되고 UUID/`dispatchGroupId`가 사용자 문자열에 없음을 요구.

### GREEN

```text
./gradlew :services:slip-service:test --tests '*RevertabilityDecisionServiceTest' --no-daemon --console=plain
BUILD SUCCESSFUL in 24s
18 actionable tasks: 3 executed, 15 up-to-date
```

판정 서비스에는 상태 setter, 재고 mutation client, 연결 삭제 호출이 없다. inventory preflight endpoint도 journal/lot/instance count만 SELECT한다.

## 불변식 2 확인 — 상태 변경 0

- 애플리케이션 코드에 되돌림 실행 endpoint·상태 setter 호출·재고 inverse 호출을 추가하지 않았다.
- 판정 경로는 inventory의 `GET /internal/inventory/revertability`만 호출한다.
- 공유 DB에 INSERT/UPDATE/DELETE/DDL을 실행하지 않았다.
- 판정 전후 실측 대상 13건은 모두 `status=COMPLETED` 그대로였다.
- 실제 되돌림, 권한 확정, 목표 상태, 연결 해제, 이력 모델은 구현하지 않았다.

## 검증

- slip-service 판정 테스트: GREEN.
- inventory-service 전체 테스트: `BUILD SUCCESSFUL` (기존 전체 테스트 task가 up-to-date).
- slip-service 전체 테스트: 184초 timeout으로 미완료. 전체 통과로 주장하지 않는다.
- Desktop `npm run typecheck`: 실행 전 로컬 파생물 부재로 차단됨. `electron-updater`와 design-system `dist/index.d.ts`가 없었고, design-system build도 `tsc is not recognized`로 실행되지 않았다. 못 한 것으로 기록한다.
- 마이그레이션: 없음. 기존 테이블과 derived count 조회만 사용했다.

## 라운드 종료 점검

삭제된 추적 파일 0건 · `tools/.s24-build-only/build/deep/tracked-writer.mjs` 존재 · 공유 Docker 스택 중지/재기동 없음 · 이 라운드에서 띄운 컨테이너 없음.
