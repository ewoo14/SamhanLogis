# P1-6 Excel export — DevOps + FE dev-report

| 항목 | 값 |
|------|-----|
| 작성일 | 2026-05-11 |
| 담당 | DevOps agent (BE 의존성/IT) + FE agent (UI 구현) |
| 관련 branch | feature/p1-6-excel-export |
| 선행 PR | #134~#145 (P0-1 Slice A~C, P0-2, P0-4, P0-5, P0-6, P0-9, P1-3, P1-4, P1-5) |

---

## 1. 배경 및 목적

P1-6 슬라이스 = slip-service 전표 목록/상세 Excel(.xlsx) 다운로드 기능.

accounting-service / inventory-service / arologis-service 는 이미 `org.apache.poi:poi-ooxml:5.2.5`
를 도입해 .xlsx 생성에 활용 중이다. slip-service 에는 POI 의존성이 없었으므로 본 슬라이스에서 추가한다.

BE 구현(SlipExcelExportService + SlipExcelExportController)은 별도 BE agent 산출물.
본 dev-report 는 DevOps 담당 범위(의존성 추가 + IT scaffold)를 기록한다.

---

## 2. 의존성 현황 (추가 전/후)

### 2-1. 추가 전 서비스별 POI 존재 여부

| 서비스 | poi-ooxml 5.2.5 | 비고 |
|--------|:--------------:|------|
| accounting-service | O | 홈택스 export (PR-E2 BE-A11) |
| arologis-service | O | VendorExcelParser (PR-F1 BE-2) |
| inventory-service | O | DPS 입고 비교 (PR-E1 BE-2) |
| slip-service | **X** | P1-6 이전 없음 — 본 작업 대상 |
| partner-service | **X** | P1-6 거래처 export 용 — 본 PR 에서 동시 추가 |
| shared/common | **X** | ExcelExporter 유틸리티 — 본 PR 에서 compileOnly 추가 |

### 2-2. 추가 내용

#### slip-service (`services/slip-service/build.gradle`)

```groovy
// P1-6 Excel export — 전표 목록/상세 .xlsx 다운로드 (GET /slips/export.xlsx).
// poi-ooxml 이 poi-core 를 전이 의존으로 포함하므로 별도 poi 선언 불필요.
// 버전 5.2.5 = accounting-service / inventory-service / arologis-service 와 동일.
implementation 'org.apache.poi:poi-ooxml:5.2.5'
```

#### partner-service (`services/partner-service/build.gradle`)

```groovy
// Apache POI — P1-6 Excel export (GET /api/v1/partners/export.xlsx).
implementation 'org.apache.poi:poi-ooxml:5.2.5'
```

#### shared/common (`shared/common/build.gradle`)

```groovy
// Apache POI — P1-6 Excel export 공통 유틸리티 (ExcelExporter / ExcelColumn / ExcelExportRequest).
// compileOnly: 각 소비 서비스가 자신의 build.gradle 에 implementation 을 직접 선언해야 한다.
compileOnly 'org.apache.poi:poi-ooxml:5.2.5'
```

버전 pin 근거: 기존 3개 서비스와 동일 버전 사용으로 BOM 불일치 리스크 제거.
`poi-ooxml` 아티팩트가 `poi`(core) 를 전이 의존으로 포함하므로 별도 `poi` 선언 불필요.

### 2-3. shared/common ExcelExporter 공통 유틸리티

파일 3종 신규:
- `shared/common/src/main/java/com/samhanair/logis/common/excel/ExcelExporter.java` — static `export(ExcelExportRequest)` 진입점. XSSFWorkbook 생성 + 헤더/데이터 행 + 교번 스트라이프 스타일.
- `shared/common/src/main/java/com/samhanair/logis/common/excel/ExcelColumn.java` — 컬럼 메타 record (header / dataKey / width / numericFormat). 팩토리 메서드: `text()` / `numeric()`.
- `shared/common/src/main/java/com/samhanair/logis/common/excel/ExcelExportRequest.java` — 요청 record (sheetName / columns / rows).

shared/common 은 `compileOnly` 선언으로 JAR 에 POI 를 번들링하지 않는다. 소비 서비스가 `implementation` 으로 런타임 의존을 직접 확보해야 한다 (위 2-2 각 서비스 선언 참조).

---

## 3. IT 산출물

파일: `services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipExcelExportIT.java`

`AbstractPostgresIT` 상속 — Testcontainers PostgreSQL 16-alpine 싱글턴. Docker 미가용 시 자동 skip.

### 3-1. @MockBean 격리 (PR #134~#145 회고 가드)

| 클라이언트 | 격리 이유 |
|-----------|----------|
| `InventoryClient` | 재고 예약/차감 외부 호출 차단 |
| `ProductClient` | product-service 제품 조회 외부 호출 차단 |
| `NotificationClient` | 알림 발송 외부 호출 차단 (`sendUserSms` / `sendExternalSms` / `sendUserPush` 각각 lenient doNothing) |
| `PartnerInternalClient` | partner-service 내부 호출 차단 |

### 3-2. TC 목록

| TC | 검증 내용 | 방법 |
|----|-----------|------|
| TC-1 | 미인증 → 403 | MockMvc status |
| TC-2 | MASTER export → 200 + OOXML Content-Type | MockMvc content().contentTypeCompatibleWith |
| TC-3 | Content-Disposition: attachment 포함 | MockMvc header().string |
| TC-4 | 응답 바이트 → XSSFWorkbook 역직렬화 성공 | Apache POI XSSFWorkbook(ByteArrayInputStream) |
| TC-5 | 시트 1장 이상 존재 | wb.getNumberOfSheets() >= 1 |
| TC-6 | 헤더 행(row 0) 첫 셀 비어있지 않음 | sheet.getRow(0).getCell(0) not blank |
| TC-7 | 전표 1건 생성 후 export → 데이터 행(row 1+) 존재 | lastRowNum >= 1 |
| TC-8 | SALES 권한 export → 403 | MockMvc status |

TC-4/TC-5/TC-6/TC-7 은 BE 가 endpoint 를 구현한 후 실제 패스되는 "기다리는 TC" 패턴.
BE 구현 전 실행 시 TC-2 ~ TC-7 은 404 로 실패 → BE 구현 완료 후 GREEN 확인.

---

## 4. 설계 결정

### D-P16-01 — shared/common compileOnly + 소비 서비스 implementation 이중 선언

shared/common 에 `implementation` 으로 POI 를 선언하면 POI 를 사용하지 않는 서비스에
JAR (~14 MB) 이 전이된다. 따라서 shared/common 은 `compileOnly` 로 컴파일 시점만 의존하고,
실제 런타임 의존은 slip-service / partner-service 각각의 `implementation` 선언으로 확보한다.
accounting-service / inventory-service / arologis-service 는 기존 선언이 이미 존재하므로 변경 없음.

### D-P16-02 — poi-ooxml 단독 선언, poi-core 미선언

`org.apache.poi:poi-ooxml:5.2.5` 는 `org.apache.poi:poi:5.2.5` 를 전이 의존으로 포함한다.
별도 `poi` 선언 시 버전 이중 관리 위험이 있으므로 poi-ooxml 만 선언한다.

### D-P16-03 — NotificationClient stub 세분화

`NotificationClient.send()` 는 존재하지 않는다. 실제 public 메서드는
`sendUserSms` / `sendExternalSms` / `sendUserPush` 세 가지이므로 각각 lenient doNothing stub.
이 패턴은 메서드 시그니처 오류를 컴파일 타임에 검출하는 효과도 있다.

### D-P16-04 — TC-7 @Transactional 롤백 경계

`@Transactional` 클래스 레벨 선언으로 각 TC 가 독립 트랜잭션 내에서 실행되고 테스트 후 롤백.
TC-7 은 같은 트랜잭션 내에서 전표 생성 → export 를 순서대로 수행하므로 격리 상태에서 1건 이상 보장.

---

## 5. 가드 준수 현황

| 가드 | 준수 |
|------|:----:|
| IT @MockBean 4종 격리 | O — InventoryClient / ProductClient / NotificationClient / PartnerInternalClient |
| UUID 비공개 가드 | O — TC 에서 슬립번호/거래처명 기반, id 직접 비교 없음 |
| AbstractPostgresIT 상속 | O — DockerAvailableCondition skip 가드 포함 |
| PR #134~#145 회고 가드 | O — lenient stub / extends AbstractPostgresIT / @Transactional |
| poi-ooxml 버전 통일 | O — 기존 3개 서비스와 동일 5.2.5 |

---

## 6. FE 구현 산출물 (2026-05-11)

### 6-1. design-system 신규 컴포넌트 — `ExcelDownloadButton`

파일:
- `clients/web/design-system/src/components/ExcelDownloadButton/ExcelDownloadButton.tsx`
- `clients/web/design-system/src/components/ExcelDownloadButton/index.ts`
- `clients/web/design-system/src/components/ExcelDownloadButton/ExcelDownloadButton.stories.tsx`

설계:
- `onFetch: () => Promise<Blob>` 콜백 수신 → blob URL 생성 → `<a download>` 클릭
- axios 없이 순수 DOM API 사용 (design-system 은 UI 라이브러리)
- `Button` 컴포넌트 래핑 → `loading` / `disabled` 시맨틱 동일 제공
- `triggerDownload(blob, filename)` 유틸 함수 별도 export (테스트 대체 가능)
- design-system `index.ts` 에 `export * from './components/ExcelDownloadButton'` 추가

Storybook stories 7종: 거래처목록 / 전표목록 / 분개장 / 재고현황 / 로딩중 / 기본스타일 / 강조스타일 / 전체Variant

### 6-2. desktop API 레이어

파일:
- `clients/desktop/src/renderer/api/excelExportApi.ts` — 4 export 함수 (`exportPartners` / `exportSlips` / `exportJournals` / `exportStocks`)
- `clients/desktop/src/renderer/api/excelExportMock.ts` — 4 CSV 픽스처 (결정적, Math.random 금지)

### 6-3. desktop hook

파일: `clients/desktop/src/renderer/hooks/useExcelDownload.ts`

- `useExcelDownload()` — `{ downloading, download }` 반환
- `makeExportFilename(prefix, ext?)` — 오늘 날짜 기반 파일명 생성 (`거래처목록_2026-05-11.xlsx`)

### 6-4. 목록 페이지 보강 (Excel 버튼 추가)

| 페이지 | 파일 | data-testid | endpoint |
|-------|------|------------|----------|
| 거래처 관리 | `routes/admin/PartnersPage.tsx` | `admin-partners-excel-export` | `GET /api/v1/partners/export?type&status` |
| 전표 목록 (출고/입고) | `routes/SlipListPage.tsx` | `slip-list-excel-export` | `GET /api/v1/slips/export?slipType&fromDate&toDate` |
| 분개장 | `routes/JournalListPage.tsx` | `journal-list-excel-export` | `GET /api/v1/accounting/journals/export?period&status` |
| 재고이동 목록 | `routes/TransferListPage.tsx` | `transfer-list-stocks-excel-export` | `GET /api/v1/inventory/stocks/export` |

### 6-5. 검증 결과

| 검증 | 결과 |
|------|:----:|
| design-system `tsc --noEmit` | 통과 |
| desktop `npm run typecheck` | 통과 |
| design-system `npm run build` (vite + dts) | 통과 (124.87 kB) |
| desktop `npm run build` (electron-vite) | 통과 (2,248.39 kB) |
| design-system `npm run lint` | 기존 pre-existing 오류만 (신규 파일 0건) |
| desktop `npm run lint` | 기존 warning 2건만 (신규 파일 0건) |

### 6-6. 매뉴얼 갱신

- `docs/manual/01-영업/02-거래처-조회.md` — Excel export ⛔ → ✅, 4-5 절 신규 추가, FAQ Q3 갱신
- `docs/manual/01-영업/03-슬립-발행.md` — 구현 상태 표 Excel export 항목 추가
- `docs/manual/02-창고/03-재고-조회.md` — 구현 상태 표 재고 현황 Excel export 항목 추가
- `docs/manual/03-회계/01-분개-입력.md` — 구현 상태 표 분개장 Excel export 항목 추가

---

## 8. 후속 BE 작업 항목

BE agent 가 구현해야 하는 사항 (본 dev-report 범위 외):

1. `GET /slips/export.xlsx` endpoint — `@PreAuthorize("hasAnyRole('MASTER','MANAGER')")`
2. `SlipExcelExportService` — JPA Specification 으로 전표 목록 조회 + XSSFWorkbook 빌드
3. 헤더 행: 전표번호 / 전표유형 / 거래처명 / 전표일자 / 상태 / 담당자 / 라인수 / 합계금액
4. `Content-Disposition: attachment; filename*=UTF-8''%EC%A0%84%ED%91%9C%EB%AA%A9%EB%A1%9D-{date}.xlsx`
5. OOXML Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
