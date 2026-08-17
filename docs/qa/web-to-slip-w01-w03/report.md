# 웹→전표 W-01·W-03 검증 보고서

## ① RED 원문

정찰 보고서 경로 `docs/dev-reports/2026-08-17-web-to-slip-recon/report.md`는 이 워크트리에 존재하지 않아 읽을 수 없었다. 사용자 제공 정찰 결과를 기준으로 계약 테스트를 먼저 추가했다.

- 주문 RED: `bundleSetOptions`와 `productName`을 기대했으나 confirm payload에서 누락됨.
- 견적 RED: bridge 입력에 `PROD_DES`·카테고리·옵션을 넣어도 전표 라인에 전달되지 않음.
- 실행 환경 RED: 최초 실행은 estimate-app `jest` 미설치로 실패했고, 각 앱 `npm ci` 뒤 기능 결함을 재현했다.

## ② 웹 전달 추가(W-01)

- 견적 웹 행의 `name/productName`을 `PROD_DES`로 전달한다.
- `categoryKey`를 section별 키로 함께 전달한다.
- 견적 bridge는 `productName`, `categoryKey`를 전표 라인에 그대로 매핑한다.
- 주문 confirm은 `name/productName`, 명시 `categoryKey`를 보존한다.

## ③ 옵션 전달(W-03)

- 주문·견적 웹에서 `panelOption`, `remoteOption`, `panelShape360`, `remoteExcluded`, `materialIncluded`를 구성한다.
- 주문 confirm DTO와 partner-order line JSONB snapshot을 추가했다.
- partner-order 변환 payload와 slip publish DTO가 옵션을 전달하고, slip line에 저장한다.
- 미선택 입력은 기존 payload 기본 동작을 유지한다.

## ④ GREEN

- estimate-app 전체: 21 suites / 362 tests 통과.
- order-app 전체: 24 files / 258 tests 통과.
- slip-service bootJar: 성공.
- partner-order-service + slip-service bootJar: 성공.
- desktop typecheck: 성공.
- desktop build: 성공.
- desktop lint: 실행 완료. 기존 저장소 경고가 있었으나 종료 코드는 성공.
- order-app typecheck: 성공.
- order-app lint: 기존 `orderFlowRegression.test.ts` 정규식 공백 오류 2건으로 실패(이번 변경 파일 아님).

## ⑤ 채움률 before/after

정찰 기준 before:

- 주문 실데이터 7행: 품목명 1/7, 카테고리 0/7, 전체 일치 0/7.
- 옵션 JSON 364건: `panelOption`·`remoteOption` 전부 null.

after:

- 자동 계약 테스트에서 웹 값이 productName/category/options로 전달되는 경로를 검증했다.
- 실제 공유 DB 전표를 생성하지 않았으므로 실데이터 after 채움률은 산출하지 않았다.

## ⑥ 라이브 캡처와 행 수

공유 DB에 전표를 만들지 않는 안전 조건 때문에 라이브 전표 생성과 캡처는 수행하지 않았다. 따라서 캡처 행 수는 0건이며, `-real-qa` 산출물도 생성하지 않았다.

## ⑦ W-02 무손상 확인

W-02 금액 계산 코드는 수정하지 않았다. 견적 bridge와 주문 전달 계약만 확장했고, slip-service 기존 VAT/금액 계산 경로는 보존했다. slip-service 및 partner-order-service bootJar가 성공했다.

## ⑧ 프로세스 회수

서버·공유 스택·컨테이너는 기동하지 않았다. 회수 대상 잔여 프로세스/격리 컨테이너: 0/0.

커밋·push·git add는 수행하지 않았다.
