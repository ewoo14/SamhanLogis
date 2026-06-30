# 협업 코-에디팅 S3-0 relay/provider 공용화

## 목적

S2d-2까지 slip 전용으로 동작하던 Yjs coedit relay/provider를 문서 도메인 무관 공용 컴포넌트로 승격했다. 본 슬라이스는 공용화만 수행하며, 타 문서 롤아웃은 후속 S3-1 이후 범위다.

## 구현 범위

- BE: `SlipCoeditService`의 opaque base64 relay 로직을 `shared:collab-core` `CollabCoeditService`로 이동했다. 이벤트명(`coedit:update`, `coedit:awareness`), payload shape(`{update}`/`{awareness}`), payload cap, 누적 snapshot cap은 유지했다.
- BE: `SlipCollabController`의 기존 3개 endpoint(`/slips/{id}/collab/coedit[/update|/awareness]`)는 URL·DTO·권한을 유지하고 shared service에 delegate한다.
- FE: `makeCoeditApi(basePath)`를 추가해 `/api/v1{basePath}/collab/coedit` 계열 HTTP 호출을 공용화했다. 기존 `slipCollab.ts` coedit 함수는 해당 factory를 경유한다.
- FE: `createCoeditProvider`/`createDocCoeditProvider`는 `documentId`, `basePath`, `headerTextFields` 옵션 기반으로 동작한다. 기본 HTTP/SSE는 `basePath`에서 파생하고, 테스트용 override callback은 기존처럼 유지한다.
- FE: slip 상세는 `basePath=/slips/{id}`와 `SLIP_HEADER_TEXT_FIELDS(memo, deliveryAddress, supervisionAddress, projectName)`를 명시 주입한다. `CollaborativeSlipInput` 셀 컴포넌트는 변경하지 않았다.

## 계약 보존

- endpoint URL, 요청/응답 envelope, SSE event name, awareness 미저장 동작은 변경하지 않았다.
- 서버는 Yjs update를 해석하지 않고 base64 payload를 그대로 누적·중계한다.
- 사용자 화면에는 UUID를 새로 노출하지 않았다. document id는 기존처럼 API path/query key 내부 용도다.

## 검증

- `./gradlew :shared:collab-core:test`
- `./gradlew :services:slip-service:compileJava :services:slip-service:test --tests com.samhanair.logis.slip.it.collab.SlipCollabIT.coedit_update_uses_create_guard_and_snapshot_awareness_use_view_guard`
- `cd clients/desktop && npm run typecheck`
- `cd clients/desktop && npm run test -- src/renderer/realtime`
- `cd clients/desktop && npm run test -- src/renderer/components/collab`

## 후속

- S3-1부터 주문/견적/회계/결재/배차 문서별 coedit rollout을 `basePath + headerTextFields` 주입만으로 확장한다.
- relay의 다중 노드 외부화, snapshot compaction/persist, redline generic화는 별도 트랙으로 분리한다.
