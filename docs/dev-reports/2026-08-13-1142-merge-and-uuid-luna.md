# #1142 origin/main 머지 및 UUID 재확인 — CODEX LUNA

- 실행일: 2026-08-13 (KST)
- 대상: `feat/1142-completed-slip-revert` · PR #1189
- 기준: 작업 전 HEAD `2023ae299`, `origin/main` `d6e863aec`

## 머지 결과

요청대로 `git merge origin/main`을 실행했다. `clients/desktop/src/renderer/api/slip.ts`와
`services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/StockInstanceRepository.java`
에서 충돌이 발생했다.

- Desktop 충돌은 현재 브랜치의 읽기 전용 `getSlipRevertability`와 `main`의
  전표번호→opaque token 상세 해석 함수(`getSlipByNumber`, `getOutboundSlipBySlipNo`)가
  서로 다른 기능이므로 모두 보존했다.
- Inventory 충돌은 현재 브랜치의 판정용 전표번호 count 메서드와 `main`의
  `serialKey` 조회 메서드가 서로 다른 기능이므로 모두 보존했다.
- `SlipController`는 `main`의 `String id` + `OpaqueUuidDeserializer.decode(id)` 상세 경로와
  S1 판정 endpoint를 모두 보존한 상태이며 충돌 표식이 없다.

사용자 지시(커밋·`git add` 금지)에 따라 충돌 해소 파일을 작업 트리에서만 해소했고,
merge commit 생성이나 index stage는 하지 않았다. PM이 검토 후 stage/commit을 대행해야 한다.

## 머지 후 UUID 재확인

`origin/main`에 포함된 `#999` opaque token 계약을 소스와 계약 테스트로 재확인했다.

- 완료 전표 상세 URL: 목록 응답의 `row.id`가 `OpaqueUuidSerializer`의 URL-safe Base64
  token이고, Desktop은 이 값을 `/purchases/${row.id}`에 사용한다. UUID 원문이 URL에 없다.
- 기존 목록 응답: `SlipResponse.id`, `partnerId`, 창고 ID 및 사용자 ID가 opaque serializer를
  사용한다.
- 기존 상세 응답: `SlipDetailResponse`의 전표·거래처·창고·사용자·배차 ID와 중첩
  `SlipLineResponse`의 line/product ID가 opaque serializer를 사용한다.
- 상세 요청: `SlipController`가 opaque token 또는 legacy UUID를 내부 UUID로 decode한다.
- 판정 bulk/single 응답: 기존처럼 사용자 식별 가능한 전표번호·사유·배차그룹 번호만 반환한다.

따라서 머지 후 확인 결과는 **상세 URL·기존 목록·기존 상세 응답의 UUID 노출이 사라짐**이다.
새 UUID 변환 방식을 발명하거나 S1 판정/상태 변경 코드를 수정하지 않았다.

## RED → GREEN

머지 후 UUID가 남아 있지 않아 추가 수정용 RED 테스트는 만들지 않았다. 이미 머지에 포함된
전수 계약 테스트가 응답 본문과 중첩 구조를 검사한다.

```text
./gradlew :services:slip-service:test --tests '*SlipModalUuidFreeContractTest' --tests '*SlipControllerIT' --no-daemon --console=plain
BUILD SUCCESSFUL in 1m 11s
```

Desktop에도 요청 URL과 검색·상세 응답 본문을 함께 검사하는 계약 테스트가 존재하며,
opaque token을 사용한다(`clients/desktop/src/renderer/api/slip.test.ts`).

## 불변식 재확인

- 불변식 2: 머지 후 S1 판정 경로에는 상태 setter, 재고 inverse 호출, 배차 연결 삭제가
  추가되지 않았다. 판정은 읽기 전용 preflight이다.
- 불변식 3: 기존 라이브 QA 보고서의 13건 판정 13/13 일치 결과를 유지한다. opaque token
  변경은 식별자 표현만 바꾸며 판정 로직·전표번호를 바꾸지 않는다.
- 기존 전표 목록·상세는 opaque token을 받아 서버에서 decode하므로 동작을 유지한다.

## 검증

- slip-service 대상 계약/컨트롤러 테스트: **통과**.
- inventory-service 전량 테스트: **통과**, `BUILD SUCCESSFUL in 2m 15s`.
- slip-service 전량 테스트: **못 돌림**. 기존 보고서와 동일하게 timeout 위험이 있어
  전량 실행 대신 UUID 관련 대상 테스트를 실행했다.
- `npm run typecheck`: **못 함**. `clients/desktop`에서 실행했으나
  `electron-updater`가 설치된 `node_modules`에 없고 `clients/web/design-system/dist/index.d.ts`
  파생물이 없어 real-QA freshness guard에서 차단됐다. 저장소 루트에서의 첫 실행은
  package.json 부재로 실패했다.
- 공유 Docker 스택: 중지·재기동하지 않았다.

## 라운드 종료 점검

삭제된 추적 파일은 없으며 `tools/.s24-build-only/build/deep/tracked-writer.mjs`가 존재한다.
이번 작업에서 `docs/qa` 아래에 새 드라이버를 만들지는 않았다. 다만 해당 경로에는
이전 작업에서 이미 추적 중인 드라이버 스크립트가 존재하며, 범위 밖 파일이므로 삭제하지 않았다.
