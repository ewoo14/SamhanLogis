# R29 — 서버 계측 후 fix (PR #1077 / 이슈 #1069)

## 결론

`BundleExpander.expand()` 서버 경계는 R28의 `unitPrice=1,590,000` override를 정상 수신하고, `SINGLE_SET` 구성행 합계도 `1,590,000`으로 반환했다. `setUnitOverride`가 없을 때는 `deliveryPrice=1,660,000`을 사용해 구성행 합계 `1,660,000`을 반환했다.

따라서 PM이 제시한 `indoor.isEmpty() || outdoor.isEmpty()` 조기 return 가설은 기각한다. AC060 실측은 indoor 1개/outdoor 1개이며 조기 return하지 않는다. 이 서버 호출의 ⑦ 결과가 이미 정확하므로, 화면에서 1,660,000을 보게 된 별도 셋째 가능성은 응답 이후 경로 또는 다른 호출(override 누락)이다.

이번 fix는 재배분 불가능한 `SINGLE_SET` 구성에서 클라이언트가 `setUnitOverride`를 명시한 경우 `INVALID_INPUT`으로 호출자에게 드러내도록 했다. override 없는 레거시 fixture/호출은 기존 원단가 동작을 보존했다. `COMMERCIAL_MULTI` 분기와 4:6/6:4 및 천원 정렬 규칙은 변경하지 않았다.

## 1. 계측 원문 ①~⑦

계측 코드는 `BundleExpander`에 `[R29-INSTRUMENT]` marker로 추가했다. product-service를 2026-08-07 03:54 JST에 계측 버전으로 재빌드·재기동한 뒤, 2026-08-07 03:58 JST에 동일 호출을 다시 실행했다.

### RED-A — AC060CS6PBH1SY / setUnitOverride=1,590,000

```text
2026-08-07T03:58:45.410+09:00 [R29-INSTRUMENT] ① parent=AC060CS6PBH1SY opts.setUnitOverride=1590000 ② setUnit=1590000 ③ category=SINGLE_SET
2026-08-07T03:58:45.432+09:00 [R29-INSTRUMENT] ④ picked parent=AC060CS6PBH1SY parts=AC060CN6PBH1/INDOOR/0, AC060CXAPBH1/OUTDOOR/0, PC6NUNK1NW/PANEL/104060, AR-EH05/REMOTE/13915
2026-08-07T03:58:45.433+09:00 [R29-INSTRUMENT] ⑤ parent=AC060CS6PBH1SY indoor=1 outdoor=1 fixed=2 indoorCodes=AC060CN6PBH1 outdoorCodes=AC060CXAPBH1 fixedCodes=PC6NUNK1NW,AR-EH05
2026-08-07T03:58:45.433+09:00 [R29-INSTRUMENT] ⑥ redistributed parent=AC060CS6PBH1SY indoorTotal=588975 outdoorTotal=883050
2026-08-07T03:58:45.434+09:00 [R29-INSTRUMENT] ⑦ result parent=AC060CS6PBH1SY unitSum=1590000
```

HTTP 응답 구성행 합계: `1,590,000`.

### RED-B — AC060CS6PBH1SY / setUnitOverride 없음

```text
2026-08-07T03:58:45.525+09:00 [R29-INSTRUMENT] ① parent=AC060CS6PBH1SY opts.setUnitOverride=null ② setUnit=1660000 ③ category=SINGLE_SET
2026-08-07T03:58:45.537+09:00 [R29-INSTRUMENT] ④ picked parent=AC060CS6PBH1SY parts=AC060CN6PBH1/INDOOR/0, AC060CXAPBH1/OUTDOOR/0, PC6NUNK1NW/PANEL/104060, AR-EH05/REMOTE/13915
2026-08-07T03:58:45.538+09:00 [R29-INSTRUMENT] ⑤ parent=AC060CS6PBH1SY indoor=1 outdoor=1 fixed=2 indoorCodes=AC060CN6PBH1 outdoorCodes=AC060CXAPBH1 fixedCodes=PC6NUNK1NW,AR-EH05
2026-08-07T03:58:45.539+09:00 [R29-INSTRUMENT] ⑥ redistributed parent=AC060CS6PBH1SY indoorTotal=616975 outdoorTotal=925050
2026-08-07T03:58:45.539+09:00 [R29-INSTRUMENT] ⑦ result parent=AC060CS6PBH1SY unitSum=1660000
```

HTTP 응답 구성행 합계: `1,660,000`.

### 조기 return 판정

AC060은 ⑤에서 indoor 1/outdoor 1로 분류됐다. 따라서 `indoor.isEmpty() || outdoor.isEmpty()`는 false이고 ⑥ 조기 return은 발생하지 않았다. 해당 가설은 틀렸다.

## 2. 새로 가능해진 조합과 결과

| 조합 | 결과 |
|---|---|
| `SINGLE_SET` + explicit override + indoor/outdoor 모두 존재 | 기존 재배분, 구성행 합계가 override와 동일 |
| `SINGLE_SET` + override 없음 + indoor/outdoor 모두 존재 | `deliveryPrice` 기준 기존 재배분 유지 |
| `SINGLE_SET` + explicit override + indoor 또는 outdoor 없음 | `BusinessException(INVALID_INPUT)`으로 거부. 원단가 조용한 유지 금지 |
| `SINGLE_SET` + override 없음 + indoor 또는 outdoor 없음 | 레거시 동작 보존: 기존 원단가 유지 |
| `COMMERCIAL_MULTI` + override 없음 | 재배분 없음, AM360 실측 `10,821,635` 유지 |

실제 HTTP 결과:

```text
RED-A  AC060CS6PBH1SY  lines=4  sum=1590000
RED-B  AC060CS6PBH1SY  lines=4  sum=1660000
COMM   AM360AXVGHC1SY  lines=2  sum=10821635
```

## 3. 변경 파일 및 테스트

변경 파일:

- `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java`
  - R29 계측 로그 추가
  - explicit `setUnitOverride`에서 재배분 불가능 구성 오류 노출
- `services/product-service/src/test/java/com/samhanair/logis/product/it/BundleExpanderIT.java`
  - 실외기 없는 구성의 명시 단가 요청이 `BusinessException`이 되는 RED-first 테스트 추가

RED 확인:

```text
BundleExpanderIT.싱글세트_실외기없는_구성은_원단가를_조용히_유지하지_않고_거부한다
→ 기존 조기 return 때문에 AssertionError (1 test failed)
```

GREEN 확인:

```text
./gradlew :services:product-service:test \
  --tests com.samhanair.logis.product.it.BundleExpanderIT \
  --tests com.samhanair.logis.product.web.ProductInternalControllerTest \
  --tests com.samhanair.logis.product.web.ProductInternalLookupByModelTest \
  --no-daemon
→ BUILD SUCCESSFUL, 36 tests completed, 0 failed
```

전체 테스트 스위트는 실행하지 않았다.

## 4. 재빌드·재배포

- 2026-08-07 03:54 JST: 계측 버전 `:services:product-service:bootJar` 성공.
- 2026-08-07 03:54 JST: `infrastructure-product-service` 이미지 재빌드 및 `samhan-product-service` 단독 force-recreate 재기동.
- 2026-08-07 03:58 JST: fix 반영 버전 `:services:product-service:bootJar` 성공.
- 2026-08-07 03:58 JST: `infrastructure-product-service` 이미지 재빌드 및 `samhan-product-service` 단독 force-recreate 재기동.
- 다른 서비스 컨테이너는 재빌드·재시작하지 않았다.

