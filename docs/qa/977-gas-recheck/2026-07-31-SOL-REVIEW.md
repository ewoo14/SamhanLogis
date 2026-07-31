# PR #1005 대조 검증 보고서

- 검증 대상: Issue #977 레거시 GAS 24개 전수 재대조 보고서
- 대상 문서: `docs/dev-reports/2026-07-31-977-gas-full-recheck.md`
- 검증일: 2026-07-31
- 검증 방식: 저장소와 ignored live 원본의 정적 코드 대조. 애플리케이션 소스와 대상 판정표는 수정하지 않았다.

## 1. 최종 판정: BLOCK

현재의 `계승 16 · 미계승 4 · 판정불가 4` 판정은 그대로 승인할 수 없다.

- `계승` 16건을 원본 업무 흐름과 현재 service까지 다시 대조한 결과, **11건**은 판정을 유지할 수 없었다. 화면이나 endpoint는 있으나 원본의 일괄 처리, 외부 전송, 저장 이력 또는 핵심 분류 알고리즘이 없거나 다르다.
- 기존 `판정불가` 4건은 정적 코드만으로도 미구현 또는 mock임을 결론 낼 수 있어 모두 **미계승**으로 바꿔야 한다.
- 판정표의 `파일:행` 인용은 245개 행·범위 앵커를 모두 열었다. 파일 경로 오류 1개와 내용상 근거가 되지 않는 인용 1개, 합계 **2개 오류**를 확인했다.
- 판정을 고치면 총계는 **계승 5 · 미계승 10 · 판정불가 9**가 된다.

| 판정 | 현재 | 검증 결과 |
|---|---:|---:|
| 계승 | 16 | **5** |
| 미계승 | 4 | **10** |
| 판정불가 | 4 | **9** |
| 합계 | 24 | **24** |

## 2. 첫 번째 각도 — `계승` 16건 전수 대조

`계승`으로 적힌 16건을 모두 확인했다. 판정을 유지할 수 있는 것은 1, 9, 12, 17, 21번의 5건이다.

| # | 항목 | 검증 판정 | 핵심 확인 결과 |
|---:|---|---|---|
| 1 | DPS 입고기록 비교 | 계승 유지 | multipart DPS 파일을 실제 비교 service에 전달하고, 자동·수동 저장 및 최신 이력을 DB에 저장한다. `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsCompareController.java:72-79`, `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsSaveHistoryController.java:58-59,139-145` |
| 2 | 가배차분류리스트 | **판정불가로 변경** | 원본은 8개 실행 모드와 창고·야적·회수·차용·자가·경동·로젠 제외/집계 규칙이 있다. 현행은 주소를 `RegionClassifier`로 한 번 분류해 그룹핑할 뿐이다. |
| 3 | 가입고처리 | **미계승으로 변경** | 원본은 DPS 입고자료를 정제해 이카운트 구매 API로 외부 전송한다. 현행 구매전표는 내부 작성·전기이고, 인용된 이카운트 기능은 반대 방향인 CSV import다. |
| 6 | 거래처 업데이트 프로그램 | **판정불가로 변경** | 원본은 대상 공유 시트 전체에 거래처 master를 fan-out하고 Notion 할인값을 병합한다. 현행은 중앙 partner DB CSV upsert와 개별 할인 편집이며, 일괄 fan-out/Notion 병합의 대체 관계가 입증되지 않았다. |
| 7 | 거래처별 원장생성 프로그램 | **판정불가로 변경** | 현재 원장 조회·인쇄·CSV는 있다. 그러나 원본의 결과 자동 저장과 기간별 history 조회에 대응하는 현재 저장 흐름은 없다. |
| 8 | 거래처별 일괄 거래명세서 생성 | **판정불가로 변경** | 현재 일괄 조회·선택 인쇄는 있다. 원본의 결과 자동 저장과 history 조회는 현재 화면·controller에서 확인되지 않는다. |
| 9 | 계산서일괄등록양식 생성 | 계승 유지 | download/preview, 제외 거래처, 분할 파일 및 저장 이력이 실제 API와 화면에 연결되어 있다. `clients/desktop/src/renderer/routes/HometaxExportPage.tsx:192-204,360-443,949-1034` |
| 11 | 내일자 전표 이미지 생성 | **판정불가로 변경** | 현재 조회·인쇄 화면은 있다. 원본의 저장 이력 기능은 현재 페이지의 query/print 흐름에 없다. |
| 12 | 미배차리스트 | 계승 유지 | 판정표가 인용한 구형 desktop 화면 외에도 독립 아로로지스 화면에 `AUTO_LATEST`·`MANUAL_NAMED` 이력이 있고 수동 배차 이동이 연결된다. `clients/arologis-desktop/src/renderer/routes/dispatches/UnassignedPage.tsx:97-183,262-307` |
| 13 | 배차안내문자 | **판정불가로 변경** | 원본은 단톡방별 문구를 가공하고 클립보드로 복사한다. 현행은 SMS 발송으로 바뀌었고 복사 기능이 없으며, 자격이 비어 있으면 성공처럼 반환하는 Aligo stub 경로가 있다. 운영 자격 주입 여부를 정적으로 확정할 수 없다. |
| 17 | 운송사-실배차내역 비교 | 계승 유지 | 다중 운송사 파일을 실제 multipart endpoint로 보내 비교하고 자동·수동 이력을 저장한다. `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchReconcilePage.tsx:158-205,384-402`, `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/DispatchReconcileController.java:39-74` |
| 18 | 일마감 프로그램 | **판정불가로 변경** | 원본 핵심에는 모델·단가·DC·할인 공식 검증이 포함된다. 현행은 세금계산서·매출·매입전표 합계 snapshot과 잠금이며, 화면도 매입 재검증을 정식 단가 감사가 아닌 참고값이라고 명시한다. |
| 21 | 전표정리리스트 | 계승 유지 | 조회뿐 아니라 `AUTO_LATEST`·`MANUAL_NAMED` 저장과 상세 복원이 DB service에 구현돼 있다. `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipCleanupSaveHistoryController.java:55-145`, `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipCleanupSaveHistoryService.java:52-74,164-180` |
| 22 | 종합견적서 | **판정불가로 변경** | 현재 견적·주문·견적 snapshot은 존재한다. 다만 live 앞부분의 거래원장용 helper 12개 중 업무 대응 2개와 별도 흐름의 기술 유틸 대응 2개를 제외한 8개가 미대응이며, 해당 블록의 실행 도달성도 확인되지 않았다. 누락을 별도 gap으로만 적고 프로젝트를 계승 처리할 근거가 부족하다. |
| 23 | 지방가배차분류리스트 | **판정불가로 변경** | 원본은 주소가 `지방` 표식인 행만 선택해 표식을 제거하고 8개 업무 필드와 정렬을 보존한다. 현행은 모든 주소를 17개 시도 substring으로 묶고 반환 필드도 다르다. |
| 24 | 품목별 DPS 입고내역 비교 | **미계승으로 변경** | 원본은 이카운트와 DPS 파일을 각각 업로드해 서로 매칭한다. 현행 service는 내부 `inbound_inspections`만 집계하고 `diffFromDps = 0`, “DPS 엑셀 연동은 Step-2”라고 명시한다. 화면이 있어도 비교 기능은 아직 없다. |

## 3. 뒤집어야 할 항목

| 항목 | 현재 판정 | 올바른 판정 | 근거 파일:행 |
|---|---|---|---|
| 2. 가배차분류리스트 | 계승 | **판정불가** | 원본 8개 모드와 제외 규칙: `tools/legacy-gas/가배차분류리스트/Code.js:315-337,583-607`; 현행 단순 주소 그룹핑: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/PreClassifyService.java:60-89` |
| 3. 가입고처리 | 계승 | **미계승** | 원본 DPS 정제·이카운트 전송: `tools/legacy-gas/가입고처리/Index.html:123-170,563-641`; 현행은 내부 구매전표 및 역방향 CSV import: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/PurchaseAccountingSlipController.java:24-57`, `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/EcountPurchaseSlipImportController.java:23-47` |
| 5. 장기미발주 거래처 선별 | 판정불가 | **미계승** | 원본 주문·배송 로그 일괄 판정: `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:12-232`; 현행 로그인·비밀번호 변경일 30일 판정: `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:102-120,202-218` |
| 6. 거래처 업데이트 프로그램 | 계승 | **판정불가** | 공유 시트 fan-out: `tools/legacy-gas/거래처 업데이트 프로그램/Code.js:384-459`; Notion 할인 병합: 같은 파일 `:600-658`; 현행 중앙 DB upsert: `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:113-224,410-465` |
| 7. 거래처별 원장생성 프로그램 | 계승 | **판정불가** | 원본 자동 저장·history: `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:241-316`; 현행은 query·인쇄·CSV: `clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx:230-295,374-417` |
| 8. 거래처별 일괄 거래명세서 생성 | 계승 | **판정불가** | 원본 자동 저장·history: `tools/legacy-gas/거래처별 일괄 거래명세서 생성/Code.js:246-321`; 현행은 query·선택/전체 인쇄: `clients/desktop/src/renderer/routes/StatementBatchPage.tsx:97-165,204-234` |
| 11. 내일자 전표 이미지 생성 | 계승 | **판정불가** | 원본 history 저장: `tools/legacy-gas/내일자 전표 이미지 생성/Code.js:182-249`; 현행은 조회·인쇄만 연결: `clients/desktop/src/renderer/routes/NextDaySlipPage.tsx:72-101,135-143` |
| 13. 배차안내문자 | 계승 | **판정불가** | 원본 클립보드 출력: `tools/legacy-gas/배차안내문자/Index.html:880-913,1515-1555`; 현행 발송 UI: `clients/desktop/src/renderer/routes/DispatchSmsPage.tsx:280-332`; 자격 placeholder 시 stub-success: `services/notification-service/src/main/java/com/samhanair/logis/notification/adapter/sms/AligoSmsAdapter.java:52-80`; 운영 기본값 공백: `infrastructure/docker-compose.prod.yml:647-650` |
| 14. 비밀번호 일괄 암호화 | 판정불가 | **미계승** | 원본 전체 계정 순회·hash 갱신: `tools/legacy-gas/비밀번호 일괄 암호화/Code.js:6-100`; 현행은 수동 변경 시 encode와 로그인 시 matches뿐이며 upgrade 저장이 없음: `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:186-187,235-271` |
| 15. 알리고 자동 업로드 | 판정불가 | **미계승** | FE가 실 호출 없음과 후속 TODO를 명시: `clients/desktop/src/renderer/routes/admin/AligoAddressBookPage.tsx:76-77,154-155`; client가 외부 호출 없이 성공 건수를 반환: `services/notification-service/src/main/java/com/samhanair/logis/notification/client/MockAligoAddressBookClient.java:41-61` |
| 18. 일마감 프로그램 | 계승 | **판정불가** | 원본 단가·DC·할인 검증: `tools/legacy-gas/일마감 프로그램/Code.js:269-415,420-749`; 현행 합계 snapshot·잠금: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DailyClosingService.java:86-165,321-356`; 정식 단가 감사 아님: `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:1105-1119` |
| 19. 입출고 내역 | 판정불가 | **미계승** | 원본 월별 모델 집계·차트: `tools/legacy-gas/입출고 내역/code.js:10-85`, `tools/legacy-gas/입출고 내역/index.html:202-248`; 현행은 raw movement 조회: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/StockController.java:170-193`, `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:208-271` |
| 22. 종합견적서 | 계승(핵심 기능) | **판정불가** | live 구형 helper·중복 entrypoint: `tools/legacy-gas/종합견적서-live/Code.js:10,18-372,379`; 현행 견적 snapshot은 별도 의미: `clients/web/estimate-app/lib/code.js:2452-2514`, `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/web/QuoteSnapshotController.java:41-95` |
| 23. 지방가배차분류리스트 | 계승 | **판정불가** | 원본 `지방` 표식 필터·8개 필드·정렬: `tools/legacy-gas/지방가배차분류리스트/Code.js:271-350`; 현행 17개 시도 substring 그룹: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/RegionalService.java:57-108` |
| 24. 품목별 DPS 입고내역 비교 | 계승 | **미계승** | 원본 양쪽 파일 업로드: `tools/legacy-gas/품목별 DPS 입고내역 비교/Index.html:148-170,185-192,544`; 현행 DPS 차이를 0으로 고정하고 연동을 후속 단계로 명시: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsByProductService.java:20-41,55-82` |

## 4. 인용 검증 결과

- 전수 확인: 판정표 §4의 **경로 인용 블록 84개**, 쉼표로 나열한 행 번호와 범위를 분리한 **행·범위 앵커 245개 중 245개**
- 틀린 인용: **2개 앵커**
  1. 6번 현재 대응물의 `services/partner-service/src/main/java/com/samhanair/logis/partner/web/EcountPartnerImportController.java:23-61`은 파일이 없다. 실제 경로는 `services/partner-service/src/main/java/com/samhanair/logis/partner/controller/EcountPartnerImportController.java:23-61`이다.
  2. 10번 부재 근거의 `clients/desktop/src/renderer/components/AppLayout.tsx:1157-1194`는 교육 자동상태변경 범위가 아니라 매출 마감·회계 기간 마감·총계정원장 메뉴다. 교육 기능 부재의 직접 근거가 되지 않는다.
- 행 범위를 벗어난 인용은 없었다.
- 나머지 243개 앵커는 파일과 행 내용이 존재한다. 다만 “인용이 실재한다”와 “원본 기능을 계승한다”는 별개다. 특히 2, 3, 6, 7, 8, 11, 13, 18, 22, 23, 24번은 인용한 화면/controller가 존재해도 service의 업무 동작이 원본과 다르거나 일부가 빠져 판정을 뒤집었다.

## 5. 종합견적서 live 재현 및 helper 12개

### 5.1 수치 재현

| 항목 | 직접 재현값 |
|---|---:|
| live `Code.js` | **3,577행** |
| tracked `Code.js` | **3,204행** |
| 행 수 차이 | **373행** |
| live `doGet` | **`:10`, `:379`** |
| tracked `doGet` | **`:6`** |

live의 두 번째 `doGet` 이후와 tracked 본문은 대부분 같지만 완전히 동일하지는 않았다. 정적 문자열 검색상 live의 HTML 6개 파일에서는 아래 구형 helper 12개를 직접 호출하는 문자열이 0건이었다. 그렇더라도 GAS를 실행하지 않았으므로 간접 호출이나 배포 도달성을 단정하지 않았다.

### 5.2 helper별 현재 대응 여부

| live helper | 현재 대응 여부 | 대조 결과 |
|---|---|---|
| `getUserAuth` | 대응 | 이름은 다르지만 estimate-app의 `checkUserAuth`가 인증 gate를 수행한다. `clients/web/estimate-app/lib/code.js:2713-2744` |
| `getChatMapData` | 대응 | notification-service 매핑 조회를 accounting-service 원장·거래명세서가 실제 호출한다. `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ChatRoomMappingClient.java:15-19,48-52`, `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LedgerImageService.java:42-65` |
| `saveFilterWordsToNotion` | 미대응 | 필터링 단어 목록을 저장하는 현재 흐름을 확인하지 못했다. |
| `getFilterWordsFromNotion` | 미대응 | 필터링 단어 목록을 복원하는 현재 흐름을 확인하지 못했다. |
| `saveClientCodesToNotion` | 미대응 | 사용자 선택 거래처코드 목록 저장의 대응물을 확인하지 못했다. 중앙 partner master 자체는 같은 동작이 아니다. |
| `getClientCodesFromNotion` | 미대응 | 위 저장 목록을 복원하는 대응물을 확인하지 못했다. |
| `compressString` | 기술 대응·미연결 | gzip+base64 동등 구현은 홈택스 batch에 있다. 다만 이 live 거래원장/견적 흐름에는 연결되지 않는다. `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/TaxInvoiceBatchService.java:448-471` |
| `decompressString` | 기술 대응·미연결 | gzip+base64 동등 해제 구현은 홈택스 batch에 있다. 다만 관련 흐름에는 연결되지 않는다. `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/TaxInvoiceBatchService.java:473-489` |
| `autoSaveResultToNotion` | 미대응 | live 함수는 `프로그램유형=거래원장결과`를 저장한다. 현재 견적 snapshot은 견적 상태 저장이므로 동일 기능이 아니다. `tools/legacy-gas/종합견적서-live/Code.js:241-277` |
| `getHistoryFromNotion` | 미대응 | `거래원장결과` 기간 이력의 대응물을 확인하지 못했다. `tools/legacy-gas/종합견적서-live/Code.js:281-316` |
| `getSpecificHistory` | 미대응 | 위 이력의 특정 결과 복원 대응물을 확인하지 못했다. `tools/legacy-gas/종합견적서-live/Code.js:320-339` |
| `getLatestHistoryFromNotion` | 미대응 | 위 결과의 최신 자동 복원 대응물을 확인하지 못했다. `tools/legacy-gas/종합견적서-live/Code.js:343-372` |

집계는 **업무 대응 2 · 별도 흐름의 기술 유틸 대응 2 · 미대응 8**이다. 기술 유틸 2개는 해당 업무 흐름에 연결되지 않았으므로 프로젝트 계승 근거로 세지 않았다. 따라서 8개 미대응 helper를 “별도 parity gap”으로 남기면서 22번 전체를 계승으로 확정하는 것은 보고서 자체의 판정 기준과 맞지 않는다.

## 6. 기존 `미계승 4 · 판정불가 4` 재검증

### 6.1 기존 미계승 4건

- 4. 기간별 비밀번호 재설정: 다른 이름의 월별 일괄 순환 scheduler/job을 찾지 못했다. **미계승 유지**.
- 10. 교육안내 자동상태변경: 전체 route/controller/service 검색에서도 등록마감일·문자발송내역 자동 상태변경을 찾지 못했다. **미계승 유지**. 다만 판정표의 AppLayout 인용은 잘못됐다.
- 16. 영업수수료 계산: 제경비·카드수수료·원천징수·도급비 공식을 실행하고 결과를 저장하는 대응물을 찾지 못했다. **미계승 유지**.
- 20. 입출고 분석: 수요·출고 예측과 재고추천 dashboard의 대응 route/service를 찾지 못했다. **미계승 유지**.

다른 이름으로 계승된 것으로 확인된 항목은 **0건**이다.

### 6.2 기존 판정불가 4건

- 5번은 주문·배송 활동 일괄 판정과 로그인 기반 만료가 다른 기능이므로 **미계승**으로 결론 가능하다.
- 14번은 전체 계정 migration도 로그인 성공 시 lazy upgrade도 없으므로 **미계승**으로 결론 가능하다.
- 15번은 FE와 client가 mock/no external call을 명시하므로 **미계승**으로 결론 가능하다.
- 19번은 raw movement 조회는 있으나 원본 월별 모델 집계·차트가 없으므로 **미계승**으로 결론 가능하다.

즉, `판정불가` 4건은 과대평가되어 있었고 조금 더 정적 코드를 확인하면 모두 결론이 난다.

## 7. 보안 보관 판단

- `.gitignore:195-197`의 `tools/legacy-gas/종합견적서-live/` 및 `.clasp.json` 제외 규칙은 공개 저장소 기준으로 타당하다.
- `git check-ignore -v`로 live `Code.js`와 `appsscript.json`이 실제로 이 규칙에 의해 제외됨을 확인했고, `git ls-files` 결과 live 디렉터리 추적 파일은 0개였다.
- 대상 보고서에서 Notion bearer/token 형태, Google API key, GAS 배포 URL의 script ID, `scriptId` 대입, private key, 자격값 대입 패턴을 검색했으며 모두 0건이었다. 보고서에 적힌 SHA-256 앞 16자리는 파일 식별 hash이며 자격값이 아니다.
- 다만 ignored 로컬 사본은 Git 유출 방지 수단일 뿐 내구성 있는 보안 백업은 아니다. 레거시 종료 전에 별도의 암호화·접근통제 보관 위치와 복구 절차를 갖춰야 한다.

## 8. 이 라운드가 보지 않은 것

- 프로젝트 단위로는 **24개 중 24개**를 보았다. `계승` 16/16, `미계승` 4/4, `판정불가` 4/4와 판정표 인용 245/245를 정적 코드로 확인했다.
- 원본의 업무 판정에 필요한 함수·화면 이벤트는 확인했지만, 24개 프로젝트의 CSS, 폰트 payload, 장식용 HTML까지 모든 줄을 의미 단위로 재검토한 것은 아니다.
- Docker 이미지 재빌드, backend 기동·재기동, 공유 DB 조회·쓰기, GAS 배포 실행, Notion·Google Sheet·이카운트·알리고 실호출은 하지 않았다.
- 따라서 실제 운영 환경의 Aligo 자격 주입 여부, live 첫 번째 `doGet`과 구형 helper의 실행 도달성, 외부 데이터가 있을 때의 결과 동일성은 보지 않았다. 이 불확실성은 해당 항목을 계승으로 올리는 근거가 아니라 13번·22번을 판정불가로 두는 이유다.
- 이번 24개 산정에서 제외된 OCR 2개, 이미 별도 상세 대조된 `거래처 발송 주문서` 본체는 다시 판정하지 않았다.

## 9. 검증 중 준수한 제한

- 대상 판정표 및 애플리케이션 소스 수정 없음
- Git index·commit·branch·remote 쓰기 없음
- Docker·backend·공유 DB 변경 없음
- 본 검증 보고서 1개만 신규 작성
