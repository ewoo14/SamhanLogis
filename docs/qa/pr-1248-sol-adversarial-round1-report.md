# PR #1248 CODEX SOL 적대검증 라운드 1 보고서

검증 범위는 이슈 #1237의 #10 `영업수수료 정산 계산` 하나뿐이다. 다른 18개 업무의 미구현 여부는 판정에서 제외했다.

## ① 환경 확인

아래는 검증 시작 시 요청된 명령과 출력 원문이다. `git status --porcelain`의 출력은 없었다.

```text
PS C:\dev\Samhan-Public\.claude\worktrees\w1237> git rev-parse HEAD
3d2c306b754747e1ee302fd2216073810ae77696
PS C:\dev\Samhan-Public\.claude\worktrees\w1237> git rev-parse --abbrev-ref HEAD
feat/gas-missing-19
PS C:\dev\Samhan-Public\.claude\worktrees\w1237> git status --porcelain
PS C:\dev\Samhan-Public\.claude\worktrees\w1237> gh pr checks 1248
#910 문서 계약 검사                          pass     1m45s
App Build Guard                              pass     2m29s
GitGuardian Security Checks                  pass     1s
Notion Runtime Boundary                      pass     1m9s
S1 민감정보 로깅 검사                       pass     1m31s
자격 평문·shadow API 검사                    pass     1m55s
Playwright QA                                pending  0
Frontend Mobile Build                        pending  0
Frontend Mobile-Public Build                 pending  0
Frontend Desktop Build                       pending  0
Credential Guard                             pending  0
Desktop Playwright QA                        pending  0
Config Audit                                 pending  0
Frontend Order Build                         pending  0
Detox Mobile E2E                             pending  0
Internal Chat Service Build                  pending  0
Detox Arologis Mobile E2E                    pending  0
Frontend Design System Build                 pending  0
Local Stack E2E                              pending  0
Mobile Staff Build                           pending  0
문서 본문 링크 검사                         pending  0
accounting + partner 회귀                    pending  0
accounting cash-receipt IT                   pending  0
accounting CODEF 설정 경계                   pending  0
accounting deposit-IT                        pending  0
accounting partner 무결성                    pending  0
phase9-10 서비스 회귀                        pending  0
product 서비스 회귀                         pending  0
product quantity sync schema 회귀            pending  0
shared auth-gateway 회귀                     pending  0
slip core 회귀                               pending  0
slip public-api IT                           pending  0
slip units 회귀                              pending  0
user + product 회귀                          pending  0
Harness Consistency Guard                    pending  0
```

## ② CI 카운트

시작 시 출력은 성공 6건, 대기 29건이었다. 게시 직전 `gh pr checks 1248 --json state,name` 재조회 결과는 총 46건, 성공 46건, 실패 0건, 대기 0건이다.

## ③ 레거시 GAS R-18 원문

직접 대조한 원문은 `tools/legacy-gas/영업수수료 계산/Index.html`이다.

- 입력과 토글: 116~164행. 카드 결제, 원천징수 3.3%, 판매비 8%/직접 입력을 제공한다.
- 숫자 해석: 305~308행. `String(v||'').replace(/[^\d.\-]/g,'')` 후 빈 값과 `NaN`은 0이다.
- 화면 포맷: 311~315행. `Math.round(n).toLocaleString('ko-KR')`이다. 천 단위 쉼표는 표시 형식일 뿐 천 원 단위 반올림이 아니다.
- 반올림: 317~320행. `xround(n) = (n < 0 ? -1 : 1) * Math.round(Math.abs(n))`이므로 각 중간 공제액을 원 단위 대칭 사사오입한다.
- 계산 본문: 323~355행.

```javascript
const cardFee = S.card ? xround(-total * 0.03) : 0;
const salesAmount = total - equip + cardFee;
const expense = xround(salesAmount * -expenseRate);
const wht = S.applyWithholding ? xround(salesAmount * -0.033) : 0;
const dogup = xround(install * -0.08);
const safetyAdj = -safetyInput;
const subtotal = salesAmount + expense + wht + dogup + safetyAdj;
const payout = subtotal - prepaid;
const supply = xround(subtotal / 1.1);
const vat = subtotal - supply;
```

따라서 총 결제금액에서 장비대를 빼고, 카드 토글이 켜지면 총 결제금액의 3%를 원 단위 반올림해 차감한 값이 판매금액이다. 판매비 토글은 판매금액의 8%와 직접 입력 비율을 바꾸며, 원천징수 토글은 판매금액의 3.3% 차감 여부를 바꾼다. 설치비의 8%와 안전관리비 원액을 차감하고, 이 중간합계에서 선지급을 빼 지급액을 만든다. 공급가는 선지급 차감 전 중간합계를 1.1로 나눈 뒤 원 단위 반올림하고 VAT는 중간합계와 공급가의 차이다.

현재 구현의 대응 지점은 `services/accounting-service/src/main/java/com/samhan/accounting/domain/settlement/SalesCommissionSettlementCalculator.java:25-50`이다. 저장 snapshot은 `SalesCommissionSettlement.java:203-236`, API 응답 매핑은 `SalesCommissionSettlementResponse.java:37-54`에서 확인했다.

## ④ 레거시 손계산 vs 구현 대조표

대표 입력은 총액 1,234,567, 장비대 234,567, 선지급 100,000, 설치비 123,456, 안전관리비 7,890, 카드 ON, 원천징수 ON, 판매비 8%이다.

직접 손계산: 카드 수수료 `round(-1,234,567×3%)=-37,037`, 판매금액 `1,234,567-234,567-37,037=962,963`, 판매비 `round(-962,963×8%)=-77,037`, 원천징수 `round(-962,963×3.3%)=-31,778`, 도급공제 `round(-123,456×8%)=-9,876`, 안전관리비 `-7,890`, 중간합계 `836,382`, 지급액 `836,382-100,000=736,382`, 공급가 `round(836,382/1.1)=760,347`, VAT `76,035`이다.

| 결과 | 레거시 원문 손계산 | 구현 API | 일치 |
|---|---:|---:|---|
| 지급액 | 736,382 | 736,382 | 예 |
| 원천징수 | -31,778 | -31,778 | 예 |
| 공급가 | 760,347 | 760,347 | 예 |
| VAT | 76,035 | 76,035 | 예 |

## ⑤ 경계 전수표

모든 기대값은 위 원문 식으로 이 라운드에서 독립 계산했다. HTTP 상태는 별도 표기가 없으면 계산 API 200이다.

| 입력 요약 | 기대 지급/원천/공급/VAT | 구현 결과 | 판정 |
|---|---|---|---|
| 전 항목 0, 카드 OFF, 원천 OFF | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 일치 |
| 총액 -50, 카드 ON, 원천 ON | -42 / 2 / -38 / -4 | -42 / 2 / -38 / -4 | 일치 |
| 끝자리 총액 50, 카드 OFF, 원천 OFF | 44 / 0 / 40 / 4 | 44 / 0 / 40 / 4 | 일치 |
| 총액 100,000, 카드 ON, 원천 ON | 86,039 / -3,201 / 78,217 / 7,822 | 동일 | 일치 |
| 총액 100,000, 카드 ON, 원천 OFF | 89,240 / 0 / 81,127 / 8,113 | 동일 | 일치 |
| 총액 100,000, 카드 OFF, 원천 ON | 88,700 / -3,300 / 80,636 / 8,064 | 동일 | 일치 |
| 총액 100,000, 카드 OFF, 원천 OFF | 92,000 / 0 / 83,636 / 8,364 | 동일 | 일치 |
| 총액 1,000, 선지급 2,000 | -1,080 / 0 / 836 / 84 | 동일 | 일치 |
| 총액 1,000, 장비대 100, 설치비 0 | 828 / 0 / 753 / 75 | 동일 | 일치 |
| 총액 1,000, 직접 판매비 7% | 930 / 0 / 845 / 85 | 동일 | API 일치, 화면 제어 없음 |
| 총액 999,999,999,999,999,999 | 860,389,999,999,999,999 / -32,010,000,000,000,000 / 782,172,727,272,727,272 / 78,217,272,727,272,727 | API 동일 | 서버 일치, 화면 정밀도 손실 |
| 설치비 입력칸을 빈 문자열로 지움 | 레거시는 0으로 계산 | HTTP 400 | 불일치 |
| 총액 9,999,999,999,999,999,999 | UI가 입력을 허용 | HTTP 500 (`numeric field overflow`) | 결함 |

천 원 단위 반올림은 없다. 카드 수수료·판매비·원천징수·설치비 공제·공급가를 각각 원 단위로 먼저 반올림한 뒤 합산한다.

## ⑥ 금액 4단계 표

대표 건을 실제 화면에서 입력하고 네트워크 요청/응답을 가로채 저장 후 상세 재조회까지 비교했다.

| 금액 | 입력 화면 | 계산 결과 | 저장 payload/저장 응답 snapshot | 저장 후 재조회 |
|---|---:|---:|---:|---:|
| 총 결제금액 | 1,234,567 | — | 요청 1,234,567 / 응답 1,234,567 | 1,234,567 |
| 장비대 | 234,567 | — | 요청 234,567 / 응답 234,567 | 234,567 |
| 선지급 | 100,000 | — | 요청 100,000 / 응답 100,000 | 100,000 |
| 설치비 | 123,456 | — | 요청 123,456 / 응답 123,456 | 123,456 |
| 안전관리비 | 7,890 | — | 요청 7,890 / 응답 7,890 | 7,890 |
| 지급액 | — | 736,382 | 응답 736,382 | 736,382 |
| 원천징수 | — | -31,778 | 응답 -31,778 | -31,778 |
| 공급가 | — | 760,347 | 응답 760,347 | 760,347 |
| VAT | — | 76,035 | 응답 76,035 | 76,035 |

대표 범위에서는 저장 직전과 재조회가 한 자리도 다르지 않았다. 반면 18자리 입력 `999,999,999,999,999,999`는 브라우저 숫자 변환 단계에서 `1,000,000,000,000,000,000`으로 바뀌었다. 서버의 정확한 공급가 `782,172,727,272,727,272`도 화면에는 `782,172,727,272,727,300`으로 표시되어 4단계 계약이 깨진다.

## ⑦ 권한 상태코드 표

실제 직원 계정으로 로그인한 뒤 격리 accounting-service의 목록/계산 API를 호출했다.

| 역할 | 로그인 | 목록 조회 | 계산/저장 |
|---|---:|---:|---:|
| MASTER | 200 | 200 | 200 |
| MANAGER | 200 | 200 | 200 |
| ACCOUNTANT | 200 | 200 | 200 |
| SALES | 200 | 403 | 403 |
| WAREHOUSE | 200 | 403 | 403 |
| INVENTORY | 200 | 403 | 403 |
| DEVELOPER | 200 | 403 | 403 |
| DRIVER | 200 | 403 | 403 |
| STAFF | 200 | 403 | 403 |
| DISPATCH | 200 | 403 | 403 |

직원 역할 전수에서 허용 3개 역할만 200이고 나머지는 정확히 403이었다.

## ⑧ 기존 DRAFT 경로 유지

계산 입력이 없는 기존 빈 DRAFT에 대해 생성 200, 목록 200, 상세 200, 확정 200을 확인했다. 확정 후 화면에는 문서번호와 `확정` 상태가 표시됐고 계산 snapshot 없이도 기존 경로가 유지됐다. 대상 backend 회귀 명령은 exit code 0, 대상 frontend Vitest 3파일 6테스트는 모두 통과했다.

## ⑨ 캡처

Playwright는 `clients/desktop` 패키지 안에서 `headless: true`, 해시 URL로 실행했고 1개 스펙이 통과했다. 캡처 직전 목록 화면 고유 제목과 정산 상세 계산 섹션을 각각 단정했다. 캡처 경로는 `resolveQaShotsDir()`가 반환한 `docs/qa/1248-sales-commission-real-qa/_local`이며 파일/디렉터리 모두 `-real-qa` 접미사를 사용했다.

| 캡처 | 확인 내용 |
|---|---|
| `00-list-rows-real-qa.png` | 응답 20건, 화면 행 20개 |
| `01-representative-real-qa.png` | 대표 입력 계산 및 저장 후 재조회 |
| `02-blank-input-error-real-qa.png` | 빈 설치비 입력의 400과 화면 오류 |
| `03-large-amount-real-qa.png` | 18자리 입력의 브라우저 정밀도 손실 |
| `04-empty-draft-confirmed-real-qa.png` | 기존 빈 DRAFT 확정 경로 |

## ⑩ 도달 결함

### SOL-R1-01 — 입력 변경 시 결과가 즉시 다시 계산되지 않음

1. 신규 정산 화면에서 대표 입력으로 `계산 및 저장`해 지급액 736,382원을 표시한다.
2. 총 결제금액을 1,234,568원으로 바꾼다.
3. 버튼을 다시 누르지 않으면 지급액은 계속 736,382원이다.

레거시 249~299행은 모든 입력과 토글의 `input/change`에서 `recalc()`를 호출한다. 사용자가 화면 입력만 바꿔도 새 결과라고 오인할 수 있다.

### SOL-R1-02 — 판매비 직접 입력 토글/비율 입력이 화면에 없음

1. 신규/상세 계산 화면에 진입한다.
2. 카드·원천징수 제어는 있지만 판매비 8%/직접 입력 제어의 DOM 개수는 0이다.
3. 서버 API에 직접 판매비 7%를 보내면 지급액 930원이 정상 계산되므로 기능은 서버에만 있다.

레거시 147~164행 및 284~299행의 사용자가 선택 가능한 계약에 화면으로 도달할 수 없다.

### SOL-R1-03 — 일부 금액 입력을 비우면 레거시의 0 대신 저장 실패

1. 신규 화면에서 설치비 입력값을 모두 지운다.
2. `계산 및 저장`을 누른다.
3. 요청은 HTTP 400이고 화면에는 `계산 또는 저장에 실패했습니다`가 표시된다.

레거시 `parseNum` 305~308행은 빈 값을 0으로 계산한다. 화면은 사용자가 칸을 비우는 것을 허용하므로 실제 도달 가능하다.

### SOL-R1-04 — 18자리 금액이 브라우저에서 조용히 변형됨

1. 총액에 `999999999999999999`를 입력한다.
2. 저장한다.
3. 브라우저가 payload를 `1000000000000000000`으로 만들고, 입력 화면도 `1,000,000,000,000,000,000`으로 바뀐다.
4. 정확한 서버 공급가 `782172727272727272`도 화면에는 `782,172,727,272,727,300`으로 표시된다.

프론트 타입은 문자열 계약을 선언했지만 런타임에서 `Number`로 변환해 금액 정밀도를 잃는다.

### SOL-R1-05 — 19자리 금액을 화면이 허용한 뒤 서버 500

1. 총액에 `9999999999999999999`를 입력한다.
2. `계산 및 저장`을 누른다.
3. HTTP 500과 PostgreSQL 원문 `A field with precision 19, scale 6 must round to an absolute value less than 10^13.`이 발생하고 화면에는 일반 실패 문구만 나온다.

입력 상한 검증이 없어 사용자가 정상 UI 조작만으로 서버 오류에 도달한다.

## ⑪ 증거 무결성 자기 고지

- 첫 자동 비교에서 재조회 값을 문자열로 비교해 `736382`와 `736382.000000`을 다르다고 잘못 표시했다. 숫자 정규화 재검증과 실제 화면 재조회로 동일함을 확인했으며 이를 결함으로 세지 않았다.
- 공유 환경의 새 MANAGER 로그인은 200이었지만 발급 직후 bearer로 `/auth/admin/menu-catalog`를 호출하면 401이었다. #10 계산 범위 밖의 현상이라 결함으로 세지 않았고, 화면 도달에 필요한 읽기 전용 auth 요청만 실제 auth-service로 계정/그룹 헤더 및 gateway attestation을 보존해 전달했다.
- 모든 accounting 생성·계산·확정은 격리 PostgreSQL과 격리 accounting-service에서 실행했다. 공유 업무 데이터에는 write를 남기지 않았다.
- 대표 저장/재조회는 실제 직원 MANAGER 계정으로 수행했다. 캐시 토큰은 사용하지 않았다.
- 화면 상단의 업데이트 서버 연결 실패 배너는 #10 계산과 무관하여 결함 수에서 제외했다.
- 캡처 5장은 gitignore 대상 `_local`에 있으며 게시 시점에 로컬 실증 파일로 보존했다.

## ⑫ 프로세스 회수

제가 기동한 Vite 5175, accounting-service 29087 프로세스를 종료하고 격리 컨테이너 `qa1248r1-pg`를 제거했다. 종료 후 확인 결과 대상 포트 listener 잔여 0개, 격리 컨테이너 잔여 0개다.

## ⑬ 판정

**도달 결함 5건.** 대표 범위의 서버 계산식·snapshot 재조회·허용 역할은 레거시 계약과 일치하지만, 실제 사용자는 화면에서 즉시 계산 부재, 직접 판매비 선택 부재, 빈 입력 실패, 큰 금액 정밀도 손실, 입력 상한 부재에 도달할 수 있다.
