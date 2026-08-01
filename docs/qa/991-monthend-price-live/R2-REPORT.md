# PR #991 실화면 QA R2 보고서

## 결론

실 API·실 화면으로 판매전표 생성까지 진행했으나, 후속 상태 전이와 회계 매출전표 원천 조회에서 막혔다. 따라서 일마감 상세의 표시 단가 및 `판정불가`·`정가결측` 배지는 이번 라운드에서 확인하지 못했다. 데이터 부족을 성공으로 판정하지 않는다.

## ① 진입 방법

- 데스크톱 렌더러: `vite.renderer.dev.config.ts`, 포트 `5203`, viewport `1440x900`, mock off.
- 인증: 브라우저 인증 브리지 주입 방식.
  - 문서화된 시드 계정 `dev_manager`로 실제 `/auth/login` API에서 토큰을 발급받았다.
  - `page/context.addInitScript`로 렌더러의 `window.samhanAuth.getToken()`이 해당 토큰과 `MANAGER` 컨텍스트를 반환하도록 주입했다.
  - 제품 로그인 동작 자체는 이번 검증 대상이 아니다. 비밀번호 추측·무차별 시도는 하지 않았다.
- 판매전표 작성 화면에 날짜 입력이 없어, UI 요청 날짜가 `2026-05-20`이 되도록 QA 하네스에서만 브라우저 `Date`를 `2026-05-20T09:00:00+09:00`으로 고정했다. 소스 및 DB 시드 수정은 하지 않았다.

## ② 실제 생성한 전표와 일자

| 항목 | 값 |
|---|---|
| 실제 생성한 판매전표 번호 | `2026/05/20-1` |
| 전표 ID | `7a0ad3a9-90de-4d9a-a3e0-71760da6b574` |
| 전표 일자 | `2026-05-20` |
| 거래처 | `(주)서울에어컨` (`P-2026-0001`) |
| 생성자 | `[DEV-SEED] 개발매니저` (`MANAGER`) |
| DB 최종 상태 | `SENT` (`전송`까지 성공, `수락` 실패) |
| 생성 시각 | `2026-07-30 00:20:30` 로컬 DB 기록 |

UI에서 `SINGLE_SET` 품목 `AC023CS1DBC1SY`와 `product_category IS NULL` 품목 `AR09TXEAAWKNEU-04`를 선택했다. 세트 전개로 저장된 라인은 5개이며, 전표 상세 화면의 `textContent`에서 추출한 VAT 포함 단가는 다음과 같다.

| 모델 | 화면 단가 문자열 (`textContent`) | 화면 상태 문자열 |
|---|---:|---|
| `AC023CN1DBC1` | `441,200` | 전표 화면에는 일마감 상태 배지 없음 |
| `AC023CX1DBC1` | `662,600` | 전표 화면에는 일마감 상태 배지 없음 |
| `PC1NWSK3NW` | `84,700` | 전표 화면에는 일마감 상태 배지 없음 |
| `AR-EC05` | `16,000` | 전표 화면에는 일마감 상태 배지 없음 |
| `AR09TXEAAWKNEU-04` | `1,080,000` | 전표 화면에는 일마감 상태 배지 없음 |

전표 상세 화면의 `textContent` 원문은 `#모델명품목명규격수량단가(VAT포함)...1AC023CN1DBC1...3PC1NWSK3NW...5AR09TXEAAWKNEU-04...` 형태로 추출했다. 캡처에는 모델별 단가 열과 `2026-05-20` 일자가 보인다.

## ③ 화면 단가와 DB 후보값 대조

아래는 일마감 상세가 아니라, 일마감 실행 전에 확인 가능한 실제 판매전표 상세 화면 단가와 읽기 전용 `product_db` 후보값의 대조다. 일마감 상세 화면 단가로 판정하지 않는다.

| 선택/표시 품목 | 카테고리 | 화면 단가 | 인상 전 후보 (`2000-01-01`) | 인상 후 후보 (`2026-04-01`) | 판정 |
|---|---|---:|---:|---:|---|
| `PC1NWSK3NW` | `HOME_MULTI` | `84,700` | release `154,000`, delivery `84,700` | release `154,000`, delivery `84,700` | 전표 화면의 VAT 포함 단가가 두 후보의 delivery 값과 같음. 일마감 경로 미실행 |
| `AR09TXEAAWKNEU-04` | `NULL` | `1,080,000` | price_history 행 없음 | price_history 행 없음 | `MISSING_REFERENT` 배지는 일마감 미실행으로 미확인 |
| `AC023CS1DBC1SY` (세트 원품목) | `SINGLE_SET` | 세트 원품목으로는 표시되지 않음 | release `1,204,500`, delivery `740,000` | release `1,204,500`, delivery `740,000` | 저장 시 구성품 라인으로 전개됨 |

`price_change_schedule` 읽기 전용 확인 결과 `homemulti`는 `default_pre_change=true`, 유효일 `2026-07-01`이었다. 다만 이번 데이터의 해당 `price_history` 두 후보 값은 동일했다.

## ④ 막힌 지점 원문 및 상태 분포

### 판매전표 상태 전이

`완료 (수락)` 클릭 시 화면 원문:

```text
inventory-service 호출 실패(400 BAD_REQUEST): {"success":false,"code":"INVALID_INPUT","message":"productCode: productCode 는 필수이며 공백만으로 구성될 수 없습니다","data":null,"timestamp":"2026-07-29T15:26:20.474343275Z"}
```

브라우저 응답은 `POST /slips/7a0ad3a9-90de-4d9a-a3e0-71760da6b574/accept`의 HTTP `409 Conflict`였다. 읽기 전용 조회로 확인한 저장 라인 중 카테고리 라인의 `product_code`가 비어 있어, 이 화면 경로에서 상태 전이를 더 진행하지 않았다. 제품 카테고리나 전표 데이터를 SQL로 보정하지 않았다.

### 회계 매출전표 작성

실제 `#/accounting/sales-slips/new` 화면에서 배분 가능한 원천을 조회했으나 다음 경로가 HTTP `404`였다.

```text
GET /internal/slips/by-period?type=OUTBOUND&from=2026-05-20&to=2026-05-20
```

화면 원문:

```text
배분 가능한 전표 라인을 불러오지 못했습니다.
배분 가능한 전표 라인이 없습니다.
배분할 원천 거래처를 확인할 수 없습니다.
```

그 결과 회계 매출전표를 임시저장·전기하지 못했다.

### 일마감 행·상태 배지 분포

| 대상 | 보인 행 수 | 상태 분포 |
|---|---:|---|
| 일마감 상세 | 0 | 일마감 실행 전 차단되어 산출하지 않음 |
| `확인` | 0 | 미확인 |
| `불일치` | 0 | 미확인 |
| `판정불가` | 0 | 미확인 |
| `정가결측` | 0 | 미확인 |

`daily_closings`, `sales_accounting_slips`, `sales_accounting_slip_lines`, `sales_accounting_slip_allocations`의 `2026-05-20` 관련 행은 읽기 전용 조회 결과 모두 0건이었다. 이는 정상 판정 행이 없다는 의미가 아니라, 마감 실행 단계에 도달하지 못했다는 의미다.

## ⑤ 콘솔 에러 및 HTTP 오류

- 페이지 오류(`pageerror`): 없음.
- 전표 수락: `409 POST /slips/7a0ad3a9-90de-4d9a-a3e0-71760da6b574/accept`.
- 회계 원천 조회: `404 GET /internal/slips/by-period?type=OUTBOUND&from=2026-05-20&to=2026-05-20`.
- 공통 환경 오류: `404 GET /app/version?clientType=DESKTOP&currentVersion=2026%2F07%2F29-1`, `503 POST /logs/front`.
- 콘솔 경고: Pretendard 폰트 decode/OTS parsing 경고, React Router future flag 경고.
- 네트워크 request failed: 없음.

## ⑥ 저장한 파일

실제 브라우저 캡처:

- `r2-01-slip-created.png` — 생성된 `2026/05/20-1` 판매전표 상세, 1440px 폭.
- `r2-blocked-transition-수락-error.png` — `수락` 단계의 실제 오류 화면.
- `r2-blocked-accounting-category-source.png` — 회계 매출전표 원천 조회 404에 따른 실제 오류 화면.
- `r2-blocked-operational-list.png` — 최초 UI 목록 조회 권한 차단 화면.

요청된 `r2-02-closing-run.png`, `r2-03-detail-prices.png`, `r2-04-missing-referent.png`는 해당 단계에 도달하지 못했으므로 생성하지 않았다. 빈 화면이나 합성 이미지를 산출물로 만들지 않았다.

## 데이터 변경 기록

- 허용된 실 화면 동작으로 판매전표 1건만 생성하고 `전송` 상태까지 변경했다.
- 회계 매출전표와 일마감 데이터는 생성되지 않았다.
- 기존 데이터 수정·삭제 없음.
- `products.product_category` 수정 없음.
- raw SQL `INSERT`/`UPDATE`/`DELETE` 없음.
- 소스 코드 수정 없음.

최종 결론은 **현재 실 데이터·실 API 경로에서는 판매전표 생성 후 inventory `productCode` 검증과 회계 원천 조회 404 때문에 PR #991의 일마감 표시 단가/배지 경로를 여기까지 확인함**이다.
