# 종합견적서 / 주문서 Google Sheets 원본 데이터 검증

> 대상 spreadsheet: [종합 견적서](https://docs.google.com/spreadsheets/d/1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ/edit)  
> 목적: legacy GAS `종합견적서`, `거래처 발송 주문서`가 참조하던 Google Spreadsheet 데이터를 Samhan Public이 같은 source-of-truth로 읽는지 검증한다.

---

## 1. legacy GAS 원본 계약

| 앱 | 파일 | source tab |
| --- | --- | --- |
| 종합견적서 | `tools/legacy-gas/종합견적서/Code.js` | `홈멀티_단가인상`, `싱글 세트_단가인상`, `싱글 구성품_단가인상`, `상업멀티_단가인상`, `상업멀티 구성_단가인상`, `구형`, `거래처`, `담당자`, `추천실외기` |
| 거래처 발송 주문서 | `tools/legacy-gas/거래처 발송 주문서/Code.js` | `홈멀티`, `싱글 세트`, `싱글 구성품`, `상업멀티`, `상업멀티 구성`, `구형`, `거래처`, `담당자` |

주의: `종합견적서` tab 자체는 출력 양식이다. 모델/단가 원본 tab이 아니다.

---

## 2. connector 재검증 결과 (2026-05-16)

| range | 판정 |
| --- | --- |
| `종합견적서!A1:H20` | 출력 양식. 제목 `견 적 서`, header `품명/모델/단위/수량/출고가/납품가/소계` |
| `홈멀티_단가인상!A1:H12` | B열 모델명, D열 출고가, F열 납품가 |
| `싱글 세트_단가인상!A1:I12` | C열 모델명, E열 출고가, H열 납품가 |
| `상업멀티 구성_단가인상!A1:J12` | B열 모델명, D열 출고가, F열 납품가 |
| `거래처!A1:J8` | 거래처코드/담당자명/거래처명/대표자명/주소/전화번호/특이사항/그룹/여신한도/싱글 할인 |

---

## 3. Samhan Public 반영 지점

| service | 클래스 | 계약 |
| --- | --- | --- |
| product-service | `ProductSheetSyncService` | tab별 모델/가격 column mapping으로 Google Sheet를 DB cache에 sync |
| partner-order-service | `ProductCatalogLookupClient` | `*_단가인상` tab 우선, base tab fallback으로 modelCode 단가 lookup |
| partner-order-service | `BootstrapService` | 주문서 bootstrap payload는 base tab range-map을 formatted value로 prefetch |

`INTEGRATED_QUOTE_RANGE`는 비워 둔다. 별도 `modelCode/productName/unitPrice` 3열 flat catalog를 운영자가 만들었을 때만 override한다.

---

## 4. 자동 테스트

```powershell
.\gradlew.bat :services:partner-order-service:test --tests "*ProductCatalogLookupClientTest" --no-daemon --rerun-tasks
.\gradlew.bat :services:product-service:test --tests "*ProductSheetSyncServiceIT" --no-daemon --rerun-tasks
```

합격 기준:
- `ProductCatalogLookupClientTest`가 `종합견적서!A2:C`가 아니라 원본 tab에서 모델/단가를 찾는다.
- `ProductSheetSyncServiceIT`가 `싱글 세트` C열 모델명/H열 납품가와 `상업멀티 구성` F열 납품가를 그대로 읽는다.

---

## 5. 운영 runtime 검증

Service Account 키가 배치된 PC에서 다음 조건을 확인한다.

```powershell
$env:GOOGLE_SERVICE_ACCOUNT_KEY="$env:USERPROFILE\.samhan\sa-key.json"
.\gradlew.bat :services:product-service:test --tests "*ProductSheetSyncServiceIT" --no-daemon
```

실 서비스 부팅 후에는 `product-service` admin sync와 `partner-order-service` vendor OCR catalog lookup이 같은 spreadsheet id를 사용해야 한다.

필수 env:
- `GOOGLE_SERVICE_ACCOUNT_KEY`
- `BOOTSTRAP_SHEET_ID` 또는 `INTEGRATED_QUOTE_SHEET_ID` (미설정 시 legacy sheet id default)
- `INTEGRATED_QUOTE_RANGE`는 일반 운영에서는 미설정
