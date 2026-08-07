# PR #1077 / Issue #1069 — R33 요청·응답 원문 계측 보고

## 결론

R32의 두 갈래 중 실제 값은 **요청 `unitPrice=1,590,000`**이었다. 따라서 FE가 할인가를 계산하지 못한 결함은 아니다.

다만 거래처 전환의 단일 `POST /slips/expand-line` 응답 원문은 구성행 합계 `1,660,000`을 반환했다. 화면도 `1,660,000`으로 남았다. 원인은 실행 중 서비스 경계가 요청의 할인 단가를 응답 재배분에 반영하지 않는 것이다.

R30의 지연 응답 경쟁은 이번 경로의 원인이 아니다. 전환 시 `/slips/expand-line` 호출은 1회였고, 해당 1회 응답 자체가 원단가였다.

## 실행 조건

- renderer: `http://localhost:5199`
- 계정: `dev_manager`
- 품목: `AC060CS6PBH1SY` (`delivery_price=1,660,000`)
- 최초 거래처: `1023108393`
- 전환 거래처: `2568700899` / 주식회사 제이앤피공조 / `threeSixty=₩70,000`
- 컨테이너 재빌드·재기동: 하지 않음
- 제품 번들 재빌드: 하지 않음

## 전환 전 최초 전개 원문

요청 본문:

```json
{"parentModelCode":"AC060CS6PBH1SY","quantity":1,"unitPrice":"1660000"}
```

응답 본문:

```json
{"success":true,"code":"OK","message":"성공","data":[{"productId":"699ea2b8-825a-4451-b4e3-56abf6dcde1f","modelCode":"AC060CN6PBH1","modelName":"AC060CN6PBH1","name":"360 CST UV 실내기","quantity":1.0,"unitPrice":616975,"componentKind":"INDOOR","setHead":true,"specification":"싱글 360"},{"productId":"03f6f413-a559-44d0-a202-097b647f0d45","modelCode":"AC060CXAPBH1","modelName":"AC060CXAPBH1","name":"360 CST UV 실외기","quantity":1.0,"unitPrice":925050,"componentKind":"OUTDOOR","setHead":false,"specification":"싱글 360"},{"productId":"910a1efe-fa11-4bbf-9442-ee4f8acd01be","modelCode":"PC6NUNK1NW","modelName":"PC6NUNK1NW","name":"판넬 (360CST / 원형 / WIFI)","quantity":1.0,"unitPrice":104060,"componentKind":"PANEL","setHead":false,"specification":"원형노출"},{"productId":"4affd72c-0638-468c-8f06-14c5e6185663","modelCode":"AR-EH05","modelName":"AR-EH05","name":"무선리모컨(냉난방전용)","quantity":1.0,"unitPrice":13915,"componentKind":"REMOTE","setHead":false,"specification":"무선냉난방"}],"timestamp":"2026-08-06T19:37:08.363237201Z"}
```

구성행 합계: `616,975 + 925,050 + 104,060 + 13,915 = 1,660,000`.

## 거래처 전환 단일 호출 원문

전환 직후 발생한 `/slips/expand-line` 호출은 **1회**였다.

요청 본문 원문:

```json
{"parentModelCode":"AC060CS6PBH1SY","quantity":1,"unitPrice":"1590000"}
```

응답 본문 원문:

```json
{"success":true,"code":"OK","message":"성공","data":[{"productId":"699ea2b8-825a-4451-b4e3-56abf6dcde1f","modelCode":"AC060CN6PBH1","modelName":"AC060CN6PBH1","name":"360 CST UV 실내기","quantity":1.0,"unitPrice":616975,"componentKind":"INDOOR","setHead":true,"specification":"싱글 360"},{"productId":"03f6f413-a559-44d0-a202-097b647f0d45","modelCode":"AC060CXAPBH1","modelName":"AC060CXAPBH1","name":"360 CST UV 실외기","quantity":1.0,"unitPrice":925050,"componentKind":"OUTDOOR","setHead":false,"specification":"싱글 360"},{"productId":"910a1efe-fa11-4bbf-9442-ee4f8acd01be","modelCode":"PC6NUNK1NW","modelName":"PC6NUNK1NW","name":"판넬 (360CST / 원형 / WIFI)","quantity":1.0,"unitPrice":104060,"componentKind":"PANEL","setHead":false,"specification":"원형노출"},{"productId":"4affd72c-0638-468c-8f06-14c5e6185663","modelCode":"AR-EH05","modelName":"AR-EH05","name":"무선리모컨(냉난방전용)","quantity":1.0,"unitPrice":13915,"componentKind":"REMOTE","setHead":false,"specification":"무선냉난방"}],"timestamp":"2026-08-06T19:37:15.259551159Z"}
```

구성행 합계: `616,975 + 925,050 + 104,060 + 13,915 = 1,660,000`.

라이브 화면도 전환 후 다음 값을 표시했다.

```text
총 ₩1,660,000
단가: 616,975 / 925,050 / 104,060 / 13,915
```

## 원인 대조

저장소 소스의 계약은 다음과 같이 분리되어 있다.

- FE `clients/desktop/src/renderer/api/slip.ts`: `/slips/expand-line` 요청 필드 `unitPrice`
- slip-service `SlipLookupController`: 요청 `unitPrice`를 product-service 호출의 `setUnitOverride`로 전달
- product-service `BundleExpander`: `setUnitOverride`가 있으면 이를 재가격 base로 사용

하지만 현재 실행 중인 서비스 경계에서는 위 요청이 실제 응답 재배분에 반영되지 않았다. 검증을 위해 `setUnitOverride`를 FE endpoint에 직접 보내면 실행 중 `/slips/expand-line`이 `400`을 반환했다. 따라서 FE 필드명을 임의로 바꾸거나, FE에서 BundleExpander의 4:6/6:4·천원 정렬을 복제하는 수정은 하지 않았다.

이 상태에서 안전한 다음 조치는 실행 중 slip-service/product-service의 배포 계약을 R29 소스와 일치시키는 것이다. 이번 라운드에서는 컨테이너 재빌드·재기동 금지 조건 때문에 이를 수행할 수 없다.

## R30 판정

R30은 유지 제안한다. 이번 전환 경로의 호출 수가 1회이고, 그 1회 응답 본문 자체가 `1,660,000`이므로 R30이 고친 경쟁 조건은 관측된 원인이 아니다. 다만 R30을 되돌려도 이 서버 경계 불일치는 해결되지 않는다.

## 산출물

- `docs/dev-reports/2026-08-07-1069-r33-request-payload.md`
- `docs/qa/1069-bundle-expansion-real-qa/screenshots/r33-before-switch.png`
- `docs/qa/1069-bundle-expansion-real-qa/screenshots/r33-after-switch.png`

임시 R33 QA 드라이버는 실행 후 삭제했다. 제품 코드와 테스트 코드는 변경하지 않았다.
