# #896 이관 전 레거시 출력 기준선

## 연결 확인 기록

**실제 Google Sheets 연결 확인: 성공**

- 취득 시각: **2026-08-08 20:35:59 KST** (`2026-08-08T11:35:59Z`)
- 앱: `@samhan/estimate-app` `2.0.0`
- commit SHA: `a8bffbbb782c8953c24977cc13816a677aca9725`
- 기동 계약: `CATALOG_SOURCE=sheet`, `GOOGLE_SERVICE_ACCOUNT_KEY`는 저장소 밖 키 파일의 경로만 셸 환경변수로 주입
- 연결 증거: 홈멀티 109행, 싱글세트 226행, 싱글구성품 1,451행, 상업멀티 392행, 상업구성품 516행, 구형 41행을 앱 부트스트랩과 실제 렌더 페이지 양쪽에서 확인
- 실값 표본: `AJ060MXHNBC1` 1,611,115원, `AC060CS6PBH1SY` 1,660,000원, 구성품 `AC060CN6PBH1` 606,000원

키 파일 내용은 출력·복사하지 않았고 저장소에 `.env`를 만들지 않았다. 시트·DB 쓰기 요청도 수행하지 않았다.

### 중요 관찰 — 현재 앱의 실제 탭 선택이 개발책임자 방향과 다름

현재 `estimate-app/lib/code.js`의 getter 상수는 다음 탭을 정본처럼 읽는다.

- `홈멀티_단가인상`
- `싱글 세트_단가인상`
- `싱글 구성품_단가인상`
- `상업멀티_단가인상`
- `상업멀티 구성_단가인상`

접미사 없는 5개 탭도 preload 목록에는 들어가지만, 현재 getter의 실제 파싱 대상은 위 `_단가인상` 탭이다. 이는 “접미사 없는 탭이 정본이고 `_단가인상`은 오버레이”라는 2026-08-08 방향과 다르다. 따라서 본 산출물은 **지정된 현재 저장소 `estimate-app`이 실제 출력한 기준선**이며, 라이브 GAS 최신 코드의 접미사 없는 정본 출력과 동일하다고 간주하면 안 된다. 이관 판정 전에 이 차이를 명시적으로 해소해야 한다.

## 축별 기준선

| 축 | 파일 | 내용 |
|---|---|---|
| 연결·버전 | `00-metadata.json` | 취득 시각, 앱/commit, 시트 ID, 실제 앱 탭 상수, 행 수와 실값 표본 |
| ① 품목 목록·분류 | `01-catalog-and-categories.json` | 6개 소스 전 행, 노출 순서, 대/중/소분류, 모델·단가·출고가·규격 |
| ② 세트 전개 | `02-set-expansion.json` | 싱글 226세트와 상업 86세트를 수량 1로 전개한 구성품·수량·단가; 전개 오류 0건 |
| ③ 옵션·특징 | `03-options-features-defaults.json` | 옵션 선택지/기본값, 시트 기본값, 싱글 구성품 1,451행의 특징·기본 여부 |
| ④ 수량 파생 | `04-quantity-derived.json` | 홈 판넬·리모컨·유연호스·분기관 및 상업 리모컨·드레인펌프 파생 결과 |
| ⑤ 금액 | `05-price-scenarios.json` | 5개 고정 입력의 상세 행, 단가·소계·공급가·부가세·총액 |
| 런타임 진단 | `99-runtime-diagnostics.json` | 페이지 오류와 HTTP 4xx 응답 |
| 무결성 | `SHA256SUMS.txt` | 기준선 파일 SHA-256 |
| 육안 보조 | `screenshots/*.png` | 실제 시트 연결 초기 화면과 기본 세트 상세 견적 화면 |

## 입력 조합과 금액 기준선

모든 금액은 VAT 10% 포함 총액을 기준으로 공급가를 반올림 분리하고, `공급가 + 부가세 = 총액`을 확인했다.

| ID | 입력 | 공급가 | 부가세 | 총액 |
|---|---|---:|---:|---:|
| `single-item` | 홈 `AJ060MXHNBC1` × 2, 기본 옵션 | 2,929,300 | 292,930 | 3,222,230 |
| `single-set-default` | 싱글세트 `AC060CS6PBH1SY` × 1, 원형 기본 판넬·기본 리모컨 | 1,509,091 | 150,909 | 1,660,000 |
| `single-set-options` | 같은 세트 × 1, 사각 블랙판넬 + 유선리모컨 | 1,600,000 | 160,000 | 1,760,000 |
| `single-set-discount` | 같은 세트 × 2, 360 할인 50,000원/세트 | 2,927,273 | 292,727 | 3,220,000 |
| `freight-and-cutoff` | `AJ060MXHNBC1` × 1 + 운임 120,000원 + 1,000원 단위 자동 절삭 | 1,573,636 | 157,364 | 1,731,000 |

세트 옵션 조합의 상세 구성은 `AC060CN6PBH1` 606,000원 + `AC060CXAPBH1` 910,000원 + `PC6NBDK1NW` 188,000원 + `AWR-WE13N` 56,000원 = 1,760,000원이다.

## 수량 파생 기준선 요약

홈 입력은 `AJ060MXHNBC1` × 1, `AJ012BN1PBC2` × 2, `AM052BN4DBH1` × 1이다. 파생 결과는 1Way 호스 2, 4Way 호스 1, `AXJ-YA2512N` 1, `AXJ-YA1509N` 1, `AR-EC05` 3, `PC1MWSK3NW` 2, `PC4NUFK1NW` 1이다.

상업 입력은 `AM072TNCDBH1` × 2, `AM052DNLDBH1` × 1이다. 파생 결과는 `MDP-Z075SZED` 1, `ADP-F075SP` 2, `AR-EH05` 2, `AWR-WE13N` 1이다.

## 재현 방법

첫 번째 PowerShell에서 앱을 시트 모드로 띄운다. 키는 경로만 주입한다.

```powershell
Set-Location C:\dev\Samhan-Public\clients\web\estimate-app
$env:PORT='5183'
$env:GOOGLE_SERVICE_ACCOUNT_KEY='C:\dev\samhan-homepage-260f8ae469cc.json'
$env:CATALOG_SOURCE='sheet'
$env:SHEET_CACHE_TTL_SEC='300'
$env:DEFAULT_USER_EMAIL='dev_master@samhan-air.com'
node server.js
```

두 번째 PowerShell에서 기준선을 다시 취득한다. 캡처 목적지는 상대경로이며 `resolveQaShotsDir`를 경유한다.

```powershell
Set-Location C:\dev\Samhan-Public
$env:QA_BASE_URL='http://127.0.0.1:5183'
$env:QA_EMAIL='dev_master@samhan-air.com'
$env:QA_SHOTS_DIR='docs/qa/896-legacy-output-baseline/screenshots'
$env:QA_ALLOW_OVERWRITE='1'
node .\docs\qa\896-legacy-output-baseline\capture-baseline.mjs
```

이관 후 출력은 별도 디렉터리로 받아 기준선을 보존한다.

```powershell
$env:QA_BASELINE_OUT_DIR='docs/qa/896-post-migration-output'
$env:QA_SHOTS_DIR='docs/qa/896-post-migration-output/screenshots'
$env:QA_ALLOW_OVERWRITE='1'
node .\docs\qa\896-legacy-output-baseline\capture-baseline.mjs
```

기계 대조는 JSON별 SHA-256 또는 텍스트 diff로 판정한다. 시트 취득 시각·런타임 진단처럼 의도적으로 변하는 메타 파일을 제외하고 `01`~`05` JSON이 일치해야 한다. 특히 `05-price-scenarios.json`의 모든 상세 행과 공급가·부가세·총액이 동일해야 합격이다.

```powershell
1..5 | ForEach-Object {
  $prefix = '{0:d2}-' -f $_
  $before = Get-ChildItem .\docs\qa\896-legacy-output-baseline\$prefix*.json
  $after = Get-ChildItem .\docs\qa\896-post-migration-output\$prefix*.json
  if ((Get-FileHash $before).Hash -ne (Get-FileHash $after).Hash) {
    Write-Output "DIFF: $($before.Name)"
  }
}
```

## 런타임 참고

기준선 데이터 계산과 무관한 404 두 건이 있었다.

- `GET /fonts/PretendardVariable.woff2` → 404
- `GET http://localhost:8080/app/version?...` → 404

시트 부트스트랩·카탈로그·세트 전개·금액 계산은 성공했으며, 전개 오류는 싱글 0/226, 상업 0/86이다.

## 신규 파일

- `docs/qa/896-legacy-output-baseline/00-metadata.json`
- `docs/qa/896-legacy-output-baseline/01-catalog-and-categories.json`
- `docs/qa/896-legacy-output-baseline/02-set-expansion.json`
- `docs/qa/896-legacy-output-baseline/03-options-features-defaults.json`
- `docs/qa/896-legacy-output-baseline/04-quantity-derived.json`
- `docs/qa/896-legacy-output-baseline/05-price-scenarios.json`
- `docs/qa/896-legacy-output-baseline/99-runtime-diagnostics.json`
- `docs/qa/896-legacy-output-baseline/SHA256SUMS.txt`
- `docs/qa/896-legacy-output-baseline/capture-baseline.mjs`
- `docs/qa/896-legacy-output-baseline/screenshots/01-live-sheet-initial.png`
- `docs/qa/896-legacy-output-baseline/screenshots/02-single-set-default-preview.png`
- `docs/dev-reports/2026-08-08-896-legacy-output-baseline.md`
