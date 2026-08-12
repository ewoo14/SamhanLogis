# #999 전표 모달 UUID 비공개 fix — CODEX LUNA

## 결론

전표 모달이 사용하는 호출 경로는 2개였고, 두 경로의 요청 URL·응답 본문에서 UUID를 제거했다.
검색 결과의 opaque token을 상세 요청에 전달하며, 서버는 token을 동일한 전표 UUID로 복원한다.

## 1. 전표 모달 호출 경로 전수 목록

호출부는 `clients/desktop/src/renderer/routes/warehouse/StockSlipDetailModal.tsx` →
`getSlipByNumber` 한 곳이며, 아래 순서로만 호출한다.

| 순서 | endpoint | 목적 | UUID 처리 전 | 처리 후 |
|---|---|---|---|---|
| 1 | `GET /slips/query?slipType=...&dateFrom=...&dateTo=...&searchSlipNo=...` | 전표번호·유형·날짜로 같은 전표 검색 | `data.content[].id`, `partnerId` 등 원 UUID | UUID 타입 필드는 opaque token, UUID 문자열 필드도 opaque token |
| 2 | `GET /slips/{id}` | 검색 행의 라인 포함 상세 조회 | `{id}` path가 UUID, 상세·라인 중첩 UUID | `{id}`는 opaque token, 서버에서 UUID 복원; 응답 전체 opaque token |

전표 모달에는 이외의 처리·첨부·가격기억·realtime endpoint 호출이 없다. 주소 행은 `slipNo`가 없어 위 경로를 시작하지 않는다.

## 2. RED 원문

### 요청 URL

```text
FAIL 재고수불부 전표 모달 UUID 비공개 계약
expected '/slips/query\n/slips/11111111-1111-4111-8111-111111111111'
not to match /[0-9a-f]{8}-[0-9a-f-]{27}/i
```

### 응답 본문

```text
FAIL SlipModalUuidFreeContractTest > searchAndDetailResponseBodies_areUuidFreeAcrossNestedStructures()
org.opentest4j.AssertionFailedError at SlipModalUuidFreeContractTest.java:39
```

RED 테스트는 요청 URL과 검색·상세 응답 및 중첩 라인을 각각 scan했다.

## 3. 처리 표

| 대상 | 처리 |
|---|---|
| 검색 `SlipResponse.id/partnerId/sourceWarehouseId/destinationWarehouseId` | `OpaqueUuidSerializer` 적용 |
| 검색 `requesterId/acceptedBy` UUID 문자열 | `OpaqueUuidStringSerializer` 적용 |
| 상세 `SlipDetailResponse` UUID 필드 | 동일 `OpaqueUuidSerializer` 적용 |
| 상세 사용자 식별자 문자열 4개 | 동일 opaque 문자열 serializer 적용 |
| 상세 `SlipDetailResponse.lines[]`의 `id/productId` | `SlipLineResponse`에 동일 serializer 적용 |
| 상세 요청 `/slips/{id}` | `String` path 수신 후 `OpaqueUuidDeserializer.decode`로 복원; 기존 UUID도 하위 호환 |
| 공용 mutation path (`save/send/accept/...`) | `SlipOpaqueUuidPathConverter`로 같은 decoder를 Spring UUID path-variable 전체에 등록 |
| 새 방식 도입 여부 | 없음. #1072/#1143의 16-byte URL-safe Base64 방식 그대로 적용 |

## 4. GREEN 원문

```text
BUILD SUCCESSFUL
SlipModalUuidFreeContractTest — 2 tests completed, 0 failed
```

```text
clients/desktop/src/renderer/api/slip.test.ts
✓ (11 tests)
Test Files 1 passed
Tests 11 passed
```

## 5. 전표 모달 동작 확인

프런트 계약 테스트에서 실제 전표번호 `2026/08/02-17`을 사용했다.

```text
GET /slips/query ... searchSlipNo=2026/08/02-17
검색 결과의 같은 행 id = opaque token
GET /slips/{opaque token}
상세 응답 slipNo = 2026/08/02-17
sameSlip = true
```

검색·상세 요청 URL과 두 응답 fixture 전체, 상세 lines 중첩 구조에 UUID pattern이 없음을 확인했다.

## 6. 불변식 재확인

1. 전수 대상 2개 endpoint의 요청 URL·응답 본문·중첩 라인 UUID scan 계약 테스트 통과.
2. 전표번호 `2026/08/02-17` 검색 결과의 opaque id로 상세를 열고 동일 전표번호를 반환하는 테스트 통과.
3. opaque token은 화면에 표시하지 않고 API 내부 응답·요청 연결에만 사용.
4. 기존 라이브QA 통과 14개 기능과 직접 접촉하는 재고·QR·실사·수불부·상태변경 코드는 수정하지 않았다. mutation 응답 token을 다음 path에 전달하는 기존 전표 흐름까지 decoder로 보존했다.

검증 원문 요약:

| 검증 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| Desktop `src/renderer/api/slip.test.ts` | 11/11 통과 |
| `:services:inventory-service:test` | `BUILD SUCCESSFUL` |
| `SlipControllerIT` | 25/25 통과 |
| `SlipQuery*` + UUID 계약 | 55/55 통과 |
| slip-service 전체 `test` | 전체 실행은 120초 실행기 제한으로 회수하지 못함; 변경 관련 전량은 위 필터로 통과 |

## 7. 못 한 것

- 이번 라운드에는 격리 복제 DB/서비스를 다시 기동한 라이브 브라우저 왕복은 실행하지 못했다. 따라서 `2026/08/02-17`은 저장소 계약 테스트로 exact 대조했고, 라이브 캡처 재생은 기존 QA 보고서의 실제 표본 `2026/08/08-9` 기록을 유지한다.

## 8. 라운드 종료 점검

삭제된 추적 파일: 없음. `tools/.s24-build-only/build/deep/tracked-writer.mjs`: 존재.
격리 컨테이너·임시 디렉터리·이번 작업의 Gradle/테스트 프로세스 잔여: 없음으로 확인 후 기록한다.
