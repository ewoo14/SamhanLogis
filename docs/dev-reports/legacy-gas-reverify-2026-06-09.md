# 레거시 GAS 18개 재검증 + 신규 6개 스냅샷 + 파리티 매트릭스 (2026-06-09)

> 개발책임자 지시: GAS 코드 업데이트 반영 + 기능이 실제 우리 구현에 모두 들어갔는지 재검증. 라이브 Drive(`+json` export)에서 전수 추출 → 자격 redact → 레포 스냅샷 갱신 → 파리티 대조.

## 0. 방법·범위
- 라이브 소스 = Google Drive Apps Script `+json` export(base64) → 레포 `tools/legacy-gas/` 와 대조.
- **자격 전량 redact**(커밋 안전): Notion 토큰 57·이카운트 API 인증키·네이버(검색/지도)·도로명/건물 API·구글 Vision 키. Notion DB ID(32hex)는 비밀 아니므로 유지(기존 정책). **전역 재스캔 잔여 0**.
- 범위: 기존 18개 갱신+파리티 / Drive-only 8개 중 신규 6폴더 스냅샷만(2개는 기존 서브폴더와 동일).

## 1. 변경 현황 (라이브 ≠ 레포 = 이번 업데이트분)

| 프로그램 | 변경 | 핵심 내용 |
|---|---|---|
| **배차안내문자** | 🔴 대폭(Code+Index) | 멀티날짜 탭, 매칭키 단일No→**날짜+전표번호 복합키**, 전표중복 시 "날짜확인요망" 에러행, 특이사항 하차일 직접 파싱, 그룹핑 서버→클라 이동 |
| **거래처 발송 주문서** | 🔴 대폭(Code+Index) | **배송지 주소검색 신규**(도로명주소 API→네이버 Local→네이버 Geocode 병렬 지오코딩). 품목/가격 로직 불변 |
| **내일자 전표 이미지 생성** | 🟠 Index | 제이시스템 예외 `거래처명 includes`→**거래처코드 8428102605**, 안내문구 "상차 중"→"하차 예정" |
| **미배차리스트** | 🟠 Index | 따옴표 내 개행 처리 TSV 파서, 오전분류 키워드 **긴급/아침** 추가 |
| **일마감 프로그램** | 🟠 Index(FE) | 셀 직접편집(contentEditable), 특이사항 xlsx export |
| **가배차분류리스트** | 🟢 Index | 자동 탭제목("MM/DD N번까지") |
| **운송사-실배차내역 비교** | 🟢 rename | 파일명 오타 `Inde.html`→`Index.html`(내용 동일) |
| **종합견적서** | ⚠️ 미검증 | export 10MB 초과(NanumGothic 폰트 base64 ~12MB) → **라이브 변경 여부 미확인**. 레포는 선존재 이카운트 키 redact만 |
| 그 외 10개 | 무변경 | 라이브=레포 byte-identical(이미 동기화) |

## 2. 파리티 매트릭스 (GAS ↔ 우리 구현)

| 프로그램 | 우리 구현 | 파리티 | 갭 |
|---|---|---|---|
| 미배차리스트 | UnassignedService + `/dispatches/unassigned` | 🟠 부분 | 배송상태 세분류(야적/지방/보류/해당없음), 포맷문자열 생성 미반영 + **이번 update 신규 미반영** |
| 내일자 전표 이미지 | NextDaySlipImageService + NextDaySlipView | 🟠 부분 | 하차/상차 문구 로직·**J-System(8428102605) 예외** 미이식 |
| 배차안내문자 | DispatchBatchPreviewService + `/notifications/dispatch-batch` | 🟠 부분 | **단일일자만 처리** → 이번 update의 멀티날짜·복합키·전표중복 모호탐지·하차일 파싱 미반영 |
| 가배차분류리스트 | PreClassifyService + `/dispatches/pre-classify` | 🟢 구현 | 자동탭명=UX(BE 무관) |
| 지방가배차분류리스트 | RegionalService + `/dispatches/regional` | 🟢 구현 | — |
| 거래처 발송 주문서 | ProductSheetSyncService/PriceHistory/BundleExpander | 🟢 품목강함 | **주소 지오코딩(네이버/도로명/건물) 신규 기능 미구현** |
| 일마감 프로그램 | ArologisAccountingService 등 | 🟠 부분 | 일마감 전용 배치(모델 토큰 분류·priceMap·할인) 매핑 부분적 |
| 전표정리리스트 | slip-service SlipController/SlipNumberService | 🟢 구현 | Notion 이력→DB 영속(의도적 차이, SP-08 정책) |
| 종합견적서 | slip-service EstimateService + EstimateToSlipConverter | 🟢 추정강함 | **export 차단으로 최신 로직 변경 미검증(P2)** |
| DPS 입고기록 비교 | inventory DpsCompareController/Service(GAS 1번 명시) | 🟢 구현 | 매칭키 차원 차이(GAS=납품번호+모델 / 우리=productCode+거래처+입고일) |
| 품목별 DPS 입고내역 비교 | DpsCompareController.analyzeByProduct(GAS 16번) | 🟢 구현 | GAS=양측 엑셀 대조 / 우리=단측 자체 집계(비교 의미 차이) |
| 운송사-실배차내역 비교 | DispatchReconcileController/Service(GAS 11번) | 🟢 구현 | 벤더 2포맷(경기퀵/전국화물) 컬럼 분기 미구현(단일 스키마) |
| 거래처별 원장생성 | LedgerController + partnerLedgerApi(GAS 3번) | 🟢 강함 | 갭 없음 |
| 거래처별 일괄 거래명세서 | StatementBatchService(GAS 4번) | 🟢 강함 | 인감 PNG 합성 → 우리는 텍스트 `[인]`(시각 충실도) |
| 계산서일괄등록양식 | HometaxExportService(GAS 5번, 59컬럼 일치) | 🟢 완전 | 공급자 하드코딩→DB SupplierProfile(개선) |
| 알리고 자동 업로드 | AligoAddressBookSyncService + PartnerAligoExportService + AligoSmsAdapter | 🟢 구현 | 주소록 업로드 클라 mock·SMS 실키 대기 |
| 에어디자이너 주문서 인식 | AirDesignerOrderParser + VendorOrderController | 🟢 구현 | OCR=Tesseract(GAS=Google convert), 이카운트 push→DB PartnerOrder(=전환목표) |
| 제이시스템 주문서 인식 | JSystemOrderParser + 동일 파이프라인 | 🟢 구현 | OCR=Tesseract(GAS=Google Vision) — 저품질 이미지 인식률 차이 |

**요약**: 전 18개 핵심 기능은 우리 구현에 존재(15 구현/강함, 3 부분). **부분(3건) 갭은 전부 "최근 GAS 업데이트분"** — 배차안내문자 멀티날짜, 내일자전표 하차문구·J-System, 미배차 배송세분류.

## 3. 품목/견적 시트 → DB 전환 메모 (개발책임자 지시: 시트직접조회→DB 선호)

- **종합견적서·거래처 발송 주문서**가 시트 `<SHEET_ID>`의 품목마스터 5탭(`*_단가인상` 홈멀티/싱글세트/싱글구성품/상업멀티/상업멀티구성 + 자재가격 + 구형) **직접 조회**.
- 우리 `ProductSheetSyncService`가 **이미 동일 시트·동일 5탭·base-tab 로직으로 product-service DB sync 중**(Product/PriceHistory/BundleComponent/MaterialPrice/OduRecommendation). 즉 데이터는 이미 품목리스트(DB)에 편입됨.
- **전환 지점(후속 슬라이스)**: GAS의 `openById(SRC_SHEET_ID).getSheetByName(...)` 직접조회 → product-service REST 호출로 대체. 번들 전개=`BundleExpander` 1:1 이관. **할인율 정책(홈/상업 0.45, 싱글 1way 정액 등)은 시트 셀/GAS 상수에 캡슐화** → estimate 도메인 정책으로 이관 필요(현재 우리 견적 계산 API 미완).

## 4. 미해결·후속

1. **종합견적서 export 차단**(10MB 폰트) → 라이브 변경 미검증. 후속: clasp pull(개발책임자 구글 인증 필요) 또는 폰트 HTML 분리 추출.
2. **🔴 보안 — 키 회전 권고**: 라이브 GAS에 평문 노출된 자격(이카운트 API 인증키 `117d1e…`, 네이버 검색/지도, 도로명/건물 API, 구글 Vision, Notion 토큰)은 **레포엔 redact**했으나 라이브·이력 노출 상태 → 운영상 키 회전 권장. (종합 견적서 *시트*에도 평문 키 존재.)
3. **파리티 갭 슬라이스화 후보**(개발책임자 확인 대기): 배차안내문자 멀티날짜·복합키, 거래처 주문서 주소 지오코딩, 내일자전표 J-System·하차문구, 미배차 배송세분류, 운송사비교 벤더 2포맷, 거래명세서 인감 이미지, 알리고 주소록 실연동.
4. **Drive-only 신규 6개**(가입고처리/거래처 업데이트/입출고 분석·내역/비밀번호 일괄 암호화/교육안내 자동상태변경) 스냅샷만 확보 — 마이그레이션 대상 여부 개발책임자 검토 대기. (장기미발주·비밀번호 재설정은 기존 서브폴더와 동일.)
