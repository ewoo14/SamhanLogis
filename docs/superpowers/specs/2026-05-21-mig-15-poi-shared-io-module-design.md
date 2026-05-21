# MIG-15 POI shared/common → shared/ecount-io module 분리 — 설계 (Design Spec)

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-15-poi-shared-io-module`
> 입력: D-MIG-11 이연 — POI 5.4.0 transitive 14 service 영향 분리

---

## 1. 개요

MIG-14 머지 후 PM 자율 연속 진행 — D 이전까지 자동. **C — POI shared/common 분리** 첫 진입.

- baseline: MIG-1~14 모두 머지
- **옵션 C 21단계 첫 적용** (1f fix 발동 시 사이클 N=2 의무)
- PM 자율 연속 진행 ([feedback_pm_auto_continuous])

---

## 2. 분리 전략

### 현재 POI 의존성 분포

| 위치 | implementation | 실 사용 |
|---|---|---|
| `shared/common/build.gradle` | poi-ooxml:5.4.0 | EcountXlsxSupport + ExcelExporter |
| `services/accounting-service/build.gradle` | poi-ooxml:5.4.0 | AbstractEcountMig11LedgerImporter + Hometax/TaxInvoice XLSX |
| `services/arologis-service/build.gradle` | poi-ooxml:5.4.0 | VendorExcelParser (vendor excel, 이카운트 무관) |
| `services/slip-service/build.gradle` | poi-ooxml:5.4.0 | SlipExcelExportIT (slip export, test only) |
| `services/partner-service/build.gradle` | poi-ooxml:5.4.0 | direct POI 0건 (ExcelExporter 경유) |
| `services/inventory-service/build.gradle` | poi-ooxml:5.4.0 | DpsExcelParser (DPS excel, 이카운트 무관) |

### MIG-15 분리 방안

1. **`shared:ecount-io` 신규 module** — 이카운트 xlsx 전용 (POI 의존)
2. **`EcountXlsxSupport.java` 이동**: `shared/common/.../ecount/EcountXlsxSupport.java` → `shared/ecount-io/.../ecount/io/EcountXlsxSupport.java`
3. **`ExcelExporter.java` 이동**: POI 직접 구현만 `shared/ecount-io`로 이동하고, `ExcelColumn`/`ExcelExportRequest`는 POI 비의존 DTO라 `shared:common` 유지
4. **`shared/common/build.gradle`** POI 의존성 **제거**
5. **`accounting-service/build.gradle`** POI implementation 제거 + `implementation project(':shared:ecount-io')` 추가
6. **`partner-service`** POI direct 의존성 **제거** (POI 직접 import 0건)
7. **`arologis-service` + `slip-service` + `inventory-service`** POI direct 의존성 **유지** (이카운트 무관 자체 사용)

### 효과

- POI transitive 14 service → **4 service** (accounting/arologis/slip + shared:ecount-io 만)
- SBOM/CVE 관리 영역 축소
- 분리된 module 의 미래 추가 ecount IO 코드 (예: PDF 출력, OCR) 집중

---

## 3. 산출 예정 (15~25 file, 약 200~400 LOC)

| 영역 | 변경 |
|---|---|
| settings.gradle | `include 'shared:ecount-io'` + projectDir 추가 |
| shared/ecount-io/build.gradle | 신규 (POI 5.4.0 + shared:common 의존) |
| shared/ecount-io/src/main/java/.../ecount/io/EcountXlsxSupport.java | 이동 |
| shared/ecount-io/src/test/.../EcountXlsxSupportTest.java | 이동 |
| shared/ecount-io/src/main/java/.../common/excel/ExcelExporter.java | 이동 |
| shared/ecount-io/src/test/.../common/excel/ExcelExporterTest.java | 이동 |
| shared/common/build.gradle | POI 제거 |
| accounting-service/build.gradle | POI 제거 + shared:ecount-io 추가 |
| accounting-service/AbstractEcountMig11LedgerImporter.java | import 경로 갱신 |
| partner-service/build.gradle + inventory-service/build.gradle | POI 제거 |

---

## 4. 결정 (D-MIG-15-XX)

- D-MIG-15-01 `shared:ecount-io` 신규 module — POI 기반 이카운트/Excel IO 전용 분리
- D-MIG-15-02 EcountXlsxSupport 를 이동한다 (EcountCsvSupport, ErrorCode, ImportResult 는 shared:common 유지 — POI 비의존)
- D-MIG-15-03 `ExcelExporter` 구현도 shared:ecount-io로 이동하되 `ExcelColumn`/`ExcelExportRequest`는 shared:common에 유지한다.
- D-MIG-15-04 partner-service POI direct 의존성 제거 (POI 직접 import 0건, ExcelExporter 경유)
- D-MIG-15-05 arologis-service + slip-service + inventory-service POI direct 의존성 유지 (이카운트 무관 자체 사용)
- D-MIG-15-06 옵션 C 21단계 첫 적용 ([feedback_cycle_n2_mandatory])
- D-MIG-15-07 PM 자율 연속 진행 (D 이전까지 자동)

---

## 5. 옵션 C 21단계

(메모리 [feedback_cycle_n2_mandatory] 동일 — 1f fix 발동 시 사이클 N=2 의무)

---

🤖 PM Claude (Opus 4.7) — 2026-05-21 자율 연속
