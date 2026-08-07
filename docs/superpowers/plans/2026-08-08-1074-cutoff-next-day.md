# #1074 마감 후 익일 출고 선택 구현 계획

> **For agentic workers:** 이 계획은 현재 세션에서 inline으로 실행한다. 커밋과 push는 하지 않는다.

**Goal:** 출고일(M)을 오늘로 고정하지 않고 익일 이후 선택 가능하게 하면서, 활성 출고 태그 전부에 대해 마감 가드와 M/N 배송일정 계약을 보존한다.

**Architecture:** FE는 새 OUTBOUND 전표의 `slipDate`를 KST 오늘로 초기화하되 오늘 이전을 선택할 수 없게 하고, 선택한 M을 create payload와 배송일정 계산의 기준으로 사용한다. BE의 cutoff 시각·판정 로직은 변경하지 않으며, 기존 `slipDate=today`일 때만 마감 후 차단하고 미래 날짜는 통과시킨다.

**Tech Stack:** React/TypeScript, Vitest/Testing Library, Spring Boot/Java, Gradle, PostgreSQL SELECT-only 실측.

## Global Constraints

- `REGION 12:00`, `STACK 14:00`, `GYEONGDONG_PARCEL 15:00`, `GYEONGDONG_FREIGHT 15:00` 정책과 실제 활성 `DAY·LOGEN` 행을 삭제·변경하지 않는다.
- 마감 가드의 판정 로직과 M/N 계약을 유지한다.
- 마감 후 오늘·과거는 선택/생성할 수 없고 익일 이후만 가능하다. 마감 전에는 오늘·미래 생성이 정상이어야 한다.
- DB 직접 INSERT/UPDATE/DELETE, 공유 Docker 재기동, commit/push를 하지 않는다.
- 화면에 UUID와 “슬립” 용어를 노출하지 않는다.

### Task 1: FE 날짜 선택 계약을 테스트로 고정

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SlipFormPage.test.tsx`
- Modify: `clients/desktop/src/renderer/routes/SlipFormPage.tsx`

**Interfaces:**
- `SlipFormPage`는 `slipDate` state를 create payload의 `slipDate`와 `DeliveryTagSelector.slipDate`, 배송일정 계산 기준으로 사용한다.

- [ ] 실패 테스트: OUTBOUND 신규 폼에서 날짜 input이 오늘을 기본값으로 갖고, 익일 선택 시 `createSlip` payload가 익일을 사용하며, REGION/STACK N 계산도 익일 기준으로 바뀌는 회귀를 추가한다.
- [ ] 테스트 실행: `npm run test -- src/renderer/routes/SlipFormPage.test.tsx`에서 기존 today 고정 동작과의 차이로 실패하는지 확인한다.
- [ ] 최소 구현: `slipDate` state를 KST today로 초기화하고 `min={today}` date input을 추가한다. 기존 배송일정 카드의 M 표시·라벨·당착 해제 시 계산을 `slipDate` 기준으로 변경하고 payload도 `slipDate`를 전송한다.
- [ ] 테스트 실행: 같은 suite를 재실행해 PASS를 확인한다.

### Task 2: BE cutoff 활성 태그 전수 회귀를 테스트로 고정

**Files:**
- Modify: `services/slip-service/src/test/java/com/samhanair/logis/slip/it/cutoff/OutboundCutoffGuardIT.java`
- Modify: `services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipServiceTest.java`

**Interfaces:**
- `OutboundCutoffGuard.assertWithinCutoff(DeliveryTag, LocalDate)`의 기존 계약을 유지한다.

- [ ] 실패 테스트: 활성 cutoff가 있는 네 시드 태그와 실제 활성 `DAY·LOGEN`에 대해 마감 후 당일은 409, 익일은 201, 마감 전 당일은 201인 매트릭스를 고정한다. 기존 `slipDate=today` 기준의 가드는 수정하지 않는다.
- [ ] 테스트 실행: `./gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.it.cutoff.OutboundCutoffGuardIT" --no-daemon`으로 새 테스트가 현재 FE 경로 부재 또는 시나리오 미충족으로 실패하는지 확인한다.
- [ ] 최소 구현: BE production code는 변경하지 않는다. 실패 원인이 FE가 미래 `slipDate`를 전송하지 않는 데 있으면 Task 1 결과만으로 해소한다.
- [ ] 테스트 실행: cutoff IT와 관련 unit test를 다시 실행한다.

### Task 3: 전체 활성 태그의 날짜 경계와 UI 문구 검증

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SlipFormPage.test.tsx`
- Modify: `clients/desktop/src/renderer/routes/SlipFormPage.tsx`

- [ ] 과거 날짜가 `min=today`으로 선택 불가이고, 마감 후 당일을 익일로 안내하는 오류가 표시되는 테스트를 추가한다.
- [ ] 네 시드 태그와 `DAY·LOGEN`이 날짜 선택 UI를 공유하는지 테스트한다. 기존 DELIVERY TAG가 null인 발행 경로는 변경하지 않는다.
- [ ] 필요한 경우 공통 출고일 입력을 배송태그 선택부에 배치해 schedule 적용 여부와 무관하게 활성 cutoff 태그가 익일을 선택할 수 있게 한다.
- [ ] FE 관련 전체 테스트와 typecheck를 실행한다.

### Task 4: 실 API/실 화면 RED-A~D 확인 및 보고서 작성

**Files:**
- Create: `docs/dev-reports/2026-08-08-1074-cutoff-next-day-impl.md`
- Modify: `README.md`, `ROADMAP.md`, `migration/decisions/DECISIONS.md` only if repository sync requires this slice entry.

- [ ] 공유 Docker를 재기동하지 않고 실 화면/API에서 마감 전 정상 생성, 마감 후 당일 차단, 마감 후 익일 생성, 활성 태그 전수 결과를 기록한다. DB는 SELECT만 수행한다.
- [ ] 구현 전후 RED-B 관측 0건과 저장된 차단 후보 0건을 재측정하고, 차단 요청은 저장되지 않는다는 한계를 명시한다.
- [ ] 잠금 이유에 별도 보호 계약이 없었고 #595 M/N 계약만 확인됐다는 문장을 기록한다.
- [ ] 신규 파일 목록, `git diff --stat`의 삭제 줄 수, 실행한 테스트와 결과를 보고서에 기록한다.
