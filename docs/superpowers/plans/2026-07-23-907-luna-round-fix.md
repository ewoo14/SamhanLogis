# PR #907 LUNA 라운드 fix 실행계획

> **For agentic workers:** 이 계획은 현재 세션에서 순차 실행한다. 각 RED/GREEN/뮤테이션 결과와 명령 원문을 `docs/qa/907-luna-round-2026-07-23/REPORT.md`에 기록한다. 사용자 지시로 git 쓰기 명령은 실행하지 않는다.

**목표:** PR #907의 도달가능 결함 R-1~R-5와 pre-existing R-4를 수정해 M-1~M-6을 만족시킨다.

**구조:** 병합 후보에만 UUID 정확일치 필터를 추가하고 기존 목록 부분검색을 보존한다. FE 상태 초기화·React Query freshness·성공 invalidate를 병합 모달과 목록 페이지에 국소 적용한다. 거래처 공용 검색은 service 입력 escape와 repository `ESCAPE` 절을 함께 적용한다.

**기술 스택:** Spring Boot/JPA/PostgreSQL, React/TypeScript, TanStack Query, Vitest, Playwright, Gradle.

## 전역 제약

- 후보와 실행 가드가 같은 `partner_id` 정체성을 보아야 한다.
- legacy `partner_id IS NULL` 주문은 병합 후보에서 제외하고 단건 발행은 유지한다.
- UUID는 사용자 화면에 노출하지 않는다.
- S7-2 409 안전망과 S7-3 병합 로직 자체는 변경하지 않는다.
- 새 migration 번호를 만들지 않는다.
- git add/commit/checkout/stash/push/restore/reset을 실행하지 않는다.

---

### 작업 1: 현재 결함의 RED 증거 고정

**파일:**
- 수정: `clients/desktop/playwright/907-sol-adversarial-live-qa/907-sol-adversarial-real-qa.spec.ts`
- 수정: `clients/desktop/playwright/867-s7-merge-real-qa/867-s7-merge-real-qa.spec.ts`
- 생성: `docs/qa/907-luna-round-2026-07-23/RED-before-fix.txt`

- [ ] 반전 SOL 단언을 작성한다: R-2는 B 전환 직후 창고/충돌/직접입력 상태가 비어 있고 충돌 라디오가 모두 미선택이며 제출 disabled여야 한다. outgoing body는 제출이 막혀 캡처하지 않거나 B 값만 포함해야 한다.
- [ ] R-3는 재진입 시 후보 요청이 증가하고 새 주문이 노출되어야 한다고 단언한다.
- [ ] R-1은 동일 코드·상이 UUID 후보 조회가 0건이어야 한다고 단언한다.
- [ ] R-5는 성공 callback/캐시 무효화 계약을 정규화된 하이픈 key로 단언한다.
- [ ] R-4는 `%`, `_`, `\` 검색이 wildcard 전체가 아니라 리터럴 결과만 반환한다고 단언한다.
- [ ] BE/FE 하네스를 fix 전 실행하고 터미널 출력 그대로 `RED-before-fix.txt`와 보고서에 기록한다.

### 작업 2: R-1 후보 정체성 축 일치

**파일:**
- 수정: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderListFilter.java`
- 수정: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderListController.java`
- 수정: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderQueryService.java`
- 수정: `clients/desktop/src/renderer/api/sales.ts`
- 수정: `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx`
- 수정: `clients/desktop/src/renderer/api/mock.ts`
- 테스트: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderListIT.java`

- [ ] `partnerIdExact: UUID` 선택 필터를 DTO/controller/native/JPA 경로에 추가하고 기존 `partnerId` 부분검색은 그대로 둔다.
- [ ] 후보 query key와 요청에 선택 거래처 `id`를 포함하고 `partnerCode`와 UUID를 AND로 전송한다. `id`는 화면에 렌더링하지 않는다.
- [ ] mock도 exact UUID filter를 같은 방식으로 적용한다.
- [ ] 동일 코드·상이 UUID 주문이 후보에서 제외되고 동일 UUID 주문은 남는 IT를 먼저 실행해 GREEN을 확인한다.

### 작업 3: R-2 상태 초기화와 M-3 제출 가드

**파일:**
- 수정: `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx`
- 테스트: `clients/desktop/src/renderer/routes/components/MergeConvertDialog.test.tsx`

- [ ] 거래처 변경 handler에서 `selectedOrders`, `selectedWarehouse`, `qtyMap`, `shippingFields`, `customInputs`, `errorMessage`를 모두 초기화한다.
- [ ] 새 거래처 상세가 로드될 때 충돌 미확정이면 제출 버튼이 disabled인지 테스트한다.
- [ ] 직접입력 텍스트와 창고가 DOM/state에 남지 않는지 단언한다.

### 작업 4: R-3/R-5 캐시 계약

**파일:**
- 수정: `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx`
- 수정: `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx`
- 테스트: `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.test.tsx`

- [ ] 후보 query에 `staleTime: 0`, `refetchOnMount: 'always'`를 설정한다.
- [ ] 성공 시 `['partner-order-merge-candidates']`를 무효화한다.
- [ ] 상세 무효화 주문번호는 `toOrderPathId`로 하이픈 정규화한다.
- [ ] 성공 callback 경로가 목록/후보/상세를 모두 무효화하는지 테스트한다.

### 작업 5: R-4 literal 검색 및 Q-3 mock parity

**파일:**
- 수정: `services/partner-service/src/main/java/com/samhanair/logis/partner/service/PartnerService.java`
- 수정: `services/partner-service/src/main/java/com/samhanair/logis/partner/repository/PartnerRepository.java`
- 수정: `clients/desktop/src/renderer/api/mock.ts`
- 테스트: `services/partner-service/src/test/java/com/samhanair/logis/partner/it/PartnerAdminControllerIT.java`
- 테스트: `clients/desktop/src/renderer/api/mock.test.ts`

- [ ] service에서 `\\`→`\\\\`, `%`→`\\%`, `_`→`\\_` 순으로 escape한다.
- [ ] JPQL/native admin 검색과 directory 검색 LIKE에 `ESCAPE '\\'`를 적용한다.
- [ ] mock order `partnerId` 부분검색이 partnerCode 또는 bizCode를 검사하도록 fixture/필터를 보강한다.
- [ ] `%`, `_`, `\\`, bizCode 부분검색 회귀 테스트를 실행한다.

### 작업 6: RED/GREEN/뮤테이션 RED와 라이브 검증

**파일:**
- 생성: `docs/qa/907-luna-round-2026-07-23/REPORT.md`
- 생성: `docs/qa/907-luna-round-2026-07-23/*.png`

- [ ] 수정 전 RED 원문, 수정 후 GREEN 원문, fix를 되돌린 별도 mutation RED 원문을 기록한다. mutation 뒤에는 즉시 작업 트리 코드로 복구한다.
- [ ] partner-order-service와 partner-service를 테스트한다.
- [ ] 워크트리 FE renderer를 5190에서 기동하고 command line이 s7-merge인지 확인한다.
- [ ] BE 변경 jar를 워크트리에서 빌드해 메인 트리 jar로 복사하고 지정 compose 오버레이로 partner-order-service를 재배포한다.
- [ ] HashRouter 해시 경로로 real-QA를 실행해 실제 요청 횟수, outgoing body, 후보/409를 기록한다.
- [ ] mock 회귀 hard gate 전량, Vitest, typecheck를 실행한다.
- [ ] throwaway 시작 회수/종료 SQL count 0과 스크린샷 목록을 보고서에 기록한다.

### 작업 7: 최종 검토

- [ ] `git diff`와 `git status --short`로 변경 범위와 미추적 산출물을 검토한다.
- [ ] UUID 노출, migration 추가, 병합 규칙 변경, stale key 잔존을 검색한다.
- [ ] 보고서의 M-1~M-6 각 항목에 RED/fix/mutation/live/positive control이 모두 있는지 점검한다.
