# S3 배차 그룹 UI 설계

## 목표

삼한퍼블릭 데스크톱에서 운송사 마스터와 가배차 후 배차 그룹 편입 흐름을 제공한다. 전송은 S4로 이관하므로 이번 라운드에는 전송 실행 UI/API를 만들지 않고 `transfer_status`만 읽기 전용으로 표시한다.

## 화면 배치

- `/admin/carriers`: 인사 > 운송사 목록 독립 화면. 운송사 CRUD와 code/name/아로로지스 여부/정산 거래처 연결/사용 여부를 관리한다.
- `/admin/dispatch-groups`: 배차 그룹 독립 화면. 지정일 기준 그룹 목록과 선택 그룹 상세를 함께 제공한다.
- `/arologis/pre-classify`: 기존 가배차 결과에서 배차 그룹 화면으로 이동하는 링크만 추가한다.

독립 화면을 선택한 이유는 그룹을 URL로 재진입할 수 있고, 구매전표 검색을 가배차 결과와 분리할 수 있으며, 가배차 화면의 계산·표시 책임을 훼손하지 않기 때문이다.

## 데이터 흐름

S1 API `/admin/carriers`와 `/admin/dispatch-groups`를 타입 있는 클라이언트로 감싼다. 판매전표는 S2 `/admin/dispatches/pre-classify` 결과에서 `slipNo`를 선택해 그룹 편입한다. 구매전표는 별도 활성 `INBOUND` 검색 API를 사용해 결과를 편입하며 가배차 API 결과에는 섞지 않는다. 화면은 응답의 업무 식별자만 표시하고 UUID는 내부 mutation path에만 사용한다.

## 안전 규칙

- 그룹 삭제는 담긴 전표가 있으면 API가 거부하므로 화면에서 사유를 함께 표시한다.
- 운송사 지정은 활성 운송사만 선택 가능하며 비활성 운송사가 이미 지정된 그룹은 사유 배지를 표시한다.
- `NOT_SENT` 등 전송 상태는 읽기 전용 배지로만 표시한다. 전송 버튼과 전송 mutation은 없다.
- `hr.carriers`는 프런트 키, 백엔드 `@RequirePermission`, permission catalog/mock catalog 세 층을 일치시킨다.

## 검증

API 계약 테스트와 mock handler를 함께 추가하고, 컴포넌트 vitest에서 미지정·비활성·전표 포함 상태의 이유 표시를 검증한다. `npm run typecheck`, 관련 vitest, Playwright mock 스위트를 실행한다. 구매전표 활성 건수는 착수 시 SQL 원문과 결과를 보고서에 기록한다.
