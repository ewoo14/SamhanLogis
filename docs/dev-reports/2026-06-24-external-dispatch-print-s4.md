# Dev Report — 타배송사 인쇄 배차의뢰서 슬4

> 검수완료 → 배차발송 에픽 마지막 슬라이스. 슬1~4를 통해 검수완료 출고전표의 배차 발송 대기, 외부기사/배송사 마스터, 타배송사 SMS 발송, 인쇄 배차의뢰서까지 연결했다.

## 범위

- BE `ExternalDispatchService`를 `dispatch(CreateExternalDispatchRequest, sentBy)`로 일반화했다.
- 채널 정책:
  - `SMS`: 기존 SMS 발송 결과로 `SENT`/`FAILED` 기록.
  - `PRINT`: SMS 호출 없이 인쇄 출력물을 발송 수단으로 보고 `SENT` + 전표 `DISPATCHED`.
  - `BOTH`: SMS 발송 결과를 공식 상태로 기록하고 성공 시 전표 `DISPATCHED`, 실패 시 전표 미전이.
- `GET /admin/external-dispatches/{id}/print-data`를 추가했다. 권한은 기존 `dispatch.board` VIEW 재사용.
- desktop에 `/dispatch/external-dispatch/:id/print` 인쇄 라우트와 A4 `ExternalDispatchRequestDocument`를 추가했다.
- 배차 보드 타배송사 발송 모달에서 `SMS`/`PRINT`/`BOTH` 채널을 선택하고, PRINT/BOTH 성공 시 배차의뢰서 인쇄 화면으로 진입한다.
- Mock API도 동일 채널 정책과 print-data 조회를 지원한다.

## 계약

- Flyway 신규 없음. `external_dispatch.channel`의 `SMS`/`PRINT`/`BOTH`, `status`의 `SENT`/`FAILED`는 V50 기정의 enum을 사용한다.
- 권한 신규 시드 없음. 발송은 `dispatch.board` CREATE, 인쇄 데이터/라우트는 `dispatch.board` VIEW를 사용한다.
- gateway 신규 라우트 없음. `/admin/external-dispatches/**` 하위 경로를 재사용한다.
- 인쇄 응답 DTO와 HTML에는 내부 UUID를 포함하지 않는다. 사용자 노출 식별자는 배송사명, 기사/배송사 연락처, 전표번호, 배송지, 수령자, 수령자 연락처, 품목요약이다.
- 품목요약은 `ExternalDispatchSmsComposer.summarizeItems`를 공용화해 SMS 본문과 같은 대표 품목 + 총수량 기준을 사용한다.

## 3-layer 문서화

- 한국어 Javadoc/주석: 신규 DTO, 서비스 메서드, controller endpoint, FE 인쇄 컴포넌트에 UUID 비노출/채널 정책 주석을 추가했다.
- springdoc-openapi: controller의 `GET /admin/external-dispatches/{id}/print-data`가 기존 springdoc 스캔 대상에 포함된다.
- dev-report: 본 문서가 슬4 구현 범위, 계약, 검증 결과를 기록한다.

## 검증

- RED: `npm run test -- ExternalDispatchRequestDocument.test.ts ExternalCarrierDispatchModal.test.ts`에서 신규 문서 컴포넌트/피드백/인쇄 라우트 헬퍼 부재로 실패 확인.
- GREEN: 같은 Vitest 명령 11개 통과.
- `npm run typecheck` 통과.
- `./gradlew.bat :services:slip-service:compileJava :services:slip-service:compileTestJava` 통과.

## 미실행/위험

- Testcontainers IT는 Windows/JDK 경로 제약과 PM 실행 지시 때문에 직접 실행하지 않았다. `ExternalDispatchControllerIT`에는 PRINT, BOTH 성공, BOTH 실패, print-data UUID 비노출 케이스를 추가했다.
- 실제 인쇄 미리보기 라이브 캡처와 CSS 미세조정은 후속 QA/리뷰 라운드에서 개발책임자 이미지 피드백 기준으로 반복한다.
