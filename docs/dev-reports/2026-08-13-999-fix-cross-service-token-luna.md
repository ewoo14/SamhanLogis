# #999 전표 opaque token 서비스 경계 회귀 fix — CODEX LUNA

## 결론

`slip-service`의 UUID 비공개 응답 계약을 유지하면서 `inventory-service`의 전표 소비자를 같은 opaque 규약에 맞췄다. inventory 내부 wire decoder는 URL-safe Base64 16-byte token과 기존 UUID를 모두 받아 내부 `UUID`로 복원한다.

이로써 `2026/08/02-17` 수불부 행을 만드는 `StockLedgerService.resolveSlip()` 경로가 `slipNo/slipType`을 유지할 수 있다. DB 스키마, 수불부 계산, QR/serial 상태 변경 코드는 변경하지 않았다.

## 전표 식별자 소비 지점 전수 목록 및 처리 표

| 소비 지점 | 서비스/클라이언트 간 값 | UUID를 직접 소비하는가 | 처리 | 판정 |
|---|---|---:|---|---|
| `inventory.client.SlipClient.getSlip()` → `parseSlipDetail()` | `GET /slips/{slipId}` 응답의 `data.id`, `destinationWarehouseId`, `lines[].id`, `lines[].productId` | 예 | `OpaqueUuidDecoder`로 opaque token 또는 legacy UUID를 내부 UUID로 복원 | **수정** |
| `inventory.service.StockLedgerService.resolveSlip()` | `SlipClient`의 `SlipDetail`을 수불부 행의 `slipNo/slipType`로 변환 | 간접 | `SlipClient` 복구로 기존 처리 유지. 실패 시 null fallback은 외부 장애 보호용으로 유지 | **검증** |
| `inventory.service.InboundInspectionService` | `SlipClient` 상세 + inventory DB의 `slipId UUID` | 내부 UUID | `SlipClient`이 복원한 UUID/표시 필드 사용. controller path UUID 계약은 유지 | **검증/변경 없음** |
| `inventory.client.SlipServiceClient.getOutboundSlips()` | `/internal/slips/outbound-lines` 평탄 응답 | 아니오 | 응답에는 UUID가 없고 `slipNo`, `productCode`, `partnerCode`만 소비 | **영향 없음** |
| `arologis.client.SlipServiceClient` | `/internal/slips/outbound` 평탄 projection | 아니오 | `slipId`는 String으로 보존하지만 현재 parser는 표시용 `slipNo` 등만 사용하며 UUID 파싱하지 않음 | **영향 없음** |
| `arologis.client.SlipClient` | internal signature/by-partner 호출 | 요청 path의 내부 UUID | slip-service public 상세 응답을 소비하지 않음. 기존 internal endpoint 계약 유지 | **영향 없음** |
| `accounting.client.SlipServiceClient` | `/internal/slips/{id}/lines`, `/internal/slips/lines/{lineId}` | 요청 path 내부 UUID 및 별도 internal 응답 | 이번 public `SlipDetailResponse` serializer 경계를 소비하지 않음 | **영향 없음** |
| desktop `StockSlipDetailModal` | 수불부의 `slipNo/slipType` → `/slips/query` → `/slips/{opaque}` | token은 FE가 문자열로 전달 | 직전 fix의 opaque 요청/응답 계약 유지. 화면에는 token/UUID를 표시하지 않음 | **검증** |
| desktop `InboundInspectionDialog`/첨부 API | inventory inspection path의 `slipId` | 문자열 path 전달 | 이번 수불부 전표 상세 소비 경로와 별도. 기존 UUID/opaque path 계약 변경 없음 | **영향 없음** |

### 선택한 규약과 이유

경계를 넘는 값은 `slip-service`가 이미 도입한 **16-byte UUID → URL-safe Base64 without padding opaque token**으로 통일한다. 각 소비 서비스의 DB/도메인 모델은 UUID를 계속 사용하고, 소비자 adapter에서 token을 복원한다.

이 방향은 다음을 동시에 보존한다.

- 요청 URL·응답 본문의 UUID 0건
- inventory DB의 logical `slip_id UUID` 및 기존 서비스 메서드 계약
- 기존 UUID를 반환하는 legacy/내부 응답과의 하위 호환
- 사용자 화면에는 `slipNo`만 표시

`slip-service` 내부 구현을 inventory가 import하지 않도록 decoder를 inventory client 경계에 두고 알고리즘을 동일하게 미러링했다.

## RED → GREEN 원문

### RED

추가 테스트:

```text
SlipClientTest > getSlip_decodesSlipServiceOpaqueIdsAcrossTheServiceBoundary()
    com.samhanair.logis.common.exception.BusinessException at SlipClientTest.java:146

7 tests completed, 1 failed
BUILD FAILED
```

실패 원인은 기존 `UUID.fromString(data.id)`, `UUID.fromString(destinationWarehouseId)`, `UUID.fromString(lines[].id/productId)`가 opaque token을 파싱하지 못했기 때문이다.

### GREEN

```text
SlipClientTest — 18 tests completed, 0 failed
BUILD SUCCESSFUL in 12s
```

추가한 `OpaqueUuidDecoder`는 먼저 `UUID.fromString`을 시도하고, 실패할 때만 16-byte URL-safe Base64를 decode한다. 따라서 기존 UUID 응답과 직전 fix의 opaque 응답을 모두 처리한다.

## 불변식 재확인

| 불변식 | 재확인 결과 |
|---|---|
| 수불부 `2026/08/02-17` 클릭 가능 및 같은 전표 모달 | inventory `SlipClient` 경계 회귀 테스트에서 해당 `slipNo/slipType`가 복원되는 경로를 검증. 브라우저 재실측은 아래 미실행 항목 참조 |
| 전표 모달 요청 400/404/500 0건 | 이번 수정은 모달의 query/detail API를 변경하지 않음. slip-service 관련 3개 테스트 `BUILD SUCCESSFUL`; 최종 라이브 네트워크 전수는 아래 미실행 |
| 요청 URL·응답 본문 UUID 0건 | 직전 fix 계약 유지. 관련 slip-service `SlipControllerIT`, `SlipQueryPurchaseIT`, `SlipQueryRedesignIT` 통과 |
| QR/serialKey/실사/수불부 계산/태그/품목 단위/SHIPPED 잠금/serial_key 20건 | production 코드는 inventory client decoder와 테스트만 변경. 직전 liveQA2의 B5~B13 결과를 보존하며, 이번 라운드에 DB write/live 재실측은 하지 않음 |

## 검증 명령 및 결과

| 명령 | 결과 |
|---|---|
| `gradlew :services:inventory-service:test --tests ...SlipClientTest` | RED 후 GREEN, 18/18 통과 |
| `gradlew :services:inventory-service:test` | `BUILD SUCCESSFUL` (132.9초) |
| `gradlew :services:slip-service:test --tests SlipControllerIT --tests SlipQueryPurchaseIT --tests SlipQueryRedesignIT` | `BUILD SUCCESSFUL` (57초) |
| `clients/desktop/npm run typecheck` | 통과(exit 0). 기존 real-QA scope 경고 출력은 있었으나 테스트 51/51 통과 |
| slip-service 전체 `test` | 이번 라운드에는 전체가 아닌 관련 3개 테스트만 실행. 전체 120초 timeout 제약은 적용하지 않음 |

## 못 한 것

- 격리 DB/서비스를 다시 기동한 브라우저 liveQA를 이번 라운드에 실행하지 않았다. 따라서 모달을 실제 클릭한 뒤의 네트워크 요청 전수와 캡처는 새로 만들지 않았다.
- 공유 DB write는 하지 않았다.
- slip-service 전체 test suite는 실행하지 않았다. 관련 변경 범위 테스트만 실행했다.

## 라운드 종료 점검

```text
삭제된 추적 파일: 0건 (`git ls-files --deleted` 빈 결과)
tools/.s24-build-only/build/deep/tracked-writer.mjs: exists=True
sol999-liveqa2/999 이름 격리 컨테이너: 없음
이번 라운드가 만든 격리 임시 디렉터리: 없음
이번 라운드의 Gradle/테스트 프로세스: 종료됨
```

한 줄 점검: **삭제된 추적 파일 0건, `tools/.s24-build-only/build/deep/tracked-writer.mjs` 존재, 격리 컨테이너·임시 디렉터리·이번 라운드 프로세스 잔여 없음.**
