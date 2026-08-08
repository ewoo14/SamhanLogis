# #1074 마감 후 익일 출고 선택 구현 보고서

**작성일:** 2026-08-08 (KST)  
**브랜치:** `fix/1074-outbound-cutoff-next-day`  
**PR:** #1106 / Issue #1074

## 결론

`SlipFormPage`에서 OUTBOUND `출고일(M)`을 KST 오늘로 고정하던 잠금을 제거하고, 오늘 이후 날짜를 선택해 저장할 수 있게 했다. 선택한 M은 create payload와 배송일정 계산의 기준이 된다.

- 오늘을 기본값으로 유지한다.
- 과거 날짜는 `min=today`으로 선택할 수 없다.
- 마감 전에는 오늘·미래 날짜를 기존처럼 생성할 수 있다.
- 마감 후 당일 M은 기존 `OutboundCutoffGuard`가 계속 차단한다.
- 마감 후 익일 이후 M은 기존 가드의 미래 날짜 통과 계약으로 생성할 수 있다.
- REGION/STACK의 N 계산은 기존 M+1 규칙을 유지하고, 당착은 선택한 M과 동일하게 유지한다.
- 마감 시각, `OutboundCutoffGuard` 판정 로직, DB의 cutoff 행은 변경하지 않았다.

## 착수 전 실측

### 1. M 잠금 이유

M 잠금은 마감 기능의 별도 계약이 아니라 PR #595 배송일정 계약에서 생겼다.

- `SlipFormPage` 주석: M=오늘 읽기전용, N만 편집.
- `DeliverySchedule`: M=`slipDate`, REGION/STACK N=M+1(주말 예외 포함), REGION 당착 N=M.
- PR #595 문서/README/ROADMAP: “상차(M)=출고일 잠금 / 하차(N) 편집” 계약.

별도로 지켜야 할 다른 계약은 발견되지 않았다. 이번 구현은 M을 미래로 선택할 수 있게만 하고, M이 배송일정의 기준이라는 계약 자체는 보존했다.

### 2. 마감 규칙 전수

| 태그 | 방향 | cutoff | 현재 DB 활성 | 이번 규칙 적용 |
|---|---|---:|---:|---|
| `REGION` | OUTBOUND | 12:00 | 예 | 당일 초과 차단 / 익일 통과 |
| `STACK` | OUTBOUND | 14:00 | 예 | 당일 초과 차단 / 익일 통과 |
| `GYEONGDONG_PARCEL` | OUTBOUND | 15:00 | 예 | 당일 초과 차단 / 익일 통과 |
| `GYEONGDONG_FREIGHT` | OUTBOUND | 15:00 | 예 | 당일 초과 차단 / 익일 통과 |
| `DAY` | OUTBOUND | 00:01 | 예, QA에서 추가 | 당일 초과 차단 / 익일 통과 |
| `LOGEN` | OUTBOUND | 00:01 | 예, QA에서 추가 | 당일 초과 차단 / 익일 통과 |
| `RENTAL` | OUTBOUND | 없음 | 아니오 | cutoff opt-in 없음 |
| `RETURN_RENTAL` | OUTBOUND | 없음 | 아니오 | cutoff opt-in 없음 |

`DAY`·`LOGEN` 행은 2026-06-24 사용자 계정으로 생성된 실제 DB 행이다. 삭제·비활성화·시각 변경을 하지 않았다.

### 3. 실 데이터 차단 건수

DB SELECT 기준 현재 `slip_outbound_cutoff` 활성 행은 6개이며, 2026-08-08 당일 OUTBOUND 전표 중 활성 cutoff 태그가 붙은 저장 행은 0건이다. 차단 요청은 전표로 저장되지 않으므로 DB의 저장 행만으로 요청 건수를 셀 수 없다.

커밋된 실 API/화면 QA 증거에서 확인 가능한 409는 최소 5건이다.

| 증거 | 확인된 차단 |
|---|---:|
| 2026-06-24 cutoff QA: REGION 00:01 후 재생성 | 1 |
| 2026-08-05 #1039 QA: DAY/STACK/REGION | 3 |
| 2026-08-06 #1065 QA: DAY | 1 |
| 합계 | **최소 5** |

이는 동일 요청의 중복 여부를 알 수 없는 하한이다. 같은 증거에서 마감 전 정상 201이 확인됐고, 정상 경로 절차 오류는 0건이었다. 구현 후 FE/BE 회귀에서도 마감 전 오차단은 0건이다.

## 구현 파일

- `clients/desktop/src/renderer/routes/SlipFormPage.tsx`
  - `slipDate` state 추가.
  - OUTBOUND 출고일 input을 오늘 기본값 + `min=today`으로 제공.
  - create payload, DeliveryTagSelector, M/N 계산 기준을 선택한 M으로 통일.
  - 기존 배송일정 카드의 M은 선택값을 표시하는 읽기전용 mirror로 유지.
- `clients/desktop/src/renderer/routes/SlipFormPage.test.tsx`
  - 활성 cutoff 태그 6개 날짜 선택 회귀.
  - REGION 익일 생성 payload와 N=M+1 회귀.
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/cutoff/OutboundCutoffGuardTest.java`
  - 활성 6개 태그 각각 당일 마감 후 차단, 익일 통과, 마감 전 통과 회귀.
- `docs/superpowers/plans/2026-08-08-1074-cutoff-next-day.md`
  - 실행 계획.

## RED-A~D 결과

| 불변식 | 결과 | 근거 |
|---|---|---|
| RED-A | GREEN | FE가 익일 M을 payload에 넣고 REGION N을 익일+1로 계산하는 97번째 회귀 포함. 기존 실 API QA도 미래 날짜 201을 확인. |
| RED-B | GREEN | 마감 전 201 기존 증거 유지, 회귀 테스트에서 활성 태그별 before-cutoff 통과 6/6, 관측 오차단 0. |
| RED-C | GREEN | 활성 태그별 after-cutoff 당일 차단 6/6. BE 가드 production code 미변경. |
| RED-D | GREEN | 시드 4개 + 실제 활성 `DAY·LOGEN` 2개 전수 테스트 6/6. |

## 검증

- `npm run test -- src/renderer/routes/SlipFormPage.test.tsx` — **97/97 PASS**
- `./gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.service.cutoff.OutboundCutoffGuardTest" --no-daemon` — **BUILD SUCCESSFUL**, 활성 태그 매트릭스 12개 통과
- `npm run typecheck` — **exit 0**
- `npm run build` (`clients/web/design-system`) — **성공**
- `npm run build` (`clients/desktop`) — **성공**
- 공유 Docker stack — **재기동하지 않음**
- DB — **SELECT만 실행**, 직접 INSERT/UPDATE/DELETE 없음

## 신규 파일 목록

- `docs/superpowers/plans/2026-08-08-1074-cutoff-next-day.md`
- `docs/dev-reports/2026-08-08-1074-cutoff-next-day-impl.md`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/cutoff/OutboundCutoffGuardTest.java`

## diff 통계

최종 확인 시 `git diff --stat`의 추적 파일 기준 삭제 줄 수는 **13줄**이다. 순증은 음수가 아니며, 신규 untracked 파일은 일반 `git diff --stat`에 포함되지 않는다. 커밋·push는 하지 않았다.
