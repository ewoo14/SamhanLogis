# PR #1046 / 이슈 #1000 R7 — 잔여 코드 축 조회 전환

## 1. 범위와 결론

R6가 식별한 `StockInstanceService`의 `stock_instances.product_code` 문자열 조회 15곳을 다시 대조했다. 그중 코드 전용 7곳은 아래 표에서 각각 판정했으며, production 도달 가능했던 FIFO 후보와 회수 후보 2곳을 `productId` 우선 조회로 전환했다. ID 결과가 빈 경우에는 기존 코드 조회를 fallback으로 유지했다.

이번 변경은 `ProductService.java`를 수정하지 않았고, Docker 이미지 재빌드·checkout·commit·push·공유 DB write/DDL을 수행하지 않았다.

## 2. 15곳 전수 목록과 코드 전용 7곳 판정

문자열 조회 15곳의 현재 분류는 다음과 같다.

| # | 파일:줄 | 조회 | 분류/판정 |
|---:|---|---|---|
| 1 | `StockInstanceService.java:197` | ship 전 RESERVED, `product == null` | 코드 전용 — **불필요(그 경로는 legacy 행에 도달하지 않음)** |
| 2 | `StockInstanceService.java:204` | ship 후 SHIPPED, `product == null` | 코드 전용 — **불필요(그 경로는 legacy 행에 도달하지 않음)** |
| 3 | `StockInstanceService.java:220` | release RESERVED, `product == null` | 코드 전용 — **불필요(그 경로는 legacy 행에 도달하지 않음)** |
| 4 | `StockInstanceService.java:275` | RESERVED count fallback | ID 우선 fallback |
| 5 | `StockInstanceService.java:288` | 전표+상태 목록 fallback | ID 우선 fallback |
| 6 | `StockInstanceService.java:297` | AVAILABLE FIFO row-lock fallback | ID 우선 fallback |
| 7 | `StockInstanceService.java:306` | RECALLED count fallback | ID 우선 fallback |
| 8 | `StockInstanceService.java:314` | RECALLED 목록 fallback | ID 우선 fallback |
| 9 | `StockInstanceService.java:325` | SHIPPED 역-FIFO row-lock fallback | ID 우선 fallback |
| 10 | `StockInstanceService.java:393` | unrecall, `product == null` | 코드 전용 — **불필요(그 경로는 legacy 행에 도달하지 않음)** |
| 11 | `StockInstanceService.java:399` | unrecall fallback | ID 우선 fallback |
| 12 | `StockInstanceService.java:407` | resell, `product == null` | 코드 전용 — **불필요(그 경로는 legacy 행에 도달하지 않음)** |
| 13 | `StockInstanceService.java:413` | resell fallback | ID 우선 fallback |
| 14 | `StockInstanceService.java:460` | FIFO 후보 read API | 코드 전용 — **전환** |
| 15 | `StockInstanceService.java:479` | 회수 후보 read API | 코드 전용 — **전환** |

코드 전용 7곳만 별도로 판정하면 다음과 같다.

| 지점 | 판정 | 근거 |
|---|---|---|
| `:197` ship 전 RESERVED null 분기 | 불필요(그 경로는 legacy 행에 도달하지 않음) | `requireExistsByCode()` 정상 응답은 `ProductSummary`이며 null을 반환하는 production 분기가 없다. 현재 RESERVED 실표본도 0행이다. |
| `:204` ship 후 SHIPPED null 분기 | 불필요(그 경로는 legacy 행에 도달하지 않음) | 같은 null 도달 불가 근거. legacy SHIPPED 1행의 문자열 false-negative는 확인됐지만 정상 production 호출은 해당 null 분기에 진입하지 않는다. |
| `:220` release RESERVED null 분기 | 불필요(그 경로는 legacy 행에 도달하지 않음) | `requireExistsByCode()` null 도달 불가. 현재 RESERVED 실표본 0행이다. |
| `:393` unrecall null 분기 | 불필요(그 경로는 legacy 행에 도달하지 않음) | `requireExistsByCode()` null 도달 불가. 현재 RECALLED 실표본 0행이다. |
| `:407` resell null 분기 | 불필요(그 경로는 legacy 행에 도달하지 않음) | `requireExistsByCode()` null 도달 불가. 현재 RECALLED 실표본 0행이다. |
| `:460` FIFO 후보 | 전환 | controller GET `/fifo`에서 직접 호출되며 product 해소가 없었다. 현재키 0행, legacy AVAILABLE 1행이므로 productId 우선이 필요하다. |
| `:479` 회수 후보 | 전환 | controller GET `/recall`에서 직접 호출되며 product 해소가 없었다. 현재키 0행, legacy SHIPPED 2행이므로 productId 우선이 필요하다. |

따라서 7곳 중 판정 누락은 0곳이다. `:460`과 `:479`는 `ProductClient.requireExistsByCode()`로 UUID를 해소하고, ID 조회가 빈 경우에만 기존 코드 조회를 실행한다.

## 3. RED — production 두 경로의 결함 재현

### 3.1 RED 테스트

`StockInstanceServiceOutboundTest`에 다음 두 테스트를 먼저 추가했다.

- `fifoCandidates_usesProductIdWhenExposedCodeDiffersFromStoredLegacyCode`: `productId`가 같고 저장 `productCode`가 legacy `010001`인 AVAILABLE 1행을, 노출키 `AR05TXEAAWKNEU-01`로 FIFO 조회한다.
- `recallCandidates_usesProductIdWhenExposedCodeDiffersFromStoredLegacyCode`: 같은 형태의 legacy SHIPPED 2행을 `PARTNER-1000` 역-FIFO 순서로 조회한다.

### 3.2 RED 실행 원문

실행:

```text
./gradlew.bat :services:inventory-service:test --tests com.samhanair.logis.inventory.service.StockInstanceServiceOutboundTest.fifoCandidates_usesProductIdWhenExposedCodeDiffersFromStoredLegacyCode --tests com.samhanair.logis.inventory.service.StockInstanceServiceOutboundTest.recallCandidates_usesProductIdWhenExposedCodeDiffersFromStoredLegacyCode --no-daemon
```

결과:

```text
StockInstanceServiceOutboundTest > fifoCandidates... FAILED
StockInstanceServiceOutboundTest > recallCandidates... FAILED
2 tests completed, 2 failed
BUILD FAILED
```

실패 원문은 두 테스트 모두 기존 코드 경로가 빈 목록을 반환한 것이었다.

```text
Expecting actual:
  []
to contain exactly (and in same order):
  [StockInstance@...]
```

회수 테스트의 동일 실패에는 기대 목록 2행이 표시됐다.

## 4. Fix

변경 파일은 세 개다.

1. `StockInstanceRepository.java`
   - `findByProductIdAndStatusOrderByReceivedAtAsc(UUID, status)` 추가
   - `findByOutboundPartnerCodeAndProductIdAndStatusOrderByOutboundAtDescIdAsc(partnerCode, UUID, status)` 추가
2. `StockInstanceService.java`
   - `fifoCandidates`: productId 조회 → 빈 결과에만 productCode fallback
   - `recallCandidates`: partnerCode+productId 조회 → 빈 결과에만 partnerCode+productCode fallback
3. `StockInstanceServiceOutboundTest.java`
   - legacy AVAILABLE 1행 및 legacy SHIPPED 2행 회귀 테스트 2개 추가

`ProductService.java` 및 기존 8개 ID 우선 fallback 지점은 수정하지 않았다.

## 5. GREEN

RED 테스트를 수정 후 동일 명령으로 재실행했다.

```text
BUILD SUCCESSFUL
2 tests completed, 0 failed
```

## 6. 불변식 1~5 실측 및 판정

### 1) 코드 전용 7곳 판정

위 2절 표에 7곳을 모두 열거했다. 판정은 `전환` 2곳, `불필요(그 경로는 legacy 행에 도달하지 않음)` 5곳이다. `의도적(코드 축이 맞음)` 판정 지점은 없다.

### 2) production 도달 2곳 legacy 행

R6 read-only 실측 기준은 다음과 같았다.

| 경로 | 현재 노출키 결과 | legacy 저장키 결과 | productId 결과 |
|---|---:|---:|---:|
| FIFO 후보 / AVAILABLE | 0 | 1 | 1 |
| 회수 후보 / SHIPPED | 0 | 2 | 2 |

이번 R7 회귀 테스트도 각각 legacy 행 1개와 2개를 productId 축으로 반환하는지 검증했고 GREEN이다. DB에는 write/DDL을 하지 않았으므로 새 합성 행을 추가하지 않았다.

### 3) 닫힌 축 회귀

R6 read-only 기준 CONFLICT는 `0/1,320`, 오선택은 `0행`이었다. R7 변경은 후보 read API 2곳과 해당 repository 조회 계약만 추가했으며, inventory 전체 테스트에서 failures/errors가 0이다. 기존 `productId` 축과 CONFLICT/오선택 측정 SQL은 수정하지 않았다.

### 4) 총괄 표현의 대상 목록

이 보고서에서 `15곳 전수`라고 한 대상은 2절의 `:197, :204, :220, :275, :288, :297, :306, :314, :325, :393, :399, :407, :413, :460, :479` 전체다. 그중 코드 전용 7곳은 `:197, :204, :220, :393, :407, :460, :479`이며, 판정은 2절 표에 전부 있다. `모든 문자열 경로가 전환됐다`고 주장하지 않는다. ID 우선 fallback 8곳과 불필요한 null 호환 분기 5곳을 구분했다.

### 5) 오선택

R6 read-only 기준 활성 stock_instances는 3행이며, 기대 productId 3행, wrong/null productId 0행이었다. reserve ID exact 1행, scope 제외 2행, recall ID 후보 2행, 잘못된 거래처 marker 0행이었다. R7 fix의 ID 조회 조건은 FIFO에서 `productId + status`, 회수에서 `partnerCode + productId + status`를 유지하므로 창고·상태·거래처 범위를 넓히지 않는다. 단위 GREEN 테스트의 반환 행도 기대 productId 및 상태/거래처로 구성했다.

## 7. 모듈 전체 테스트

fresh 실행 명령과 결과:

```text
./gradlew.bat :services/inventory-service:test --rerun-tasks --no-daemon
BUILD SUCCESSFUL in 3m
inventory: 546 tests, 0 failures, 0 errors, 1 skipped

./gradlew.bat :services/product-service:test --rerun-tasks --no-daemon
BUILD SUCCESSFUL in 3m 31s
product: 626 tests, 0 failures, 0 errors, 0 skipped
```

직전 기준 `inventory 544 / product 626` 대비 테스트 수는 줄지 않았다. inventory는 회귀 테스트 2개가 추가되어 546으로 증가했고 product는 626을 유지했다.

## 8. 파일별 변경량

`git diff --numstat` 기준(추가 +N / 삭제 −M):

| 파일 | 변경량 |
|---|---:|
| `services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/StockInstanceRepository.java` | **+8 / −0** |
| `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java` | **+15 / −4** |
| `services/inventory-service/src/test/java/com/samhanair/logis/inventory/service/StockInstanceServiceOutboundTest.java` | **+39 / −0** |
| `docs/dev-reports/2026-08-02-1000-r7-remaining-code-axis-fix.md` | **+164 / −0** (새 파일) |

수정 파일 3개 합계는 **+62 / −4**다. 새 보고서까지 포함한 작업 트리 변경량은 **+226 / −4**다. 새 보고서 파일은 기존 R6 보고서를 덮어쓰지 않고 별도로 추가했다.

## 9. 새 파일 경로 목록

```text
docs/dev-reports/2026-08-02-1000-r7-remaining-code-axis-fix.md
```
