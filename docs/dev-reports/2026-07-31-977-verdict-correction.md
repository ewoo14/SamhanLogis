# Issue #977 — GAS 판정표 정정 요약

- 정정일: 2026-07-31
- 대상 PR: #1005
- 기준: 이미 머지된 #997의 판정 기준을 그대로 적용
- 제한: 애플리케이션 소스·Docker·백엔드·공유 DB·Git index는 변경하지 않음

## 1. 15건 정정 내역

아래 근거는 검증 보고서의 문장을 복사한 것이 아니라, 각 원본과 현재 대응물을 직접 다시 확인한 파일:행이다.

| 항목 | 직전 판정 → 정정 판정 | 사유 | 근거 파일:행 |
|---|---|---|---|
| 2. 가배차분류리스트 | 계승 → 판정불가 | 원본 8개 실행 모드·제외 규칙과 현행 단순 주소 그룹핑의 차이 | 원본 `tools/legacy-gas/가배차분류리스트/Code.js:315-337,583-607` / 현행 `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/PreClassifyService.java:60-89` |
| 3. 가입고처리 | 계승 → 미계승 | 원본은 DPS 정제 후 이카운트 전송, 현행은 내부 구매전표 및 역방향 CSV import | 원본 `tools/legacy-gas/가입고처리/Index.html:123-170,563-641` / 현행 `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/PurchaseAccountingSlipController.java:24-57`, `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/EcountPurchaseSlipImportController.java:23-47` |
| 5. 장기미발주 거래처 선별 | 판정불가 → 미계승 | 주문·배송 활동 기반과 로그인·비밀번호 변경일 기반은 다른 판정 기능 | 원본 `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:12-232` / 현행 `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:102-120,202-218` |
| 6. 거래처 업데이트 프로그램 | 계승 → 판정불가 | 공유 시트 fan-out·Notion 할인 병합을 중앙 DB CSV upsert가 대체한다고 확정할 수 없음 | 원본 `tools/legacy-gas/거래처 업데이트 프로그램/Code.js:384-459,600-658` / 현행 `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:113-224,410-465` |
| 7. 거래처별 원장생성 프로그램 | 계승 → 판정불가 | 현재 조회·인쇄·CSV는 있으나 원본 자동 저장·기간별 history 대응을 확인하지 못함 | 원본 `tools/legacy-gas/거래처별 원장생성 프로그램/Code.js:241-316` / 현행 `clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx:230-295,374-417` |
| 8. 거래처별 일괄 거래명세서 생성 | 계승 → 판정불가 | 현재 일괄 조회·인쇄는 있으나 원본 자동 저장·history 대응을 확인하지 못함 | 원본 `tools/legacy-gas/거래처별 일괄 거래명세서 생성/Code.js:246-321` / 현행 `clients/desktop/src/renderer/routes/StatementBatchPage.tsx:97-165,204-234` |
| 11. 내일자 전표 이미지 생성 | 계승 → 판정불가 | 조회·인쇄는 있으나 원본 history 저장 대응을 확인하지 못함 | 원본 `tools/legacy-gas/내일자 전표 이미지 생성/Code.js:182-249` / 현행 `clients/desktop/src/renderer/routes/NextDaySlipPage.tsx:72-101,135-143` |
| 13. 배차안내문자 | 계승 → 판정불가 | 원본 클립보드 출력과 현행 SMS 발송이 다르고, 자격 공백 시 stub 성공 경로가 존재 | 원본 `tools/legacy-gas/배차안내문자/Index.html:880-913,1515-1555` / 현행 `clients/desktop/src/renderer/routes/DispatchSmsPage.tsx:280-332`, `services/notification-service/src/main/java/com/samhanair/logis/notification/adapter/sms/AligoSmsAdapter.java:52-80`, `infrastructure/docker-compose.prod.yml:647-650` |
| 14. 비밀번호 일괄 암호화 | 판정불가 → 미계승 | 원본 전체 계정 migration과 달리 현행은 수동 변경 encode·로그인 matches뿐 | 원본 `tools/legacy-gas/비밀번호 일괄 암호화/Code.js:6-100` / 현행 `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:186-187,235-271` |
| 15. 알리고 자동 업로드 | 판정불가 → 미계승 | FE가 실 호출 없음·TODO를 명시하고 mock client가 성공 건수만 반환 | 현행 `clients/desktop/src/renderer/routes/admin/AligoAddressBookPage.tsx:76-77,154-155`, `services/notification-service/src/main/java/com/samhanair/logis/notification/client/MockAligoAddressBookClient.java:41-61` |
| 18. 일마감 프로그램 | 계승 → 판정불가 | 원본 단가·DC·할인 공식 검증과 현행 합계 snapshot·잠금은 동일하다고 확정할 수 없음 | 원본 `tools/legacy-gas/일마감 프로그램/Code.js:269-415,420-749` / 현행 `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DailyClosingService.java:86-165,321-356`, `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:1105-1119` |
| 19. 입출고 내역 | 판정불가 → 미계승 | 원본 월별 모델 집계·차트와 현행 raw movement 조회는 핵심 결과가 다름 | 원본 `tools/legacy-gas/입출고 내역/code.js:10-85` / 현행 `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/StockController.java:170-193`, `clients/desktop/src/renderer/routes/warehouse/InventoryStockBalancePage.tsx:208-271` |
| 22. 종합견적서 | 계승(핵심 기능) → 판정불가 | live helper 12개 중 8개 미대응이고 실행 도달성을 확인하지 못함; 견적 snapshot은 별도 의미 | 원본 `tools/legacy-gas/종합견적서-live/Code.js:10,18-372,379` / 현행 `clients/web/estimate-app/lib/code.js:2452-2514`, `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/web/QuoteSnapshotController.java:41-95` |
| 23. 지방가배차분류리스트 | 계승 → 판정불가 | 원본 `지방` 표식 필터·8개 필드·정렬과 현행 17개 시도 substring 그룹은 다름 | 원본 `tools/legacy-gas/지방가배차분류리스트/Code.js:271-350` / 현행 `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/RegionalService.java:57-108` |
| 24. 품목별 DPS 입고내역 비교 | 계승 → 미계승 | 원본 양쪽 파일 매칭과 달리 현행은 내부 검사 집계·`diffFromDps=0`·Step-2 예정 | 원본 `tools/legacy-gas/품목별 DPS 입고내역 비교/Index.html:148-170,185-192,544` / 현행 `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsByProductService.java:20-41,55-82` |

## 2. 인용 오류 2건 정정

1. 6번 현재 대응물 경로를 `services/partner-service/src/main/java/com/samhanair/logis/partner/web/EcountPartnerImportController.java:23-61`에서 `services/partner-service/src/main/java/com/samhanair/logis/partner/controller/EcountPartnerImportController.java:23-61`로 정정한다.
2. 10번 부재 근거의 `clients/desktop/src/renderer/components/AppLayout.tsx:1157-1194`는 교육 자동상태변경 근거가 아니다. 해당 인용은 제거하고, 교육의 등록마감일·문자발송내역 자동 변경을 확인하지 못했다는 전체 route/controller/service 검색 결과로 정정한다. 따라서 이 항목의 판정 `미계승`은 유지한다.

## 3. 총계 변화

| 판정 | 직전 | 정정 | 변화 |
|---|---:|---:|---:|
| 계승 | 16 | **5** | -11 |
| 미계승 | 4 | **10** | +6 |
| 판정불가 | 4 | **9** | +5 |
| 합계 | 24 | 24 | 0 |

## 4. #997 영향 범위

이번 결과는 #997의 판정 기준 자체를 바꾸지 않는다. 다만 #997에서 계승으로 표시된 항목 중 일부가 화면·라우트·controller 존재를 업무 기능 계승으로 과대해석했을 가능성을 실제 15건에서 확인했다. 영향은 이번에 직접 대조한 24개 범위의 판정표 정정과, #997 판정표를 읽을 때 같은 검증 주의점을 적용해야 한다는 수준이다. #997 전체를 다시 검증하거나 #997의 머지 상태·판정을 직접 변경하지 않는다. OCR 2개와 별도 상세 대조 대상은 영향 범위에 포함하지 않는다.

## 5. 검증자와 다르게 결론 낸 항목

없음. 15건 모두 원본과 대응물을 직접 확인한 결과 검증 보고서의 정정 결론과 일치했다.

## 6. `git status --porcelain` 원문

정정 문서 작성 후 원문:

```text
 M docs/dev-reports/2026-07-31-977-gas-full-recheck.md
?? docs/dev-reports/2026-07-31-977-verdict-correction.md
```
