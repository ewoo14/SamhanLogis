# PR #1156 R14 CODEX SOL 5.6 적대검증 재수렴

## 판정

**요청된 실 사용자 경로에서 재현 가능한 R12/R13 회귀 결함은 찾지 못했다.**

- HEAD 세 서비스 체인에서 채움 표본의 이메일·규격·수량·단가·비고가 `sales-query` → 신규 미리보기 → legacy batch URL → 5330 결과표 → 실제 XLSX까지 보존됐다.
- 비움 표본의 이메일·규격·비고는 새 값을 만들지 않고 빈 값으로 남았다.
- 실제 XLSX의 공급받는자 사업자번호는 `1130710031`, 미등록 거래처는 빈 셀이었다.
- 실데이터 DataGrid에서 `Ctrl+C → 3×3 TSV`와 `공급받는자 열헤더 필터`가 모두 동작했다.
- 셋째 가능성: R12가 고친 `TaxInvoiceBatchService` 자체는 production 호출자가 0곳인 비도달 구현이다. 그러나 사용자 도달 URL인 deprecated `/accounting/tax-invoices/batch/preview`는 `HometaxExportService`로 위임되고, 이 실제 URL은 신규 경로와 같은 값을 반환했다. 비도달 클래스 자체를 사용자 결함으로 판정하지 않았다.

## 환경 확인

| 항목 | 실측 |
|---|---|
| 워크트리 | `C:\dev\Samhan-Public\.claude\worktrees\t1155` |
| 브랜치 / HEAD | `fix/1155-inbound-partner-code` / `7453e7e2212ef02cc0bd327fbf50b9622502f5d6` |
| renderer | `127.0.0.1:5330`; PID 115096 command line = 이 워크트리의 `vite.renderer.dev.config.ts --port 5330 --strictPort`; HTTP 200 |
| slip-service | R14 전용 `127.0.0.1:28210` (`sol1156-r14-slip`), health 200 |
| accounting-service | R14 전용 `127.0.0.1:28211` (`sol1156-r14-accounting`), health 200 |
| partner-service | R14 전용 `127.0.0.1:28209` (`sol1156-r14-partner`), health 200 |
| 빌드 | HEAD에서 `:accounting-service:bootJar :slip-service:bootJar :partner-service:bootJar --rerun-tasks --no-daemon`; `BUILD SUCCESSFUL`, 31/31 task 실행 |

### 배포 JAR 해시 대조

호스트 HEAD 산출물과 컨테이너 `/app/app.jar`의 SHA-256을 각각 계산했다. 세 쌍 모두 일치했다.

| 서비스 | HEAD 산출물 SHA-256 | 컨테이너 SHA-256 |
|---|---|---|
| accounting-service | `73B3A65116C1BBCE34D685BC2E067B286BEBAA9124498B217F8F13D5076ADD21` | `73b3a65116c1bbce34d685bc2e067b286bebaa9124498b217f8f13d5076add21` |
| slip-service | `A55C845BFC2D25A8A31A7B267A96E386DF32E10B1411C7E5560DE72A97E46A7E` | `a55c845bfc2d25a8a31a7b267a96e386df32e10b1411c7e5560de72a97e46a7e` |
| partner-service | `4FC7B0BF62D60FCA7B844DCAE93480C890E020854C423382C35FCC92FDB8C859` | `4fc7b0bf62d60fca7b844dcae93480c890e020854c423382c35fcc92fdb8c859` |

### 실제 호출 API

| 목적 | 실제 URL |
|---|---|
| 사용자 로그인 | `POST http://127.0.0.1:8081/auth/login` |
| 거래처 검색 | `GET http://127.0.0.1:8080/admin/partners/search` |
| 전표 생성·상태 전이 | `POST http://127.0.0.1:28210/slips`, `POST /slips/{id}/{action}` |
| R12 경계 원문 | `GET http://127.0.0.1:28210/internal/slips/sales-query` |
| 신규 사용자 경로 | `POST http://127.0.0.1:28211/accounting/hometax-export/preview` |
| legacy batch 사용자 경로 | `POST http://127.0.0.1:28211/accounting/tax-invoices/batch/preview` |
| 실제 XLSX | 5330 결과 페이지의 `Excel 다운로드 (1번)` → split XLSX |

로그인 비밀번호·토큰·내부 UUID는 산출물에서 모두 `<redacted>` 처리했다.

### stale/discovery 오판 제거

첫 실행은 기존 28206/28208 컨테이너가 HEAD JAR을 mount했음에도 28206의 discovery에 R14 partner-service 인스턴스가 없었다. 원문 실패는 다음과 같았다.

```text
Expected "email": "info1@samhan-test.com"
Received "email": ""
```

같은 시각 R14 partner endpoint 원문은 HTTP 200이며 `email=info1@samhan-test.com`을 반환했다. 즉 첫 결과는 제품 값 손실이 아니라 `slip-service → partner-service` 미도달이었다. R14 전용 체인에 partner simple instance를 명시한 뒤 같은 표본에서 이메일이 채워졌다. 이 두 번째 체인만 제품 판정에 사용했다.

## ① 다섯 열 라이브 값

### R14 표본

공유 DB write는 아래 R14 표본 두 건의 사용자 API 생성·상태 전이에만 사용했다. DB 직접 `INSERT/UPDATE`는 하지 않았다.

| 전표번호 | 상태 | 거래처 | 사용자 입력 |
|---|---|---|---|
| `2026/08/10-31` | `CONFIRMED` | `(주)서울에어컨` (`P-2026-0001`) | `modelName=0000098`, `specification=null`, `quantity=1`, `unitPrice=949`, `note=R14-NOTE-949` |
| `2026/08/10-32` | `CONFIRMED` | `이상덕기사님(경기퀵)` (`-`) | `modelName=""`, `specification=null`, `quantity=1`, `unitPrice=959`, `note=null` |

첫 표본의 규격은 R12 계약대로 명시 규격이 없을 때 사용자 입력 `modelName=0000098`을 사용한다. 이메일은 거래처 master의 `Partner.email`이다.

### 경계별 원문 값

| 경계 | 이메일 | 규격 | 수량 | 단가 | 비고 |
|---|---|---:|---:|---:|---|
| `sales-query` 채움 표본 | `info1@samhan-test.com` | `0000098` | `1` | `949` | `R14-NOTE-949` |
| 신규 `/hometax-export/preview` | `info1@samhan-test.com` | `0000098` | `1` | `949` | `R14-NOTE-949` |
| legacy `/tax-invoices/batch/preview` | `info1@samhan-test.com` | `0000098` | `1` | `949` | `R14-NOTE-949` |
| 5330 결과표 | `info1@samhan-test.com` | `0000098` | `1` | `₩949` | `R14-NOTE-949` |
| 실제 XLSX 59열 | `info1@samhan-test.com` | `0000098` | `1.0` | `949.0` | `R14-NOTE-949` |

캡처: [01-hometax-five-values-live.png](../qa/2026-08-10-1156-r14/01-hometax-five-values-live.png)

### 입력하지 않은 값

비움 표본은 다음과 같았다.

| 경계 | 이메일 | 규격 | 비고 | 사업자번호 |
|---|---|---|---|---|
| `sales-query` | `""` | `""` | `""` | 원천 `-` |
| 신규 미리보기 | `""` | `""` | `""` | 숫자 추출 결과 `""` |
| legacy batch URL | `""` | `""` | `""` | `""` |
| 실제 XLSX | 빈 셀 | 빈 셀 | 빈 셀 | 빈 셀 |

없는 값을 만들어 내지 않았다.

## ② R12·R13 표면

### 실제 XLSX

파일: [r14-hometax.xlsx](../qa/2026-08-10-1156-r14/r14-hometax.xlsx)

- 최종 fresh 재실행 산출 SHA-256: `EAD7B12CDFA8A8A5332ECEAED0A9090088AF81BAEFAD8E80044C2387E0E235D7`
- sheet: `엑셀 업로드 양식(전자세금계산서-일반(영세율))`
- 크기: 15행 × 59열
- `(주)서울에어컨`: 공급받는자 사업자번호 `1130710031`
- `이상덕기사님`: 공급받는자 사업자번호 빈 셀
- 채움/비움 표본의 다섯 필드도 위 ①과 일치했다.

### DataGrid 실제 동작

기존 mock DG-5/DG-6를 현재 5330에 그대로 실행하면 인증되지 않은 화면이라 preview tab에 도달하지 못했다. 실패 원문은 다음과 같다.

```text
Test timeout of 60000ms exceeded.
locator.click: waiting for getByTestId('hometax-export-tab-preview')
```

이것을 기능 실패로 판정하지 않고, 같은 5330 renderer에 실제 로그인 세션과 실제 28210/28211 API를 연결해 동일 조작을 수행했다.

| 기능 | 실측 |
|---|---|
| `Ctrl+C → TSV` | 3×3 선택 후 clipboard 3행, 각 행 3필드. 첫 세 행은 `전표번호\t작성일자\t공급자` 형태였다. |
| `열헤더 필터 → 공급받는자` | 9행 → 5행. 남은 5행의 공급받는자는 전부 `(주)서울에어컨`. |

캡처:

- [02-datagrid-ctrl-c-tsv-live.png](../qa/2026-08-10-1156-r14/02-datagrid-ctrl-c-tsv-live.png)
- [03-datagrid-buyer-filter-live.png](../qa/2026-08-10-1156-r14/03-datagrid-buyer-filter-live.png)

### 날짜 표기 관측

실데이터 화면과 clipboard에서 작성일자는 `2026-08-09`가 아니라 **`20260809`**로 보였다. 즉 R12 mock의 `20260501`과 동일하게 하이픈 없는 홈택스 파일 값 형식이다. 다운로드 XLSX도 `20260809`였다. 파일 미리보기로서 일치하지만 일반 사용자가 읽기에는 하이픈 표기보다 구분이 어렵다. 업무 판단 사항이므로 고치지 않았다.

참고: R14 컨테이너의 `confirmedAt`/`accountingDate`는 UTC 환경 영향으로 전표일 `2026-08-10`보다 하루 앞선 `2026-08-09`가 되었다. 이번 요청의 날짜 관측은 형식만 판정했으며 이 환경 차이를 제품 결함으로 판정하지 않았다.

## ③ R12가 바꾼 세 계약의 소비자 전수

### `SlipSalesQueryResponse`

| 소비자 | 기대 계약 | 도달성 |
|---|---|---|
| `SlipSalesQueryService` | `CONFIRMED` 전표를 조회하고 거래처 이메일을 해소해 `from(slip,email)` 생성 | 도달 |
| `SlipSalesQueryController` | `Page<SlipSalesQueryResponse>`를 `/internal/slips/sales-query`로 직렬화 | 도달 |
| accounting `SlipQueryClient` | 위 endpoint를 raw map 목록으로 수신 | 도달 |
| `HometaxExportService` | `email/itemSpec/itemQty/itemPrice/itemRemark`를 `HomtaxRow`로 변환 | 도달: 신규+legacy 사용자 URL 모두 이 서비스 |
| `TaxInvoiceBatchService` | 같은 다섯 raw key를 별도 `HomtaxRow` mapper로 변환 | **비도달: production 호출자 0곳**; 테스트만 직접 호출 |

다른 slip-service production 소비자는 없다. desktop은 이 DTO를 직접 읽지 않고 accounting의 `HomtaxRow` 응답을 읽는다.

### `PartnerInternalResponse`

R12의 변경은 기존 7필드 뒤에 `email`, `email2`를 추가했다. 생산 endpoint는 code lookup, name lookup, `find-by-codes`, id summary 네 곳에서 이 DTO를 반환한다.

| 서비스 소비자 | 기대 필드 |
|---|---|
| slip `PartnerInternalClient` | `partnerId`(검증/발행), `partnerCode`(id summary), R12 신규 `email`(sales-query). business-number는 별도 DTO endpoint 사용 |
| accounting `PartnerLookupClient` | `partnerId`, `partnerCode`, `name`, `bizNo`, `creditLimit`, `status`; 신규 이메일은 무시 |
| partner-order vendor `PartnerLookupClient` | `partnerId`, `partnerCode`, `name`, `bizNo` |
| partner-order `PartnerMig8LookupClient` | id summary의 `partnerId`, `partnerCode`, `bizNo`, `name` |
| dashboard `PartnerClient` | 단건/벌크의 `partnerId`, `partnerCode`, `name` |
| arologis `PartnerClient` | 벌크의 `partnerCode`, `name` |
| notification `RestClientPartnerLookupClient` | code/name lookup의 `partnerCode`만 추출 |

추가 필드는 모두 이름 기반 raw JSON 파서에서 선택적으로 읽히므로 기존 소비 기대를 밀어내지 않는다. `PartnerAuthService.java:144,326`은 지시대로 관측만 했고 수정·판정 범위에 넣지 않았다.

### `HomtaxRow`

| 소비자 | 기대 계약 | 도달성 |
|---|---|---|
| `HometaxExportService` | 59열 row 생성, snapshot 직렬화/복원, XLSX 직렬화 | 도달 |
| `TaxInvoiceBatchPreviewResponse` | REST `rows`로 노출 | 도달 |
| desktop `hometaxExportApi.ts` | 59열 wire type; 수량/단가는 string 또는 number/null | 도달 |
| `HometaxExportPage` | 17열 기본표와 DataGrid로 투영, split XLSX 다운로드 | 도달 |
| desktop `mock.ts` | 동일 wire shape의 mock row 생성 | mock 전용 |
| `TaxInvoiceBatchService` | 별도 snapshot/XLSX 구현 | production 호출자 0곳 |

## 신규 생성 파일

- `clients/desktop/playwright/1156-r14-sol-reconvergence-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1156-r14-sol-reconvergence-real-qa/1156-r14-sol-reconvergence-real-qa.spec.ts`
- `docs/qa/2026-08-10-1156-r14/01-hometax-five-values-live.png`
- `docs/qa/2026-08-10-1156-r14/02-datagrid-ctrl-c-tsv-live.png`
- `docs/qa/2026-08-10-1156-r14/03-datagrid-buyer-filter-live.png`
- `docs/qa/2026-08-10-1156-r14/r14-hometax.xlsx`
- `docs/dev-reports/2026-08-10-1156-r14-sol-reconvergence.md`

모든 캡처 경로 상수는 `resolveQaShotsDir`를 거쳤고 `QA_SHOTS_DIR=docs/qa/2026-08-10-1156-r14`, `QA_ALLOW_OVERWRITE=1`을 명시했다. `_local` 디렉터리와 직접 `writeFileSync` 산출물은 없다.

## 못 한 것 / 하지 않은 것

- 인앱 브라우저 연결은 원문 `No browser is available`, 목록 `[]`로 불가했다. 저장소 Playwright Chromium으로 실제 UI를 직접 조작했으므로 라이브 QA 판정 공백은 없다.
- `PartnerAuthService.java:144,326` 수정, 기존 전표 소급 처리, 보정 endpoint, 거래처 `1068689215` 조작, branded 타입 확장은 하지 않았다.
- git commit/push는 하지 않았다.
- `tools/legacy-gas/**`는 변경하지 않았다.
- `npm run typecheck:real-qa`의 scope test는 49/50 통과했고, 유일한 실패는 본 R14 스펙이 지시대로 아직 Git 미추적이라 공식 추적 집합에 들어가지 않았다는 증거 무결성 가드였다. 원문 `actual`은 `clients/desktop/playwright/1156-r14-sol-reconvergence-real-qa/1156-r14-sol-reconvergence-real-qa.spec.ts` 1건이다. PM이 신규 파일을 stage하면 해소되는 상태이며, 기능 판정에는 사용하지 않았다.

## 실행 결과 원문 요약

```text
R14 최종 fresh 실행: 2 passed (8.4s)
XLSX: 15 rows, 59 columns
real-QA scope: 49 passed, 1 failed (신규 R14 spec 미추적 가드)
git commit / push: 미실행
```
