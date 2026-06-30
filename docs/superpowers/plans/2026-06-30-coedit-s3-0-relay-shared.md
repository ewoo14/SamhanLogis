# 코-에디팅 S3-0 relay/provider 공용화 — 구현 계획

> **For agentic workers:** 표준 워크플로우(조기PR→Codex구현+commit대행→순차 듀얼리뷰 즉시게시 0수렴→라이브QA→PM종합→CI→squash머지). spec: docs/superpowers/specs/2026-06-30-coedit-s3-0-relay-shared-design.md.

**Goal:** slip 전용 Yjs 코-에디팅 relay/provider를 도메인 무관 공용으로 승격(slip 첫 소비자 재배선·무회귀).

**Architecture:** BE `SlipCoeditService`(도메인 의존 0) → `shared/collab-core` `CollabCoeditService` 통째 이동 + 빈 등록 + slip delegate. FE `createCoeditProvider` slip 기본값 제거·`makeCoeditApi(basePath)` 팩토리·`headerTextFields` 옵션화. 계약·동작 무변경.

**Tech Stack:** Java 17 / Spring Boot 3 (collab-core Gradle 모듈) · TS / React (Electron renderer) · Yjs · vitest · JUnit.

## Global Constraints
- 계약 무변경(엔드포인트 URL·요청/응답 shape·SSE 이벤트). slip 코-에디팅 동작 불변(라이브 QA 2세션 동시타이핑 무회귀).
- BaseEntity·Soft Delete 무관(relay=in-memory·무영속). 마이그레이션 0.
- 한국어 Javadoc·커밋·PR. UUID 비노출.

---

### Task 1: BE — shared `CollabCoeditService` 신설
**Files:**
- Create: `shared/collab-core/src/main/java/com/samhanair/logis/collab/coedit/CollabCoeditService.java`
- Create: `shared/collab-core/src/test/java/com/samhanair/logis/collab/coedit/CollabCoeditServiceTest.java`
- Modify: `shared/collab-core/.../CollabCoreAutoConfiguration.java` (CollabCoeditService 빈 등록)
- 참조(이동원): `services/slip-service/.../collab/SlipCoeditService.java`

**Interfaces (Produces):**
- `CollabCoeditService(RealtimeBroker broker)` 생성자.
- `void appendUpdate(UUID documentId, String base64Update)` — 형식검증(base64)+payload cap+누적 cap, `broker.publish(documentId, EVENT_UPDATE, Map.of("update", normalized))`.
- `List<String> listUpdates(UUID documentId)` — 신규접속자 replay용 누적 목록.
- `void publishAwareness(UUID documentId, String base64Awareness)` — 미저장, `broker.publish(documentId, EVENT_AWARENESS, ...)`.
- 상수 `MAX_PAYLOAD_LENGTH`/누적 cap/`EVENT_UPDATE`("coedit:update")/`EVENT_AWARENESS`("coedit:awareness") 이동.

- [ ] SlipCoeditService 로직을 documentId 일반화로 복사(slip 변수명/javadoc 제거). 한국어 Javadoc.
- [ ] CollabCoeditServiceTest: append→list 누적·awareness 미저장(list empty)·opaque verbatim 중계·payload cap 초과 거부·임의 base64("BQYH") 그대로 broadcast.
- [ ] CollabCoreAutoConfiguration `@Bean CollabCoeditService`(RealtimeBroker 주입).
- [ ] `gradlew :shared:collab-core:test` green.
- [ ] Commit.

### Task 2: BE — slip delegate 전환
**Files:**
- Modify: `services/slip-service/.../web/collab/SlipCollabController.java` (coedit 3엔드포인트 L247-287 → 주입 `CollabCoeditService` delegate, slipId→documentId 인자)
- Delete: `services/slip-service/.../collab/SlipCoeditService.java`
- 확인: slip coedit IT(존재 시) 무회귀.

**Interfaces (Consumes):** Task1 `CollabCoeditService`.

- [ ] SlipCollabController 생성자 주입 `SlipCoeditService`→`CollabCoeditService`. 메서드 본문 동일(slipId를 documentId로 전달). 엔드포인트 URL·DTO·`@RequirePermission(page="slip.comments")` 무변경.
- [ ] SlipCoeditService 삭제. slip-service가 collab-core 의존(build.gradle 이미 — 확인, 없으면 추가).
- [ ] `gradlew :services:slip-service:compileJava :services:slip-service:test`(coedit 관련) green.
- [ ] Commit.

### Task 3: FE — `makeCoeditApi(basePath)` 팩토리
**Files:**
- Create: `clients/desktop/src/renderer/realtime/coeditApi.ts`
- Create: `clients/desktop/src/renderer/realtime/coeditApi.test.ts`

**Interfaces (Produces):**
- `makeCoeditApi(basePath: string): { getUpdates(): Promise<string[]>; postUpdate(update: string): Promise<void>; postAwareness(awareness: string): Promise<void> }` — URL `${basePath}/collab/coedit`(GET updates), `${basePath}/collab/coedit/update`(POST {update}), `${basePath}/collab/coedit/awareness`(POST {awareness}). 기존 `slipCollab.ts` L115-145 요청/응답 shape 재사용(axios, ApiResponse.ok data 추출).

- [ ] coeditApi.ts 구현(기존 slipCollab coedit 함수 로직 generic화). 한국어 주석.
- [ ] coeditApi.test: basePath=`/slips/abc`일 때 3 URL 정확·응답 파싱(updates 배열·void). axios mock.
- [ ] `vitest run src/renderer/realtime/coeditApi.test.ts` green.
- [ ] Commit.

### Task 4: FE — `createCoeditProvider` 공용화
**Files:**
- Modify: `clients/desktop/src/renderer/realtime/createCoeditProvider.ts` (기본값 import L9-14 제거·`HEADER_TEXT_FIELDS` L23-28 → 옵션·slipId→documentId·makeCoeditApi/SSE basePath)
- Modify: `clients/desktop/src/renderer/realtime/createCoeditProvider.test.ts` (옵션 시그니처 갱신)

**Interfaces (Consumes):** Task3 `makeCoeditApi`. **(Produces):**
- `createDocCoeditProvider(opts: { documentId: string; basePath: string; headerTextFields?: Set<string>; ... 기존 옵션 })` — 기본 api=`makeCoeditApi(basePath)`, SSE=`createRealtimeClient({ name, endpointPath: `${basePath}/collab/stream` })`. `headerTextFields`(기본 `new Set()`)로 Y.Text vs scalar 결정.
- `createCoeditProvider`(단일 Y.Text) 동일 패턴 documentId/basePath.

- [ ] slip 기본값 import 제거·`HEADER_TEXT_FIELDS`→`opts.headerTextFields ?? EMPTY_SET`·`slipId`→`documentId`·api/SSE를 basePath 파생. 옵션 주입(기존 initialUpdates/postUpdate/... )은 명시 시 override 유지.
- [ ] createCoeditProvider.test: documentId/basePath/headerTextFields 옵션 반영·기존 awareness/cursor/lastEdit/redline 테스트 무회귀(slip 헤더필드는 headerTextFields 주입으로 Y.Text 유지 검증).
- [ ] `vitest run src/renderer/realtime/` green.
- [ ] Commit.

### Task 5: FE — slip 재배선 (첫 소비자·회귀)
**Files:**
- Modify: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` (provider 생성 L950 → `createDocCoeditProvider({ documentId: id, basePath: `/slips/${id}`, headerTextFields: SLIP_HEADER_TEXT_FIELDS })`, 상수 SLIP_HEADER_TEXT_FIELDS 신설)
- Modify: `clients/desktop/src/renderer/components/collab/CollaborativeTextField.tsx` (props `slipId`→`documentId`+`basePath`, `createCoeditProvider` 호출 갱신)
- Modify: `.../components/collab/SlipCollaborationPanel.tsx` (CollaborativeTextField props basePath=`/slips/${slipId}` 주입)
- Modify: `clients/desktop/src/renderer/api/slipCollab.ts` (coedit 함수→makeCoeditApi 경유 또는 호환 유지)

**Interfaces (Consumes):** Task3/4.

- [ ] SLIP_HEADER_TEXT_FIELDS=`new Set(['memo','deliveryAddress','supervisionAddress','projectName'])` slip 측 상수. provider 생성 갱신. 셀(`CollaborativeSlipInput` 30+) 무변경.
- [ ] CollaborativeTextField/Panel basePath 배선. 기존 컴포넌트 테스트 갱신(documentId/basePath).
- [ ] `npm run typecheck` exit 0 · `vitest run src/renderer/` green(전 collab/realtime 무회귀).
- [ ] Commit.

### Task 6: docs + 라이브 QA
**Files:**
- Create: `docs/dev-reports/2026-06-30-coedit-s3-0-relay-shared.md`
- Modify: `migration/decisions/DECISIONS.md`(D-COEDIT-S3-00 공용화), `ROADMAP.md`

- [ ] dev-report(공용화 범위·계약무변경·slip 회귀·후속 롤아웃). DECISIONS/ROADMAP.
- [ ] **라이브 QA**: slip 편집 모달 2세션 동시 타이핑(공유 relay 경유)+커서/lastEdit 펄스+redline 무회귀 실 캡처(vite 직접서빙 또는 Docker). BE: `gradlew :shared:collab-core:test :services:slip-service:test` green.
- [ ] Commit.

## Self-Review
- spec 커버: Task1-2=BE 공용화, Task3-4=FE 공용화, Task5=slip 재배선, Task6=docs/QA. ✓
- placeholder 0. 타입 일관(makeCoeditApi/createDocCoeditProvider 시그니처 Task3-5 일치). ✓
- 회귀 안전망=slip 기존 테스트+2세션 라이브 QA. ✓
