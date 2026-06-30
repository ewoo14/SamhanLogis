# 코-에디팅 S3-0 — relay/provider 공용화 (설계)

> 2026-06-30 야간. 라이브 코-에디팅 에픽(#16) S3(6문서 롤아웃) 토대 슬라이스. S2d-2까지 slip 단독 완료 → 코-에디팅 인프라를 도메인 무관 공용으로 승격해 타 문서 롤아웃을 가능케 한다. 정찰 a6db59f29ec9c7159.

## Goal
slip 전용 Yjs 코-에디팅 relay/provider를 **도메인 무관 공용 컴포넌트**로 승격한다. slip은 첫 소비자로 재배선해 무회귀 검증. 본 슬라이스는 **공용화(추출·일반화)만** — 타 문서 롤아웃·redline은 후속.

## 배경 — 정찰 결과
- §7 collab(presence/comments/버전)은 이미 6문서 롤아웃됨. **Yjs 코-에디팅만 slip 단독.**
- **`shared/collab-core` Gradle 모듈 존재**(`CollabCommentService`·`CollabRevisionService`·`CollabDocumentType`·`CollabCoreAutoConfiguration`) → 코-에디팅 relay 편입 선례.
- **BE relay `SlipCoeditService`는 도메인 의존 0**(in-memory `Map<UUID,List<String>>`·`RealtimeBroker`·base64 opaque, Y.js 미해석). 변수명/javadoc만 slip.
- **FE provider `createCoeditProvider.ts`는 이미 옵션 주입**(`initialUpdates/postUpdate/postAwareness/subscribe` L86-93·402-408). slip 하드코딩=기본값 import 4개 + `HEADER_TEXT_FIELDS` 상수(L23-28) + 변수명 `slipId`.
- `CollaborativeSlipInput`은 이미 generic(provider+fieldPath 수신, 생성 안 함). `CollaborativeTextField`는 props만 slip.

## 비목표 (후속)
- 타 문서(주문·견적·회계·결재·배차) 롤아웃 = S3-1+.
- redline 일반화(`SlipRedlineService`→generic) = 독립 하위트랙(snapshot 결합 무거움).
- 컴포넌트 rename(`CollaborativeSlipInput`→`CollaborativeCellInput` 등) = churn 회피, cosmetic 후속(기능 generic이라 무영향).
- BE relay 다중노드 외부화(현 in-memory) = 문서 무관 공통 과제, 후속.

## 컴포넌트

### 1. BE — `SlipCoeditService` → `shared/collab-core` `CollabCoeditService`
- `shared/collab-core/src/main/java/com/samhanair/logis/collab/coedit/CollabCoeditService.java` 신설: `SlipCoeditService` 로직 그대로 이동(generic). API: `appendUpdate(UUID documentId, String base64Update)`·`listUpdates(UUID documentId)`·`publishAwareness(UUID documentId, String base64Awareness)`. `RealtimeBroker`(이미 shared) 주입. payload/누적 cap 상수 유지. **Y.js 미해석·in-memory·무영속 동일.**
- `CollabCoreAutoConfiguration`에 `CollabCoeditService` 빈 등록(다른 서비스가 의존성으로 자동 주입).
- slip-service `SlipCollabController` coedit 3엔드포인트(`/slips/{id}/collab/coedit[/update|/awareness]`)를 **공유 `CollabCoeditService` delegate**로 전환(주입). 기존 `SlipCoeditService` 제거.
- **계약 무변경**: 엔드포인트 URL·요청/응답 shape·SSE 이벤트(`coedit:update`/`coedit:awareness`) 동일 → FE·동작 무영향.

### 2. FE — `createCoeditProvider.ts` 공용화
- slip 기본값 import(L9-14) 제거. coedit api를 **`makeCoeditApi(basePath: string)` 팩토리**로(신규 `clients/desktop/src/renderer/realtime/coeditApi.ts`): `{ getUpdates, postUpdate, postAwareness }` — URL 템플릿 `${basePath}/collab/coedit[...]`. `SlipCollabRealtimeClient`도 `basePath` 파라미터화(또는 `createRealtimeClient({endpointPath})` 직접).
- `createCoeditProvider`/`createDocCoeditProvider` 옵션: `headerTextFields?: Set<string>`(기본 빈) — `HEADER_TEXT_FIELDS` 하드코딩 제거. `slipId`→`documentId` 리네임(외형).
- `slipCollab.ts`의 coedit 함수는 `makeCoeditApi('/slips/${id}')`로 재구현(또는 유지하되 팩토리 경유).

### 3. slip 재배선 (첫 소비자·회귀검증)
- `SlipDetailPage.tsx` provider 생성(L950)을 `createDocCoeditProvider({ documentId: id, basePath: `/slips/${id}`, headerTextFields: SLIP_HEADER_TEXT_FIELDS })`로. `SLIP_HEADER_TEXT_FIELDS`(memo/deliveryAddress/supervisionAddress/projectName) 상수는 slip 측에 유지.
- `CollaborativeTextField`(패널 메모) props basePath 주입.
- 셀 컴포넌트(`CollaborativeSlipInput` 30+) 무변경(generic).

## Data flow (무변경)
편집 → Y.Doc → `makeCoeditApi(basePath).postUpdate` → BE `CollabCoeditService.appendUpdate`(shared) → `RealtimeBroker` → SSE → 타 클라이언트. awareness 동일. slip은 basePath=`/slips/{id}`.

## Testing
- BE: `CollabCoeditServiceTest`(collab-core) — append/list/awareness opaque 중계·cap. slip-service 기존 coedit IT(`SlipCollabController` coedit) 무회귀(공유 빈 주입 후 동일).
- FE: `coeditApi.test`(makeCoeditApi URL 템플릿). 기존 `createCoeditProvider.test`·collab 컴포넌트 테스트 무회귀(documentId/headerTextFields 옵션).
- **라이브 QA(필수)**: slip 편집 모달 **2세션 동시 타이핑**(공유 relay 경유) + awareness 커서/lastEdit 펄스 + redline(S2d) 무회귀 — vite 직접서빙 또는 Docker. slip 코-에디팅이 공용화 후에도 동일 동작 실증.

## Error handling
- 공용화는 순수 추출이라 동작 불변. 회귀 위험=빈 주입 누락(CollabCoreAutoConfiguration)·URL 팩토리 오타 → IT/타입체크/라이브 QA로 차단.
- `headerTextFields` 기본 빈 → slip이 명시 주입(누락 시 메모가 scalar로=문자 CRDT 손실 → slip 라이브 QA가 적발).

→ 본 슬라이스 후 **S3-1(주문 coedit, slip 패턴 1:1)** 부터 문서별 롤아웃.
