# PR #984 후속 라운드 — 관계 임포트 2

## 시작 기록

- 일시: 2026-08-03 (Asia/Seoul)
- 작업 기준 커밋: `b3cbfd5ca`
- 사용자 지시: 먼저 `git pull` 실행 완료.

### `git pull` 원문

```text
Already up to date.
```

### 이번 라운드 범위

1. 관계 XLSX를 임포터 입력 CSV로 임시 변환하고 행 수를 확인한다.
2. 관계 원본을 포함한 임포트를 실행해 `409`를 진짜로 판정한다.
3. `relationFile` XLSX fail-open을 RED-first로 재현하고, 원인에 맞게 수정한다.
4. CSV 정상 경로와 관계 없는 임포트 회귀를 확인한다.

원본 `docs/migration/ecount-data/raw/**`는 수정하지 않으며, 변환 파일은 저장소 밖 임시 위치에 둔다. Docker, DB 직접 변경, commit/push는 하지 않는다.

## 조사 1 — 입력 계약과 원본 확인

### 실행 명령

```powershell
rg -n --hidden -S "relationFile|skippedGroupCount|MIG2_ALIAS_DUPLICATE|품목관계리스트|relation" product-service docs/migration scripts
Get-ChildItem -Recurse -File docs/migration/ecount-data
```

### 응답 원문 요약

```text
services/product-service/src/main/java/.../EcountProductImportController.java:41: validateFileIfPresent(relationFile, "relationFile");
services/product-service/src/main/java/.../EcountProductImporter.java:228: byte[] content = EcountCsvSupport.readRequired(relationFile);
docs/migration/ecount-data/raw/품목관계리스트-Excel다운로드.xlsx 11416 bytes
docs/migration/ecount-data/raw/품목-Excel다운로드.csv 211984 bytes
```

현재 구현은 `relationFile`을 `EcountCsvSupport`로 읽지만 `itemFile`처럼 관계 파일 MIME/확장자를 별도 거부하는 검증은 보이지 않는다. 다음 단계에서 원본 XLSX를 압축 XML의 `inlineStr`까지 읽어 임시 CSV로 변환한다.

## ① 관계 XLSX → 임시 CSV 변환

### 실행 명령

```powershell
@' ... Python zipfile/XML 변환 스크립트 ... '@ | python -
```

변환 위치는 저장소 밖 `C:\Users\user\AppData\Local\Temp\samhan-pr984-relation-import-2\relation.csv`이다.

### 응답 원문

```text
SOURCE=품목관계리스트-Excel다운로드.xlsx
SOURCE_BYTES=11416
XLSX_ROW_ELEMENTS=160
CSV_PATH=C:\Users\user\AppData\Local\Temp\samhan-pr984-relation-import-2\relation.csv
CSV_TOTAL_ROWS=160
CSV_DATA_ROWS=158  (회사명 meta 1행 + 헤더 1행 제외)
ROW_1=['회사명:(주)삼한공조시스템', '', '', '', '', '', '', '', '']
HEADER=['대표품목코드', '대표품목명', '대표품목단위', '연결품목코드', '연결품목명', '연결품목단위', '연결품목 환산수량', '대표품목 환산수량', '수량관리기준']
FIRST_DATA=['절삭', '절삭', '', '00013', '절삭', '', '1', '1', '대표품목']
ALIAS_00013=[['절삭', '절삭', '', '00013', '절삭', '', '1', '1', '대표품목']]
```

`CSV_DATA_ROWS=158`이며, 원본 160개 `<row>` 중 회사명 meta/헤더 2개를 제외한 실제 관계 행은 **158개**이다. 셀은 `inlineStr`로 읽었다.

## ② 관계 원본을 포함한 임포트 실행

CSV 파서는 meta 행을 `회사명 :` 형식으로 인식하므로, 변환본의 meta 셀에 원본 CSV 계약과 동일한 공백을 넣었다. 데이터 158행 자체는 변경하지 않았다.

### 실행 명령

```powershell
$item = (Get-ChildItem 'docs/migration/ecount-data/raw' -Filter '*품목-Excel다운로드.csv').FullName
$relation = 'C:\Users\user\AppData\Local\Temp\samhan-pr984-relation-import-2\relation.csv'
curl.exe -i -sS --max-time 120 -X POST 'http://localhost:8084/admin/products/imports/ecount' `
  -H 'X-Is-System-Master: true' `
  -H 'X-User-Id: 00000000-0000-0000-0000-000000000001' `
  -F "itemFile=@$item;type=text/csv" `
  -F "relationFile=@$relation;type=text/csv" `
  -w "`nHTTP_STATUS=%{http_code}`n"
```

### 응답 원문

```text
HTTP/1.1 200
{"totalRows":2854,"imported":0,"updated":2696,"rejectedNullName":1,"skippedPlaceholder":0,"skippedRelationOrphan":0,"aliasImported":2853,"sourceFileHash":"7221A1BE09FC1C97527073F01B6FBE24AE7D3918AAAADCF6805CE70A8C468678","rejectedSample":[{"rowNumber":2854,"reason":"REJECT_NAME_NULL","rawCode":"2026/07/28  오후 8:37:21","rawName":""}],"skippedGroupCount":0,"skippedGroups":[]}
HTTP_STATUS=200
```

## ④ fail-open RED

### 추가한 테스트

`EcountProductImportControllerIT.relation_xlsx_is_rejected_instead_of_reported_as_success`

기대 동작은 관계 XLSX 업로드 시 `422 Unprocessable Entity`이며, importer가 호출되지 않는 것이다.

### 실행 명령

```powershell
.\gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.it.EcountProductImportControllerIT.relation_xlsx_is_rejected_instead_of_reported_as_success --no-daemon
```

### RED 원문

```text
EcountProductImportControllerIT > relation_xlsx_is_rejected_instead_of_reported_as_success() FAILED
    java.lang.AssertionError at EcountProductImportControllerIT.java:81

1 test completed, 1 failed
...
BUILD FAILED
```

테스트가 현재 구현에서 실패했으므로, XLSX 관계 파일이 컨트롤러 검증을 통과해 성공 경로로 전달되는 fail-open을 재현했다.

## ⑤ 판정 및 고친 내용

### 판정: 거부

`itemFile`과 현재 문서 계약은 CSV 입력이다. `relationFile`만 XLSX를 조용히 성공 처리하면 사용자는 관계가 반영됐다고 오인한다. 또한 현재 importer의 XLSX 분기와 운영 입력 계약이 혼재되어 있어, 이 라운드에서는 실사용자가 잘못된 XLSX를 올렸을 때 성공으로 보고하지 않는 **422 거부**를 선택했다. CSV relationFile 정상 경로는 그대로 유지한다.

### 수정

`EcountProductImportController.validateFileIfPresent`에서 ZIP/XLSX 시그니처(`PK\x03\x04`)를 감지하면 `MIG2_CSV_HEADER_MISMATCH`(422)를 던지도록 했다. item/relation/group optional part 모두 같은 CSV 계약으로 보호하며, 거부 시 importer를 호출하지 않는다.

## ⑥ GREEN 원문

### 실행 명령

```powershell
.\gradlew.bat :services:product-service:test --tests com.samhanair.logis.product.it.EcountProductImportControllerIT.relation_xlsx_is_rejected_instead_of_reported_as_success --no-daemon
```

### GREEN 원문

```text
> Task :services:product-service:test
BUILD SUCCESSFUL in 41s
1 test completed, 0 failed
```

## ⑦ 정상 경로 회귀 확인

### 실행 명령

```powershell
.\gradlew.bat :services:product-service:test `
  --tests com.samhanair.logis.product.it.EcountProductImportControllerIT `
  --tests com.samhanair.logis.product.service.EcountProductImporterTest.importCsv_품목관계_alias를_mainProduct로_매핑한다 `
  --tests com.samhanair.logis.product.service.EcountProductImporterTest.importCsv_관계없는_중복코드는_이름과_무관하게_각각_반영한다 --no-daemon
```

### GREEN 원문

```text
> Task :services:product-service:test
BUILD SUCCESSFUL in 42s
15 actionable tasks: 1 executed, 14 up-to-date
```

컨트롤러 CSV multipart 정상 경로, CSV relationFile 관계 매핑, relationFile 없는 관계 없는 중복코드 경로가 모두 통과했다.

## ⑧ 새로 만든 파일 목록

- `docs/dev-reports/2026-08-03-984-relation-import-2.md`

테스트와 production 수정은 기존 파일에 반영했다. 변환 CSV는 저장소 밖 임시 경로에만 생성했다.

## ③ 409 진짜 판정

**이름 축 제거는 관계 원본을 실제로 포함한 실행에서 통과했다.** 직전의 `409 MIG2_ALIAS_DUPLICATE (aliasCode=00013, sourceRowNo=15)`는 관계 파일 없이 실행한 결과였고, 이번 관계 CSV 158행 포함 실행에서는 409가 재현되지 않았다.

관계 원본의 `00013` 행은 `대표품목코드=절삭`, `연결품목코드=00013`, `수량관리기준=대표품목` 단일 매핑이다. 따라서 이번 실행에서 `00013`은 다른 대표품목으로 중복 매핑되지 않았으며, 409 미발생은 이름 축 제거와 관계 근거가 함께 적용된 결과로 판정한다.
