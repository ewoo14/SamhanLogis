# Legacy Apps Script + Google Sheet → SamhanLogis 이식 프레임워크

> **목표**: 기존 Google Apps Script (종합견적서 / 거래처 주문서 / 장기미발주 거래처 선별) + Google Sheet DB 를 SamhanLogis 마이크로서비스 + 디자인 시스템 + Electron 앱에 **무손실** 이식.

> **원칙**: 코드 손실 0, 함수 단위 분석 누락 0, 멀티 에이전트 cross-review 의무, QA 엄중 검증.

---

## 디렉토리 구조

```
migration/
├── README.md                          # 본 문서 (프로세스 가이드)
├── source/                            # 원본 자산 (사용자 제공)
│   ├── scripts/
│   │   ├── estimate/                  # 종합견적서 — clasp pull 결과 그대로
│   │   ├── partner-order/             # 거래처 주문서
│   │   └── long-pending/              # 장기미발주 거래처 선별
│   └── sheet/
│       └── workbook.xlsx              # 시트 전체 export (모든 탭 포함)
├── analysis/                          # 에이전트 분석 산출물
│   ├── 01-script-analysis-{name}.md   # Phase 1 — 스크립트별 함수 단위 분석
│   ├── 02-cross-review.md             # Phase 2 — Cross-review 결과
│   ├── 03-sheet-schema.md             # Phase 3 — 시트 스키마 (탭별 header_row, columns)
│   ├── 04-migration-plan.md           # Phase 4 — 종합 이식 Plan
│   ├── 05-discussion-round-{N}.md     # Phase 5 — Agent 간 discussion 회차
│   └── 06-feature-parity-matrix.md    # Phase 7 — QA 기능 ↔ 이식 결과 1:1 매트릭스
└── decisions/                         # 사용자 의사결정 기록
    └── DECISIONS.md
```

---

## 사용자 제공 의무

### 1. Apps Script 소스 (clasp 권장 — 무손실)

각 PC (Node.js 18+ 필요) 에서:

```bash
npm install -g @google/clasp
clasp login        # 브라우저 OAuth 동의

# 종합견적서
mkdir -p migration/source/scripts/estimate && cd migration/source/scripts/estimate
clasp clone 1AKsi6-LJpajDhLnkX0-Q2qxSWQkyEq7ohWlpaFWKJzSTHUTqs42COypd
cd ../../../..

# 거래처 주문서
mkdir -p migration/source/scripts/partner-order && cd migration/source/scripts/partner-order
clasp clone 1JdlDQWhgfI0k8NsTkjCIqBHGXuhMwIW58qc-RYQgLoXZDoqkOa46jtXj
cd ../../../..

# 장기미발주 거래처 선별
mkdir -p migration/source/scripts/long-pending && cd migration/source/scripts/long-pending
clasp clone 1Vb3mEMACYe_CKa5U3Lv47l_IJ6I2nAmERyWnrvctzCHG2-Sv43xkdi3D
cd ../../../..
```

각 디렉토리에 `.gs` (또는 `.js`) + `.html` (web app UI) + `appsscript.json` (manifest) 가 떨어집니다.

> **주의**: clasp pull 후 `.clasp.json` 파일은 **삭제** 후 commit (script ID 노출 방지).

### 2. 시트 전체 export — Apps Script JSON dump (필수)

> **xlsx 비추천**: ARRAYFORMULA / QUERY / IMPORTRANGE 등 Google 전용 함수 결과가 `#NAME?` 으로 깨짐 (사용자 회고).

**1회용 Apps Script 사용** (`migration/source/sheet/dump-script.gs` 참조):
1. 시트 [확장 프로그램] → [Apps Script]
2. `dump-script.gs` 내용을 Code.gs 에 붙여넣기 → 저장
3. OAuth 동의 (시트 읽기 + Drive 파일 생성)
4. **두 함수 각각 1회씩 실행** (Phase 1.5 의무):
   - `dumpAllTabsAsJson` → `samhan-sheet-dump-*.json` (display values)
   - `dumpAllFormulas` → `samhan-sheet-formulas-*.json` (수식 자체 — 변동DC 룰 검증용 `$L$2`/`$D$7`/`$D$8`/`$I$1` 절대참조 패턴 추출)
5. 두 파일 다운로드 후 각각 `migration/source/sheet/workbook.json` / `formulas.json` 으로 저장 후 commit

JSON 구조:
```json
{
  "{탭명}": {
    "lastRow": 100,
    "lastColumn": 15,
    "hidden": false,
    "values": [["A1","B1","C1"], ["A2","B2","C2"], ...]
  }
}
```

`getDisplayValues()` 는 시트 화면 그대로 — 모든 수식 결과값 + 포맷팅(콤마/통화) 보존.

### 3. 시트 탭 메타데이터 (옵션, 가능하면)

각 탭의 **용도** + **헤더 행 위치** + **대략적인 행 수** 를 텍스트로 알려주시면 분석 속도 크게 향상:

```
- 품목마스터 (header=row 2, ~500 rows) — 모델명/품목명/규격/단가
- 거래처마스터 (header=row 1, ~80 rows) — 회사명/담당자/연락처/배송지
- 견적이력 (header=row 3, ~2000 rows) — 견적번호/거래처/금액/상태
- ...
```

---

## 멀티 에이전트 워크플로 (7 Phase)

### Phase 1 — 스크립트별 함수 단위 분석 (3 agent parallel)
- 각 스크립트별 1 agent 디스패치
- 산출: `01-script-analysis-{name}.md`
- 의무 항목:
  - 모든 함수 inventory (이름 / 시그니처 / 호출 그래프)
  - 각 함수가 시트의 어떤 탭/범위 를 read/write 하는지
  - 외부 의존 (Drive API / Gmail / SpreadsheetApp.getUi() 등)
  - HTML 트리거 (web app onLoad / button click)
  - 누락 0 가드: `function ` 키워드 grep count = inventory 행 수 일치
  - **§변동DC 섹션** — 변동DC 감지 룰 (수식 패턴/키워드/셀 위치) 함수 단위 추출 (DOMAIN-EXTENSIONS §1)
  - **§세트품목 섹션** — 세트(Bundle) 품목 데이터 구조 식별 (시트 별도 탭? 컬럼 마커? 펼침 공식?) (DOMAIN-EXTENSIONS §2)

### Phase 2 — Cross-review (Reviewer agent)
- Phase 1 산출 3 파일을 모두 읽고 누락/오해 catch
- 산출: `02-cross-review.md`
- 의무 항목: 각 스크립트 분석에 누락 함수 0 확인 + 시트 read/write 정합성

### Phase 3 — Sheet 스키마 분석 (Schema agent)
- Phase 1+2 분석 + 사용자 제공 xlsx 를 입력
- 각 탭의 header_row / data_start_row / 컬럼 명세 도출
- 산출: `03-sheet-schema.md`
- 의무 항목: 헤더 위치가 탭별로 다른 케이스 명시 (사용자 강조)

### Phase 4 — Migration Plan (Plan agent)
- Phase 1+2+3 종합 → 이식 명세
- 산출: `04-migration-plan.md`
- 의무 항목:
  - product-service 시드 데이터 매핑 (sheet → ProductMaster)
  - partner-service 시드 데이터 매핑 (sheet → PartnerMaster) — Phase 4 partner 슬라이스와 통합
  - 신규 EstimateService (종합견적서) — 도메인/API/UI 명세
  - slip-service 확장 (거래처 주문서) 또는 신규 OrderService
  - 신규 PartnerAnalyticsService (장기미발주 거래처 선별)

### Phase 5 — Discussion round (3+ 회차)
- Plan agent + 분석 agent + Reviewer agent 가 서로의 산출물을 review 후 재논의
- 산출: `05-discussion-round-{N}.md`
- 누락/오해/우선순위 재조정

### Phase 6 — 5-team 구현 (단계별)
- 각 마이그레이션 단계마다 별도 5-team parallel 디스패치
- 단계 권장:
  - **M1**: 시트 데이터 → product-service 시드 (단순, 무위험)
  - **M2**: 시트 데이터 → partner-service 시드 (Phase 4 partner 슬라이스)
  - **M3**: 종합견적서 신규 EstimateService
  - **M4**: 거래처 주문서 통합 (slip-service 확장 또는 OrderService 신규)
  - **M5**: 장기미발주 거래처 선별 (PartnerAnalytics)

### Phase 7 — QA 엄중 검증
- `06-feature-parity-matrix.md` — Apps Script 함수 inventory ↔ 이식된 endpoint/UI 1:1 매트릭스
- 각 함수마다 fixtures + 시연 + 캡처
- 누락 시 Phase 6 으로 회귀

---

## 회고 가드 적용
- `feedback_pm_integration_build_check.md` Layer 1+2+3+4+5
- `feedback_multi_agent_team_pattern.md` (5-team 디스패치)
- `feedback_function_documentation.md` (한국어 Javadoc + dev-reports)
- `feedback_uuid_no_user_visibility.md` (UUID 미노출)
- `feedback_korean_commits.md`
- 본 문서 신규 가드:
  - **이식 무손실 의무**: 함수 inventory 누락 0
  - **멀티 라운드 cross-review** 의무 (3 회차 이상)

---

## 다음 단계

1. **사용자**: clasp pull 3개 + xlsx export → `migration/source/` 에 commit
2. **PM (Claude)**: Phase 1 — 3개 분석 agent parallel 디스패치
3. 후속 Phase 2~7 진행

> **타임라인 추정**: 사용자 자료 제공 후 ~3~5 일 (Phase 1~5 분석 1일, 5-team 구현 2~3일, QA 1일).
