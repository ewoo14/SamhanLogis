# #896 같은 커밋 sheet ↔ DB 출력 동등성 재검증

## 고정 조건·입력 동일성·재현성

- **고정 커밋 SHA:** `37ffacea0698ac86825d31d9f3c3dacf29c06a6b`. `git` 명령 없이 `.git/HEAD`와 참조 파일에서 읽었고, sheet/db 네 번의 `00-metadata.json`도 모두 같은 SHA를 기록했다.
- **판정:** **불합격 — DB만으로 레거시와 같은 출력이 나오지 않는다.** 같은 커밋에서도 차이가 남는다.
- **동일 입력 근거:** 수정하지 않은 `docs/qa/896-legacy-output-baseline/capture-baseline.mjs`를 네 번 공통 사용했고 출력 경로와 서버의 `CATALOG_SOURCE`만 바꿨다. sheet/db의 `05-price-scenarios.json`에서 다섯 `input` 객체를 JSON 직렬화해 대조한 결과 동일했다. `04-quantity-derived.json`의 홈·상업 `inputs`도 동일했다.
- **고정 금액 입력:** `AJ060MXHNBC1` 2대, `AC060CS6PBH1SY` 기본/옵션/2세트 할인, 블랙판넬·사각·유선리모컨, 세트당 50,000원 할인, 운임 120,000원, 1,000원 절삭.
- **고정 파생 입력:** 홈 `AJ060MXHNBC1=1`, `AJ012BN1PBC2=2`, `AM052BN4DBH1=1`; 상업 `AM072TNCDBH1=2`, `AM052DNLDBH1=1`.
- **서비스:** 수집 전후 `samhan-product-service`는 healthy, `127.0.0.1:8084`였다. Docker 재기동·재배포는 하지 않았다.
- **sheet 인증:** `GOOGLE_SERVICE_ACCOUNT_KEY`는 `C:\dev\samhan-homepage-260f8ae469cc.json` 경로만 프로세스 환경변수로 전달했다. 키 내용은 읽기·출력·복사하지 않았고 저장소 `.env`도 만들지 않았다.
- **재현성:** 각 모드에서 `01`~`06`을 두 번 수집했고 아래 SHA-256이 run1/run2에서 전부 일치했다. 취득 시각이 들어가는 `00`, `99`와 PNG는 결정성 판정에서 제외했다.

| 파일 | sheet run1 = run2 | DB run1 = run2 |
|---|---|---|
| `01-catalog-and-categories.json` | `457116d968bbd55e8d2267f7ceb4c1ed36fd7892f851d16dc0b5884cb2a6afd4` | `a10195eb45b385bff0f892530ee7d0f3de50452eb8e60e5b7c8db56aa63378b0` |
| `02-set-expansion.json` | `c8f85e9320722c75f4800ef914cd1b86856cbf32e6ba512acb1f0e475615da97` | `b6898ee0bcb66f33f25b4f71fbddcddf0bbcfaadb2d2ec59bc689c16bddecb43` |
| `03-options-features-defaults.json` | `04406c58181addd354ccdf17a4db3dc05bc7813eb9122a657a65aa99e89460e3` | `cb0c92398cd97bf38e7de7730b2cd37c92b5badf9a8ed95f02b944d51dfd4546` |
| `04-quantity-derived.json` | `313de591afddc779799a8460fc92f832d8f33da22099c4d83360eeeaa3086db9` | `252ff29d7cf8f2d56b4eda432442658f86ba033051d922ff3aec604674f53e31` |
| `05-price-scenarios.json` | `f8309be614b67f0b13df07b0d87b4017cfaf0b8441c069713afad07edc9d47e8` | `d7a1eaa0a01f16505b2989cf2ea5de1baec07a12d6b155b8c67f48b6fce85dbc` |
| `06-toggle-off-on.json` | `b09c30363fea710439a08c6ca25f3bedde20bba1781f079657ca7f8135938fd9` | `f39b68e2ef2f3b91a3903c600b5e60a26478a937a47348bb2c66799fd1c0cd4a` |

## 비교 방법

- 01 문맥 키: `source + setModel + model + feature`. `index`, `price`, `list`는 카탈로그·분류 값 차이에서 제외하고 가격 축에서 별도로 셌다.
- 02 문맥 키: `sector + setModel + partModel + feature`. `unitPrice`, `subtotal`은 세트 구조 값 차이에서 제외하고 금액 축에서 별도로 다뤘다.
- 03 구성품 문맥 키: `setModel + model + feature`; UI 컨트롤은 `id`로 짝지었다.
- 한쪽 전용은 같은 문맥 키의 행 수가 더 많은 경우, 값 차이는 짝지은 레코드에서 하나 이상의 비교 필드가 다른 경우다.
- 한국어 표시값과 영문 enum도 실제 JSON 출력이 다르면 값 차이로 셌다.

## 축별 차이 건수

| 축 | 시트에만 | DB에만 | 값이 다름 | 값 셀 | 판정 |
|---|---:|---:|---:|---:|---|
| 01 카탈로그·분류 | 398행 | 103행 | 2,326레코드 | 6,423셀 | 불일치 |
| 02 세트 전개 | 171행 | 174행 | 681레코드 | 1,387셀 | 불일치 |
| 03 옵션·특징·기본값 | 5행 | 2행 | 1,447레코드 | 1,810셀 | 불일치 |
| 04 파생 수량 | 0행 | 0행 | 2셀 | 2셀 | 수량 일치, 명칭 불일치 |
| 05 금액 시나리오 전체 | 0 | 0 | 50셀 | 50셀 | 불일치 |
| 05 중 금액 필드 | 0 | 0 | 35셀 | 35셀 | 불일치 |
| 05 카탈로그 가격 셀 | 398행 | 103행 | 979레코드 | 979셀 | 불일치 |

### 01 카탈로그·분류 예시 5건

1. **값이 다름** — `HOME_MULTI / AJ060MXHNBC1`: 단위 sheet `대` ↔ DB `EA`; 용량 `17` ↔ `0`; 규격 `6단배관` ↔ `단배관`; 고정DC `-` ↔ 빈 문자열.
2. **값이 다름** — `HOME_MULTI / AJ050MXHNBC1`: 단위 `대` ↔ `EA`; 용량 `14.5` ↔ `0`; 규격 `5단배관` ↔ `단배관`; 고정DC `-` ↔ 빈 문자열.
3. **시트에만** — `HOME_MULTI / PC6NUNK1NW`: sheet `판넬 360CST 원형 WIFI`, 분류 `판넬 > WIFI`, 규격 `360 원형 내장형` ↔ DB 해당 HOME_MULTI 문맥 없음.
4. **DB에만** — `HOME_MULTI / AJ012MB1PBC2`: sheet 해당 문맥 없음 ↔ DB `실내기(1-Way) 무풍 소형 미내장 3평형`, 분류 `실내기 > 1-Way 미내장 > 소형`.
5. **시트에만** — `SINGLE_COMPONENT / 실링 드레인펌프 / ADP-F075SP / 실링 드레인펌프`: sheet `실링용 드레인펌프`, 종류 `펌프` ↔ DB 해당 문맥 없음.

### 02 세트 전개 예시 5건

1. **시트에만** — `AP110BAPPHH2S / AP110RNPPHH1`: sheet `냉난방 프리미엄 스탠드 실내기`, 수량 1 ↔ DB 없음.
2. **시트에만** — 상업 세트 `AM360NXGGBH1S / AM160NXGGBH1`: sheet 수량 1 ↔ DB 없음.
3. **DB에만** — `AC072BSCPBH2SY / AC072BNCPBH1`: sheet 없음 ↔ DB `싱글 실링 실내기`, 수량 1.
4. **값이 다름** — `AC060CS6PBH1SY / AC060CN6PBH1`: 종류 sheet `실내기` ↔ DB `INDOOR`; 단위 `대` ↔ `EA`; 수량은 양쪽 1.
5. **값이 다름** — `AC060CS6PBH1SY / AR-EH05`: 명칭 sheet `무선리모컨` ↔ DB `무선리모컨(냉난방전용)`; 종류 `리모컨` ↔ `REMOTE`; 수량은 양쪽 1.

### 03 옵션·특징·기본값 예시 5건

1. **값이 다름** — `chkHomeInc` 기본 체크: sheet `false` ↔ DB `true`.
2. **시트에만** — `실링 드레인펌프 / ADP-F075SP / 실링 드레인펌프`: sheet 명칭 `실링용 드레인펌프`, 종류 `펌프`, 기본값 `false` ↔ DB 없음.
3. **시트에만** — `유선리모컨 키트 / AIM-A01N / 유선보드`: sheet 명칭 `유선보드`, 종류 `부자재`, 기본값 `false` ↔ DB 없음.
4. **DB에만** — `S3-1111-GUARD-API-20260807-S3 / AC023CN1DBC1`: sheet 없음 ↔ DB 명칭 `무풍 1way 냉방전용 실내기`, 종류 `ACCESSORY`, 기본값 `false`.
5. **값이 다름** — `AC060CS6PBH1SY / PC6NUDK1NW / 사각`: 명칭 sheet `판넬 (360CST 사각 WIFI)` ↔ DB `판넬 360CST 사각 WIFI`; 종류 `판넬` ↔ `PANEL`; 기본값은 양쪽 `false`.

시트 기본값 객체 자체는 0셀 차이다. 구성품 특징에서 1,446레코드·1,809셀, UI 컨트롤에서 1레코드·1셀 차이가 났다.

### 04 파생 수량 예시

차이는 2건뿐이므로 전부 적는다. 파생 모델과 수량은 모두 같았다.

1. 상업 출력 4번째 명칭: sheet `실링 드레인펌프` ↔ DB `실링용 드레인펌프`.
2. 상업 출력 5번째 명칭: sheet `무선리모컨(무풍)` ↔ DB `무선리모컨(냉난방전용)`.

### 05 금액 대조

| 시나리오 | 전체 차이 셀 | 금액 차이 셀 | sheet 총액 | DB 총액 |
|---|---:|---:|---:|---:|
| `single-item` | 2 | 0 | 3,222,230 | 3,222,230 |
| `single-set-default` | 14 | 10 | 1,660,000 | 1,660,000 |
| `single-set-options` | 17 | 15 | 1,760,000 | 1,737,440 |
| `single-set-discount` | 14 | 10 | 3,220,000 | 3,220,000 |
| `freight-and-cutoff` | 3 | 0 | 1,731,000 | 1,731,000 |

금액 예시 5건:

1. `AC060CS6PBH1SY / AC060CN6PBH1` 기본 실내기 단가·소계: sheet `606,000` ↔ DB `616,975`.
2. `AC060CS6PBH1SY / AC060CXAPBH1` 기본 실외기 단가·소계: sheet `910,000` ↔ DB `925,050`.
3. `AC060CS6PBH1SY / PC6NUNK1NW` 기본 판넬 단가·소계: sheet `128,000` ↔ DB `104,060`.
4. `AC060CS6PBH1SY / AR-EH05` 기본 리모컨 단가·소계: sheet `16,000` ↔ DB `13,915`.
5. 블랙판넬·사각·유선리모컨 옵션 세트: 총액 sheet `1,760,000` ↔ DB `1,737,440`; 공급가 `1,600,000` ↔ `1,579,491`; 부가세 `160,000` ↔ `157,949`.

전체 카탈로그의 짝지은 문맥에서는 가격 레코드 979개·가격 셀 979개가 달랐다(`price` 976, `list` 3). 별도로 sheet 전용 가격 문맥 398행, DB 전용 103행이 있다.

동일 `모델 + 가격필드`가 여러 문맥 값을 가진 그룹은 sheet `price` 129 + `list` 5 = **134**, DB `price` 1 + `list` 1 = **2**다. 예를 들어 `PC6NUNK1NW.price`는 sheet에서 `104,060`과 `128,000`을 함께 가지지만 DB는 해당 문맥 가격을 보존하지 못한다. DB의 유일한 다중값 모델은 `AM120MXVRHC1`이다.

## 단가변동 토글 OFF/ON

기존 하네스와 같은 페이지 bootstrap 후 세 토글 `chkHomeInc`, `chkSingleInc`, `chkCommInc`를 모두 OFF와 모두 ON으로 설정했다. 카탈로그 가격 함수와 `AC060CS6PBH1SY` 기본 세트의 구조화 견적을 양쪽 모드에서 각각 수집했다. `06-toggle-off-on.json`도 모드별 2회 SHA-256이 일치한다.

| 모드 | 홈 가격 셀 변화 | 상업 가격 셀 변화 | 싱글 세트 변화 | 싱글 구성품 변화 | 고정 세트 총액 OFF ↔ ON |
|---|---:|---:|---:|---:|---:|
| sheet | 0 | 0 | 3 (`price` 2, `list` 1) | 212 (`price` 190, `list` 22) | 1,660,000 ↔ 1,660,000 |
| DB | 0 | 0 | 2 (`price` 2) | 0 | 1,660,000 ↔ 1,660,000 |

- sheet 변화 예: `AC060CS4PBH2SY / AC060CXAPBH1` 가격 `820,000` ↔ `900,000`, 출고가 `1,331,000` ↔ `1,254,000`; `AC060CS6PBH1SY / AC060CXAPBH1` 가격 `910,000` ↔ `900,000`.
- DB에서 변한 두 건은 `AP145BAPPHH2S` 가격 `1,890,000` ↔ `1,980,000`, `AR06D1150HZS` 가격 `360,000` ↔ `370,000`이다.
- 따라서 **“DB 모드 토글이 아무 변화도 만들지 않는다”는 이번 같은 커밋 실측에서는 사실이 아니다.** 완전 0건 판정은 철회한다.
- 그러나 sheet 215셀 변화에 비해 DB는 2셀뿐이며, DB의 홈 115·상업 412·싱글 288개 `PRICE_INC` 키가 주입된 상태에서도 홈·상업·싱글 구성품은 0건이다. 토글 데이터 이관은 현저히 불완전하다.
- 고정 세트는 양쪽 모두 총액 변화가 0이지만 sheet는 실외기 출고가 한 셀이 변했고 DB는 상세행도 전부 동일했다.

## 이전 수치와 같은 커밋 수치 — 코드 차이와 소스 차이 분리

| 지표 | 이전(앱 커밋 다름) | 이번(같은 `37ffacea...`) | 분리 결과 |
|---|---:|---:|---|
| 01 카탈로그 값 차이 | 2,326 | 2,326 | 소스 차이로 재현 |
| 02 세트 전개 값 차이 | 681 | 681 | 소스 차이로 재현 |
| 05 금액 차이 셀 | 35 | 35 | 소스 차이로 재현 |
| 카탈로그 가격 셀 | 979 | 979 | 소스 차이로 재현 |
| 다중 문맥 가격 그룹 | sheet 134 ↔ DB 2 | sheet 134 ↔ DB 2 | 소스 차이로 재현 |
| DB 토글 가격 변화 | 0 | 2 | 이전 0건 판정은 철회; 아래 한계 참조 |

이번 sheet `01`~`05`의 SHA-256은 이전 `docs/qa/896-legacy-output-baseline/`의 대응 파일과 각각 같고, 이번 DB `01`~`05`도 이전 `docs/qa/896-db-mode-output/`의 대응 파일과 각각 같다. 즉 이전 두 앱 커밋 사이의 코드 차이는 이 고정 출력 `01`~`05`에 **관찰 가능한 영향 0**이었고, 표의 지속 차이는 같은 커밋 sheet↔DB 대조에서도 그대로 남은 **카탈로그 소스/데이터 경로 차이**다.

DB 토글의 이전 0건은 저장된 원본 토글 JSON이 없고 당시 측정 범위가 홈·상업·싱글 구성품 중심이어서, 이번 2건이 코드 변경 때문인지 이전 측정 범위 때문인지는 분리할 수 없다. 현재 진실은 “싱글 세트 2건만 변화, 나머지 0건”이다.

## DB에 더 넣어야 할 것 — 이관 작업 목록

1. `COMMERCIAL_COMPONENT`의 sheet 전용 380개 문맥을 포함한 sheet 전용 398행을 DB 카탈로그/구성 문맥에 넣고, DB 전용 103행은 레거시 포함 근거에 따라 정리한다.
2. 세트별 구성품 관계를 `세트 모델 + 구성품 모델 + 특징` 문맥으로 보존하고 누락된 싱글·상업 구성 및 수량을 채운다.
3. 구성품 종류의 레거시 표시값(`실내기`, `실외기`, `판넬`, `리모컨` 등) 또는 1:1 출력 매핑을 넣어 영문 enum 직접 노출을 없앤다.
4. 단위, 용량, 규격, 고정DC, 명칭을 문맥별 레거시 값으로 채운다. 한 모델의 전역 단일값으로 합치지 않는다.
5. 옵션 특징과 기본값을 세트별로 채우고 sheet 전용 5행·DB 전용 2행을 정리한다. `chkHomeInc` 기본값도 레거시 `false`와 맞춘다.
6. 가격 키에 최소 `카탈로그 구분 + 세트 모델 + 구성품 모델 + 종류/특징 + 가격필드(price/list) + 토글 상태`를 보존한다. 현재 `(product_id, effective_date)` 중심의 단일값으로는 sheet의 다중 문맥 134그룹을 담지 못한다.
7. 기본 세트 구성품 단가·출고가와 옵션 교체 차액을 레거시 셀 값으로 채운다. `AC060CS6PBH1SY`의 실내기·실외기·판넬·리모컨을 우선 회귀 대상으로 삼는다.
8. 단가변동 데이터는 현재 DB에서 이미 변하는 `AP145BAPPHH2S`, `AR06D1150HZS` 두 세트는 유지하고, sheet에서 변하는 나머지 싱글 세트 1셀과 싱글 구성품 212셀을 문맥별로 이관한다. 홈·상업은 이 캡처에서 양쪽 모두 0건이므로 값 또는 토글 의미를 별도 계약으로 확인한다.
9. 파생 수량 규칙은 유지하되 `실링 드레인펌프`, `무선리모컨(무풍)` 등 레거시 출력 명칭을 보존한다.

## 확정하지 못한 것

1. sheet 전용 398행과 DB 전용 103행 각각의 업무상 정당성은 출력 대조만으로 확정하지 못했다.
2. UI 라벨은 `인상 전 단가`이고 본 보고서는 사용자의 표현에 맞춰 단가변동 토글 OFF/ON으로 기록했다. OFF/ON 중 어느 쪽이 업무상 인상 전·후인지 의미 계약은 확정하지 않았다.
3. 이전 DB 토글 0건과 이번 2건의 차이는 이전 토글 원본 JSON 부재 및 측정 범위 차이 때문에 코드 변경분과 측정 범위분을 분리하지 못했다.
4. 주문서 납기일 자동 전환은 견적서 하네스 범위 밖이라 확인하지 않았다.
5. `00-metadata.json`의 `catalogSource`는 하네스 상수라 DB 캡처도 `sheet`로 기록한다. 실제 모드는 서버 실행 환경, DB 고유 건수, 토글 overlay 건수로 판별했다.
6. 최초 cold sheet `/` 요청은 기존 하네스의 120초 `page.goto` 제한에 걸렸다. 같은 서버를 300초 제한으로 예열했을 때 7.2초·HTTP 200·14,871,969바이트로 응답했고, 이후 기존 하네스 두 번과 토글 두 번은 성공했다. cold 실패의 일시적 원인은 확정하지 못했다.
7. 재현성 SHA-256은 의도적으로 변하는 취득 시각 파일 `00`, `99`와 PNG를 제외한 `01`~`06`에 대한 판정이다.

## 프로세스 회수

- QA 담당자가 띄운 sheet 서버 PID `63232`, DB 서버 PID `77348`만 종료했다.
- 종료 확인: 포트 5183 리스너 0, Playwright Chromium 0, 두 PID 모두 없음.
- `samhan-product-service`는 종료 시점에도 healthy였고 Docker 조작은 하지 않았다.

## 신규 파일

아래 네 디렉터리 각각에 동일한 파일 목록 11개가 새로 생겼다.

- `docs/qa/896-parity-run2/sheet/run1/`
- `docs/qa/896-parity-run2/sheet/run2/`
- `docs/qa/896-parity-run2/db/run1/`
- `docs/qa/896-parity-run2/db/run2/`

각 디렉터리의 파일:

- `00-metadata.json`
- `01-catalog-and-categories.json`
- `02-set-expansion.json`
- `03-options-features-defaults.json`
- `04-quantity-derived.json`
- `05-price-scenarios.json`
- `06-toggle-off-on.json`
- `99-runtime-diagnostics.json`
- `SHA256SUMS.txt`
- `screenshots/_local/01-live-sheet-initial.png`
- `screenshots/_local/02-single-set-default-preview.png`

보고서 파일:

- `docs/dev-reports/2026-08-08-896-parity-run2-same-commit.md`
