# DPS 입고비교 — 대상·헤더·금액 대조 QA 보고서

## ① RED 원문

RED-first로 실제 DPS 계약 테스트를 먼저 추가했다. 최초 실행은 기능 미구현으로 컴파일 실패했다.

```text
constructor DpsExcelRow ... cannot be applied
cannot find symbol: method matchByInbound(...)
cannot find symbol: AMOUNT_MISMATCH
cannot find symbol: deliveryNo()
cannot find symbol: totalAmount()
```

테스트 코드가 오타로 실패한 것이 아니라 새 계약(납품번호·합계금액·입고 매칭)이 존재하지 않아 실패한 원문이다.

## ② 대상 전환(INBOUND)

- `SlipServiceClient`의 비교 원천을 `getOutboundSlips`에서 `getInboundSlips`로 전환했다.
- slip-service에 `GET /internal/slips/inbound-lines`를 추가하고 `SlipType.INBOUND`만 조회한다.
- 기존 OUTBOUND endpoint는 다른 소비자 호환을 위해 유지했다.
- 입고 라인 wire 응답에 `totalAmount`를 추가했다. 공급가액과 부가세의 합이며 UUID는 포함하지 않는다.

## ③ 금액 대조

- DPS의 `합계`를 `BigDecimal`로 읽는다.
- 수량이 같아도 합계금액이 다르면 `AMOUNT_MISMATCH`로 분류한다.
- 허용 오차는 없다(`compareTo != 0`).
- 수량 불일치와 금액 불일치의 양방향 테스트를 추가했다. 수량·금액이 모두 같으면 mismatch가 없다.

## ④ 헤더 파싱

- 실제 DPS 헤더 9종을 fixture 형태로 테스트했다: 납품일자·납품번호·모델·수량·매입단가·공급가·인도처명·부가세·합계.
- 표지 3행 뒤의 헤더를 탐색한다. 첫 행 고정이 아니다.
- 기존 템플릿 헤더(품번·입고일자·수량·거래처코드·거래처명)는 fallback으로 계속 읽는다.
- 실제 DPS fixture 행 수 assertion: 1행.

## ⑤ 매칭 키

- 실제 DPS 형식은 `납품번호(적요) + 정규화 모델명`이다.
- 모델명은 공백 제거 및 대문자 정규화한다.
- DPS 행은 버킷 합산하지 않고 첫 미소비 행을 1:1 소비한다.
- 남은 DPS 행과 입고전표 미발견 행을 각각 mismatch로 반환한다.
- 날짜범위와 SLIP/ITEM 선택 UI, DPS 저장·복원 흐름은 유지했다.

## ⑥ GREEN

실행 결과:

```text
./gradlew :services:inventory-service:test --tests '*DpsExcelParserTest' --tests '*DpsCompareServiceTest'
BUILD SUCCESSFUL
20 tests completed

./gradlew :services:inventory-service:bootJar :services:slip-service:bootJar
exit 0

clients/desktop: npm run typecheck
exit 0 (real-QA 보조 테스트 51 pass)

clients/desktop: npm run lint
exit 0 (0 errors, 기존 warning 196)

clients/desktop: npm run build
exit 0
```

inventory/slip 전체 테스트 조합은 124초 실행 제한에 걸려 종료되었다. 따라서 전체 백엔드 테스트 green이라고 보고하지 않는다.

## ⑦ 라이브 캡처와 행 수

실제 격리 스택 기동 및 Browser live 캡처는 이번 실행에서 수행하지 못했다. 따라서 `resolveQaShotsDir()`를 경유한 live screenshot과 실제 업로드 행 수 캡처는 없음으로 판정한다. 자동 테스트의 실제 DPS fixture 행 수는 1행이며, 수량 동일·금액 상이 케이스를 자동 검증했다.

## ⑧ 프로세스 회수

이번 작업에서 새로 기동한 Docker 격리 컨테이너와 애플리케이션 프로세스는 없다. 공유 스택과 공유 DB를 건드리지 않았다. Gradle/npm 명령은 완료되었고 남겨 둔 작업용 프로세스는 없다.

정찰 보고서 `docs/dev-reports/2026-08-17-dps-inbound-compare-recon/report.md`는 이 워크트리에서 존재하지 않아 읽을 수 없었다.
