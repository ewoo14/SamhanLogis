# PR #1265 CODEX SOL 적대검증 재판정 (3회차)

검증일: 2026-08-18 (KST)

## ① 검증 SHA·main 병합

- 브랜치: `fix/web-to-slip-fidelity`
- 검증 SHA: `2ea44c167ae8ca0c350891c48a00e1d18c51b597`
- 시작 전 `git merge origin/main --no-edit`: `Already up to date.` 충돌 없음
- PR base SHA: `b9d9ab16d447ade3ae548acbf42da2b13f805cc0`
- 검증 중 제품 코드 수정, `git add`, commit, push는 하지 않았다.

## ② shared/common 사용처 전수 + 계약 테스트 단정 약화 판정

`VatInclusiveUnitAmountCalculator`의 생산 코드 직접 사용처를 repo 전체에서 전수 검색했다. **다른 서비스 사용처는 0개이고 slip-service만 2곳**이다.

1. `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:546-547`
2. `services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingAmountUpdateService.java:88-89`

실행 결과는 다음과 같다.

| 범위 | 결과 |
|---|---:|
| `:shared:common:test` | **101/101 통과, 실패 0** |
| `:services:slip-service:test` 전체 | **1,938개 중 8개 실패** |
| `SlipLineAmountContractTest` 단독 재실행 | **9개 중 2개 실패** |

계약 diff에서는 기존 assertion 삭제나 느슨한 matcher 전환이 없었다. 공통 계산기 테스트에 `616,975 × 3 = 1,850,925 / 1,682,659 / 168,266` 단언도 추가됐다. 따라서 **단정 약화는 아니다.** 다만 `SlipLineAmountContractTest`는 기대값 일부만 총액축으로 바꿔 자기모순이 생겼다.

- `999,999,999 × 3`: 기대 공급가 `2,727,272,724`, 실제 `2,727,272,725`
- `105 × 2`: 바꾼 공급가/VAT는 `191/19`인데 `lineTotal` 기대는 옛 값 `190`을 유지, 실제 `191`

즉 기존 단가축 계약을 총액축으로 교체했지만 slip 계약 자체는 green이 아니다. 이 계약 파손은 아래 ③의 실제 가격수정 화면 1원 불일치로 도달하므로 별도 중복 계상하지 않고 도달 결함 1에 포함한다.

## ③ 세 경로 금액 실측 + 레거시 원문

모델 `AC060CN6PBH1`, 수량 `3`, VAT 포함 단가 `616,975원`인 동일 전표 한 건을 브랜치 JAR·격리 DB·실제 Desktop UI로 끝까지 측정했다.

| 지점 | 공급가 | VAT | 합계 |
|---|---:|---:|---:|
| 최초 생성 상세 API/화면 | 1,682,659 | 168,266 | 1,850,925 |
| 일마감 가격수정 중 DOM | **1,682,658** | **168,267** | 1,850,925 |
| 저장 후 일마감 재조회 화면 | 1,682,659 | 168,266 | 1,850,925 |

가격수정 중 화면만 공급가와 VAT가 각각 1원 다르다. 저장 후 backend는 공통 계산기로 정정되지만, 사용자가 수정하는 순간 보게 되는 화면은 여전히 옛 단가축 계산이다. **실 화면 도달 결함 1건**이다.

레거시 원문은 둘 다 `단가 반올림 → 총액 계산 → 총액/1.1 반올림 → VAT를 차액` 순서다.

`tools/legacy-gas/거래처 발송 주문서/Code.js:2122-2127`:

```js
const priceVat = Math.round(Number(it.price)||0);
const total = priceVat * qty;
const sup = Math.round(Math.abs(total)/1.1);
const vat = Math.abs(total) - sup;
const supply = total<0 ? -sup : sup;
const vatAmt = total<0 ? -vat : vat;
```

`tools/legacy-gas/종합견적서/Code.js:1847-1855` 중 요구 구간 `1849-1855`:

```js
const priceVat = Math.round(Number(it.price) || 0); // 1847
const total = priceVat * qty;                       // 1848
const sup = Math.round(Math.abs(total) / 1.1);      // 1849
const vat = Math.abs(total) - sup;                  // 1850
const supply = total < 0 ? -sup : sup;              // 1851
const vatAmt = total < 0 ? -vat : vat;              // 1852
const priceEx = priceVat < 0 ? -Math.round(Math.abs(priceVat) / 1.1) : Math.round(priceVat / 1.1); // 1853
```

## ④ 추적률 — 신규/기존 구분과 화면 표시

공유 `slip_db`는 SELECT만 했다.

| 모집단 | 저장상 표시 가능 | 화면 표시 | 전체 | 판정 |
|---|---:|---:|---:|---|
| 기존 견적 | 7 | 7 가능 | 7 | `source_id` 유지 |
| 기존 주문 | 3 | 과거 20건 모두 soft-delete라 현재 개별 화면 판정 불가 | 20 | `slip_source_orders` 보유 전표 3건/원천행 6행 |
| 기존 전체 | **10** | 현재 active는 견적 **6/6** | **27** | **10/27 그대로**, backfill 없음 |
| 이번 격리 신규 단건 | **2/2** | **0/2** | 2 | 저장됐지만 상세 화면 미표시 |

fix2는 신규 단건 두 번 모두 `slip_source_orders.order_no`와 상세 API `sourceReference`에 `2026/08/18-501`을 저장했다. 그러나 실제 출고전표 상세 화면 본문에는 해당 주문번호가 없었고 `slip-source-reference` 요소도 생성되지 않았다. PNG를 직접 열어 화면에는 내부 출고전표번호만 보이고 주문번호는 없음을 확인했다. 원천 UUID는 화면 본문에 노출되지 않았다. **실 화면 도달 결함 1건**이다.

## ⑤ 잃으면 안 되는 것 재현

- 견적 생성 표본 7건: **전표 7/7, 라인 28/28**
- VAT 포함 단가 소수부 잔존: **0/28**
- W-01 품목명 보존: **28/28**
- W-03 카테고리 보존: **28/28**
- W-03 옵션(`bundle_set_options`) 보존: **28/28**
- 주문서웹 인증 후 홈멀티 105행: 이번 라운드에는 성공으로 판정하지 못했다. 아래 ⑦에 사유를 분리했다.

## ⑥ 스크린샷 — 행 수·경로

모든 캡처는 `resolveQaShotsDir()`가 해석한 `docs/qa/1265-sol-reverdict-3/screenshots/_local/`에 저장했고 Chromium headless로 촬영한 뒤 직접 열었다.

| 파일 | 직접 확인 내용 | 행 수 |
|---|---|---:|
| `01-initial-slip-source-and-4rows.png` | 최초 견적 전표, 원천 견적, 품목명과 금액 | 화면 4행 |
| `02-price-edit-same-unit.png` | 단가 616,975 가격수정 행 | 1행 |
| `03-daily-closing-requery.png` | 저장 후 동일 품목 재조회 행 | 1행 |
| `04-new-single-order-number-visible.png` | 신규 단건 출고전표 상세에 주문번호가 없음 | 상세 1건 |

숫자 원문은 같은 디렉터리의 `amount-evidence.json`, 신규 추적 원문은 `order-source-evidence.json`에 있다.

## ⑦ 판정 불가 축·증거 무결성

- 주문서웹은 브랜치 partner-order JAR와 실제 Vite UI까지 기동했고 `/bootstrap` 및 `/gate-images` 200을 확인했다. 그러나 격리 환경의 QA 사업자번호가 현재 partner 권위에서 `NOT_FOUND_SYSTEM`으로 응답해 비밀번호 입력 UI가 열리지 않았다. 인증 후 홈멀티 105행은 **판정 불가**이며 0건이나 통과로 세지 않는다.
- 기존 주문 20건은 모두 soft-delete라 17개 미복구 행을 현재 사용자 목록에서 각각 열 수 없다. 저장 데이터 전수 SELECT로 기존 10/27을 산출했다.
- 금액 경로의 최초 생성과 가격수정·저장·재조회는 실제 UI/API다. 다만 격리 전표를 `COMPLETED` 상태로 만드는 승인 호출은 auth client가 gateway attestation을 전달하지 않아 401이었으므로, 상태 선행조건만 격리 DB에서 설정했다. 이 조작은 금액 필드를 변경하지 않았고, 세 지점 금액은 실제 브랜치 API/화면에서 다시 읽었다.

## ⑧ CI 확인과 귀속

PR head `2ea44c167`의 GitHub checks를 직접 재조회했다. base main `b9d9ab16`의 CI run `32080847048`은 전체 `success`다. 현재 PR은 green이 아니다.

1. `shared+auth+gateway`: 성공. 공통 계산기 자체 테스트는 통과했다.
2. `slip-units`: **PR 귀속 실패**. 1,059개 중 2개 실패이며 위 `SlipLineAmountContractTest` 두 자기모순과 동일하다.
3. `slip-it-public`: **PR 귀속 실패**. 111개 중 4개가 `Phase26cSlipImmutableIT`의 partner-order 발행 201 기대/500 실제다. fix2가 문자열 계약인 `partnerOrderId`에 `UUID.fromString()`을 새로 적용한 경로와 겹친다. 실제 주문 서비스의 신규 UUID 경로는 2/2 발행됐으므로 별도 화면 결함으로 추가 계상하지 않는다.
4. `Frontend Desktop` 및 `Harness Guard`: **PR 귀속 실패**. PR에 추적된 `.pid` 6개 때문에 extension census가 `expected [] / received ['.pid']`로 실패했다.
5. `Desktop Playwright mock hard gate`: PR에 포함된 라이브 스펙이 CI에서 자격 누락/전용 포트 미기동으로 수집되어 실패했고, 별도 version-history 1건도 실패했다. 제품 화면 결함 수에는 넣지 않는다.
6. GitGuardian: failure이나 상세 판정 근거를 확보하지 못해 판정 불가다.
7. 경고된 main 기존 `SlipSalesUpdateIT R9 (expected 2 / was 1)`은 이번 PR 실패 목록에 나타나지 않았다. 이번 2+4개 실패를 그 기존 실패로 오귀속하지 않았다.
8. `Set up job` 실패는 없으며 GitHub 장애로 면책할 항목도 없다.

## ⑨ 머지 가능/불가 — 도달 결함 2건

**머지 불가 — 실 사용자가 화면에서 재현할 수 있는 도달 결함 2건이다.**

1. 동일 전표·동일 단가에서 최초/저장 후 재조회는 `1,682,659/168,266`인데 가격수정 중 화면만 `1,682,658/168,267`이다.
2. 신규 단건 주문번호는 DB/API에는 저장되지만 실제 출고전표 상세 화면에는 표시되지 않는다.

기존 추적률도 backfill 없이 10/27 그대로이며 CI도 PR 귀속 실패가 남아 있다. 판정 불가인 주문서웹 105행은 결함 0으로 세지 않았다.

## ⑩ 프로세스 회수

- 회수한 전용 포트 프로세스: `2583`, `25173`, `25180`, `28088`, `48086` — 회수 후 listener **0개**
- 제거한 격리 컨테이너: `sol1265r3-pg` — 잔존 **0개**
- 검증 임시 로그: `%TEMP%/sol1265r3-*` — 잔존 **0개**
- Playwright 검증 프로세스 — 잔존 **0개**
- 공유 `samhan-*` 컨테이너 — 시작/종료 후 모두 **24개 유지**, 재기동·변경 없음
- 다른 워크트리와 다른 격리 컨테이너는 건드리지 않았다.

