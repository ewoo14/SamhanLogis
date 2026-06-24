# 2026-06-24 타배송사 SMS 발송 슬3 개발 리포트

## 요약

- `slip-service`에 `external_dispatch`/`external_dispatch_slip` V50 이력 테이블과 JPA 도메인/Repository를 추가했다.
- `POST /admin/external-dispatches`는 `dispatch.board` CREATE 권한으로 동작하며, 검수완료 + `UNDISPATCHED` 출고전표만 외부기사/배송사 1명에게 SMS 발송한다.
- notification-service 내부 계약(`/internal/notifications/send`, `EXTERNAL_PHONE` + `SMS`)을 재사용하고, 2xx 성공 시 전표를 `DISPATCHED`로 종료한다.
- 실패 시 `external_dispatch.status=FAILED`만 보존하고 전표 상태는 유지해 재시도 가능하게 둔다.
- desktop 배차 보드 발송대기 목록에 전표 다중 선택, 외부기사/배송사 선택 모달, mock 핸들러, 모델 테스트를 추가했다.

## 3-layer 문서화

### 1. 한국어 Javadoc / 주석

- `ExternalDispatch`, `ExternalDispatchSlip`, channel/status enum에 UUID 비노출과 단방향 발송 정책을 주석화했다.
- `Slip.markDispatchedExternally()`에 타배송사 직접 발송 전이와 중복 발송 가드를 설명했다.
- `NotificationClient.sendExternalSmsWithResult()`에 SENT/FAILED 판정 기준을 명시했다.

### 2. API / 계약

- `POST /admin/external-dispatches`
  - request: `carrierId`, `slipIds`, `channel=SMS`
  - permission: `dispatch.board` + `CREATE`
  - response: `carrierName`, `channel`, `dispatchDate`, `sentAt`, `status`, `slipCount`, `slipNos`
- notification 계약 테스트는 `recipientType=EXTERNAL_PHONE`, `channel=SMS`, `recipientAddress`, `X-Internal-Token`을 고정한다.

### 3. 운영/개발 노트

- 화면 식별자는 배송사명/전화번호/전표번호만 사용한다. UUID는 API payload와 내부 row key에만 남긴다.
- `PRINT`/`BOTH` enum은 정의했지만 실행 경로는 슬4 범위로 남긴다.
- gateway no-prefix route에 `/admin/external-dispatches`를 추가했다.
- fresh Postgres V50 probe와 Testcontainers IT 실행은 PM 환경에서 수행 예정이다.

## 위험 및 후속

- SMS 성공 후 DB 커밋 실패가 발생하면 외부 발송과 내부 이력이 불일치할 수 있다. 현재 구조는 기존 notification graceful 호출 패턴을 따른다.
- desktop modal은 SMS 고정 UX다. 슬4에서 PRINT/BOTH 채널 선택을 확장해야 한다.
- 실제 Aligo 발송은 notification-service 설정에 의존하므로 QA에서는 stub 또는 테스트 수신번호 정책을 명확히 해야 한다.
