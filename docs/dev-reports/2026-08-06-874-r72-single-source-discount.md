# R72 · #874 단가 할인 단일 계산 권위

## 결론

할인 계산 권위는 화면으로 고정했다. 화면이 최종 단가와 `discountInfo`를 만들고, 서버는 요청으로 받은 단가와 설명을 그대로 저장한다. 따라서 화면값과 저장값은 같은 값이다.

## R71 수치 진단

1. 화면은 품목 선택 시 `clients/desktop/src/renderer/routes/SlipFormPage.tsx`의 `applyProductSelection`에서 `calculateSlipDiscount` 결과를 입력 단가로 반영하고, 저장 payload의 `unitPrice`에도 그 값을 보냈다. 고정DC 품목과 전역DC 품목은 이 단계에서 서로 다른 값이 될 수 있었다.
2. 서버는 `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java`에서 요청 `unitPrice`를 `SlipDiscountCalculator`에 `listPrice`로 넘겼고, `DiscountPriceClient`를 통해 다시 `dc-config-service`에 계산을 요청했다. 서버는 받은 값을 그대로 쓰지 않았다.
3. `494,802`는 고정DC 화면값 `970,200`이 서버의 정가 입력으로 재해석되어 전역DC 49%가 한 번 더 적용된 결과다.

## 원인

- 전역DC 미적용: `clients/desktop/src/renderer/utils/slipDiscount.ts`가 `fixedDiscountRate=0`을 고정DC가 설정된 것으로 판정해 0% 고정DC에서 종료했다. 0은 미설정과 같은 입력으로 처리해야 한다.
- 중복 적용: 화면에서 이미 계산한 단가를 서버가 다시 DC 계산기에 넣었다.
- 최근단가 경합: 전역/고정DC 결과가 있는 경우에도 비동기 최근단가가 뒤에서 덮어쓸 수 있었다.

## 변경

- `fixedDiscountRate`는 유효하고 0보다 클 때만 고정DC로 처리한다. 0/null은 전역DC 후보로 남긴다.
- 전역 또는 고정DC 결과가 있으면 해당 결과를 최근단가보다 우선해 화면 최종값으로 사용한다.
- 저장 서버는 `req.lines[].unitPrice`를 그대로 `calculatedPrices`로 사용하며 DC RPC를 호출하지 않는다. 요청 `discountInfo`도 그대로 보존한다.

## 불변식 대조

| 사례 | 화면/저장 최종 단가 |
|---|---:|
| `AR09TXEAAWKNEU-04`, 1,080,000, 전역DC 48% | 561,600 |
| `MCU-S6NDB1N`, 1,617,000, 고정DC 40% | 970,200 |
| 전역DC 없는 거래처 | 정가 |

HTTP 201 저장 경로와 `discountInfo` 전달 경로는 유지했다. UUID를 추가하거나 노출하지 않았다.

## RED → GREEN 검증

RED 원문:

```text
expected { unitPrice: 561600, rate: 48, source: 'GLOBAL' }
to match object
Received { unitPrice: 1080000, rate: 0, source: 'FIXED' }
```

GREEN:

```text
npx vitest run src/renderer/utils/slipDiscount.test.ts src/renderer/routes/SlipFormPage.test.tsx
5 tests passed; 62 tests passed

./gradlew.bat :services:slip-service:test --tests 'com.samhanair.logis.slip.service.SlipServiceTest' --no-daemon
BUILD SUCCESSFUL
```

화면값과 저장값이 같은지: 서버가 화면 payload의 `unitPrice`를 재계산하지 않으므로 동일하다.

## 새 파일

- `docs/dev-reports/2026-08-06-874-r72-single-source-discount.md`
