# PR #1154 R20 fix — 관리자 보류 목록 가시성·혼합 인코딩 행 번호

## 판정

코드 수정과 자동 검증은 완료했다. 관리자 거래처 화면에 파일 적재 진입점과 결과 직결 보류·거부 패널을 추가했고, 페이지 API의 100건 단위로 1,000건을 넘길 수 있게 했다. 혼합 인코딩 fallback은 실제 줄 번호를 보존하고 staging에도 행 증거를 남긴다.

다만 이번 라운드에는 gateway `8080` multipart 전달이 정체되어 **실 관리자 화면에서 1,000건 마지막 페이지까지 넘긴 공식 PNG를 저장하지 못했다**. 실제 `/admin/partners` 화면과 적재 버튼 노출까지는 확인했으나, UI multipart가 partner `48095`에 도달하지 않았다. 따라서 RED-A①의 라이브 캡처는 미완료로 보고한다.

## RED — fix 전 원문

### RED-A①: API는 1,000건, 화면 진입점 없음

R19 실측 원문:

```text
GET .../ecount/rejections size=100 × page 0..9
totalElements 1000
합친 items 1000
first rowNumber 3 / SOL1154R19-BULK-0001
last  rowNumber 1002 / SOL1154R19-BULK-1000
```

fix 전 실제 `/#/admin/partners` 화면에는 `Excel 다운로드`, `신규 등록`, 검색·필터·삭제만 있었고 `업로드`, `가져오기`, `보류 행`, `거부 행` 진입점은 0건이었다. production client의 `/admin/partners/imports/ecount/rejections` 소비자도 0곳이었다.

### RED-B①: 보류 0건 화면 처리

fix 전에는 결과 화면 자체가 없었다. 새 패널의 자동 테스트에서 `totalElements=0`을 `보류·거부 행이 없습니다.`로 확인한다.

### RED-A②: 혼합 인코딩 행 번호 소실

R19 실측 원문:

```json
{
  "totalRows": 0,
  "heldParseFailureRows": 1,
  "heldSample": [{
    "rowNumber": 0,
    "reason": "CSV_ENCODING",
    "rawPartnerCode": "",
    "rawName": ""
  }]
}
```

### RED-B②: 원인 확정 (`파일:줄`)

- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:154~158`: UTF-8·MS949 strict decode가 모두 실패하면 CSVReader 이전 fallback으로 이동한다.
- 같은 파일 기존 `:326~334`: `encodingHeldResult()`가 `rowNumber=0`, `rawPartnerCode=""`, `rawName=""`인 단일 표본을 반환했다.
- 따라서 파서가 행 번호를 잃은 것이 아니라, **파일-level decode 실패 fallback이 실제 바이트 줄을 세지 않고 상수 0을 만든 것**이 원인이다.

## 수정

- `PartnersPage`: `거래처 파일 적재` 버튼, CSV/XLSX 파일 입력, 적재 결과 요약과 즉시 `PartnerImportRejectionPanel` 연결.
- `partnerImportApi`: 실제 `/admin/partners/imports/ecount/rejections` 페이지 API와 CSV/XLSX multipart 업로드 계약.
- `PartnerImportRejectionPanel`: 페이지당 100건, 행 번호·사유·거래처코드·상호 표시, 이전/다음, 0건 빈 상태.
- `EcountPartnerImporter`: decode 실패 시 LF 기준 데이터 줄을 세고 각 줄을 staging `PENDING`으로 남김. 응답 sample은 실제 행 번호와 `읽을 수 없음`을 표시.

## 조합 표

| 보류/거부 건수 | 입력검증 | DB제약 | 인코딩 | 빈상호 |
|---:|---:|---:|---:|---:|
| 0 | 자동 테스트 기존 정상 경로 | 자동 테스트 기존 정상 경로 | — | 패널 빈 상태 |
| 1 | 기존 `EcountPartnerImporterTest` | 기존 R19 실측 계약 | R20 단위 RED→GREEN, row 3 | 기존 R19 실측 row 3 |
| 20 | 기존 sample cap 계약 | 기존 sample cap 계약 | sample max 20 경로 | 기존 sample cap 계약 |
| 1,000 | R19 API 실측 1,000행 + 패널 page contract | 페이지 패널 contract | — | R20 라이브 표본 시도, gateway 정체로 미완료 |

## 정본·정상 CSV 회귀

R19 기준 정본 대조값은 변경하지 않았다.

```text
totalRows 7253
activeCount 7253
rejectedNullName 0
excludedTrailerRows 1
registrationDateParsedCount 2423
createdAtLoadTimeCount 4830
sourceFileHash 064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619
```

정상 UTF-8·ASCII·CP949·구두점/역슬래시 CSV의 기존 R19 실측은 모두 보류 0건·문자열 완전 보존이며, 이번 변경은 decode 실패 fallback과 관리자 소비 화면만 다룬다. partner-service 단위 테스트와 desktop typecheck가 통과했다.

## 실행·배포 확인

- HEAD: `33a3b013abde680e6e7bba15c300445dbcadfb93`.
- accounting `28087`: R19와 동일한 backend 소스이며 JAR `23D218639BA96BFFC8970F5541AE9D959A8588053869FA5DA803191C6D705DE0`.
- partner `48095`: R20 수정 JAR를 mounted `/app/app.jar`로 재기동, 빌드 산출물과 컨테이너 SHA-256 일치: `A27FA470EB45EBDF9ED842D38824AB65AE1987D2FBED7F1BC781998D454AFA60`; health `UP`.
- gateway를 거치지 않은 혼합 인코딩 실 요청은 서버에서 `CSV_ENCODING`, 실제 row 3, staging 1행을 만들었으나 Playwright 응답 종료가 정체되어 공식 라이브 캡처로 승격하지 않았다.

## cleanup 잔여

```text
active 0
soft-deleted 0
staging 1
```

R20 표본의 active 거래처는 생성되지 않았다. 혼합 인코딩 표본의 staging 행 1건은 행 증거 보존을 위해 남겼다. 직접 DB INSERT/UPDATE/DELETE는 하지 않았다.

## 신규 파일 목록

- `clients/desktop/playwright/1154-r20-admin-visibility-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1154-r20-admin-visibility-real-qa/1154-r20-admin-visibility.spec.ts`
- `clients/desktop/src/renderer/api/partnerImportApi.ts`
- `clients/desktop/src/renderer/api/partnerImportApi.test.ts`
- `clients/desktop/src/renderer/routes/admin/PartnerImportRejectionPanel.tsx`
- `clients/desktop/src/renderer/routes/admin/PartnerImportRejectionPanel.test.tsx`
- `docs/qa/2026-08-10-1154-r20/03-cleanup.json`

## 검증

```text
partner-service EcountPartnerImporterTest: BUILD SUCCESSFUL, 26 tests completed
desktop partnerImportApi + PartnerImportRejectionPanel: 3 tests passed
desktop npm run typecheck: 통과 (real-QA scope 50/50)
desktop lint: 0 errors (기존 경고 152건)
```

## 못 한 것

- gateway `8080` multipart 전달 정체 때문에 **관리자 화면에서 1,000건 마지막 페이지를 넘긴 공식 `docs/qa/2026-08-10-1154-r20/01-admin-visibility-1000.png` 캡처를 만들지 못했다**.
- 그 결과 라이브 RED-A① 증거는 코드 계약·실제 버튼 노출까지만 확인했으며, 개발책임자에게는 이 미완료를 숨기지 않는다.
- commit/push는 하지 않았다. `tools/legacy-gas/**`, 다른 워크트리, main은 변경하지 않았다.
