# PR #1265 fix 라운드 1 라이브 검증 보고

판정: 이번 라운드에서 A·B를 완료하지 못했고 C는 백엔드 bootstrap 데이터만 확인했을 뿐 인증된 품목 화면 행 증명에는 실패했다. 따라서 결함 0으로 닫지 않는다.

## 1. 기동 방법

- 공유 컨테이너는 중지·변경하지 않았다. 격리 PostgreSQL `codex1265-fix-pg`를 `127.0.0.1:15470`으로 기동하고 `slip_db`, `partner_order_db`만 생성했다.
- 브랜치 JAR를 Gradle로 먼저 빌드했다.
  - `./gradlew :services:slip-service:bootJar :services:partner-order-service:bootJar --no-daemon`
  - 결과: `BUILD SUCCESSFUL`
- 브랜치 서버 포트: slip `28086`, partner-order `28088`.
- `SAMHAN_GATEWAY_ATTESTATION`은 `infrastructure/.env.local` 값을 주입했다. auth-service는 격리 기동하지 않았다.
- 웹: estimate `5183`, order `5180`.
- 캡처 경로: `docs/qa/1265-fix-round1-live/`.

## 2. A — 금액 세 지점 실측

미완료. 최초 생성 → 가격수정 → 일마감까지 같은 한 건을 실제 웹에서 끝까지 태우지 못했다. 따라서 공급가/VAT/합계의 세 지점 숫자를 PASS로 보고하지 않는다.

레거시 원문 대조:

`tools/legacy-gas/거래처 발송 주문서/Code.js:2122-2127`

```js
const priceVat = Math.round(Number(it.price)||0);
const total = priceVat * qty;
const sup = Math.round(Math.abs(total)/1.1);
const vat = Math.abs(total) - sup;
const supply = total<0 ? -sup : sup;
const vatAmt = total<0 ? -vat : vat;
```

`tools/legacy-gas/종합견적서/Code.js:1849-1855`도 동일하게 `Math.round(Math.abs(total) / 1.1)` 후 차액을 VAT로 계산한다.

## 3. 공통 계산기 sweep 및 RED 원문

사용처 전수는 다음 2개 생산 경로였다.

- `services/slip-service/src/main/java/.../SlipLine.java:546-547`
- `services/slip-service/src/main/java/.../DailyClosingAmountUpdateService.java:88-89`

RED 원문 1:

```text
./gradlew :shared:common:test --tests '*VatInclusiveUnitAmountCalculatorTest' ...
VatInclusiveUnitAmountCalculatorTest ... FAILED
expected: 1819
 but was: 1820
```

RED 원문 2 (계산기 임시 변경 후 확인):

```text
SlipLineAmountContractTest ... 단가 105원, 수량 2 FAILED
SlipLineAmountContractTest ... 단가 105원, 수량 3 FAILED
SlipLineAmountContractTest ... 단가 999999999원, 수량 3 FAILED
SlipLineAmountContractTest ... VAT포함_단가를_먼저_원단위_반올림한_뒤_수량을_곱한다 FAILED
SlipLineAmountContractTest ... 단가_변경도_저장_후_재조회할_금액을_같은_계약으로_계산한다 FAILED
```

두 기존 테스트 계약이 충돌한다. common은 총액축(`1000.49×2 → 1819/182/2001`), slip은 단가축(`105×2 → 190/20/210`)을 요구한다. 테스트를 변경하지 않았고, 임시 코드 변경도 원복했다. 이 축은 PM의 재결정 없이는 PASS 처리하지 않는다.

## 4. C — 인증된 주문서웹

백엔드 직접 응답은 인증 헤더와 격리 partner-order `28088`에 대해 다음과 같이 확인했다.

```text
homemulti=107
singleSets=224
singleParts=1447
commercialMulti=382
commercialParts=137
oldProducts=39
```

따라서 원인은 데이터 부재가 아니라 최초 실행에서의 서비스 discovery 설정이었다. `product-service` 인스턴스가 없어 fallback 빈 payload가 되었고, `spring.cloud.discovery.client.simple.instances.product-service[0].uri=http://127.0.0.1:8084`로 격리 JAR를 재기동한 뒤 payload가 채워졌다.

그러나 실제 인증 UI 캡처를 직접 열어 확인한 PNG는 `QA 전용 주문서 거래처 ... 환영합니다` 화면으로, 품목 표에 진입하지 않았다. 화면 행 수는 `0`이며, 이 캡처는 품목 증거가 아니므로 C PASS로 세지 않는다.

## 5. B — 원천 추적

미완료. 전표 상세 화면에서 원천 견적·주문이 보이는 실제 캡처와 기존 27건의 재조회 채움률을 확보하지 못했다. 따라서 추적률은 `검증 전 0/27`, `검증 후 미확정`으로 기록한다. 새 데이터만 채워지는지 기존 행도 채워지는지도 미확정이다.

## 6. 잃으면 안 되는 것 재현

요청된 견적 웹 28행 금액 `28/28`, 소수부 `0/28`, 품목·카테고리·옵션 `4/4`의 전체 재현은 미완료다. 이번 라이브에서 확인한 partner bootstrap 상품 배열은 위의 107/224/1447/382/137/39건이며, 이는 견적 웹 28행 회귀 증거가 아니다.

## 7. 스크린샷

- `[order-authenticated.png](./order-authenticated.png)`: 인증 성공 후 환영 화면, 품목 표 행 `0`. 직접 열어 확인했다.
- 품목 탭 진입 및 행 수 캡처는 미완료다. 로그인 화면이나 빈 입력폼을 증거로 승격하지 않는다.

## 8. 못 한 것과 이유

- A: 같은 전표의 가격수정·일마감 UI 완료 및 숫자 캡처 미완료. 공통 계산기 계약 충돌을 발견해 금액 PASS를 주장하지 않았다.
- B: 전표 상세 원천 문자열 및 기존 27건 재조회 미완료.
- C: 백엔드 데이터 복구는 확인했으나 품목 탭 화면 클릭 후 행 캡처가 시간 내 완료되지 않았다.

## 9. 프로세스 회수

- 기동한 branch slip/partner-order JAR, estimate/order 웹 프로세스를 회수했다.
- 격리 컨테이너 `codex1265-fix-pg`를 제거했다.
- 포트 `28086`, `28088`, `5180`, `5183` 리스너를 확인 후 종료했다.
- 공유 컨테이너 24개는 그대로 두었다.
- `.pid`/`.log`는 저장소에 생성하지 않았다. 실행 로그는 `C:\temp\codex1265-live`에 남아 있으며 커밋 대상이 아니다.

## 10. git status --porcelain 원문

```text
?? docs/qa/1265-fix-round1-live/
```

커밋·push·add는 수행하지 않았다.
