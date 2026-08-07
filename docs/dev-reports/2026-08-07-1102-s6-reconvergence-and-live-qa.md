# PR #1103 / 이슈 #1102 — S6 적대검증 + 라이브 QA

## 0. 환경 확인

> 판정: **FAIL — 결함 2건. R1 1건 대비 +1이므로 S5 되돌림·PM 재분석 조건에 해당한다.**

| 항목 | 실측값 | 비고 |
|---|---|---|
| 작업 좌표 | `C:\dev\Samhan-Public\.claude\worktrees\t1102` | 다른 worktree 사용 없음 |
| 브랜치 / HEAD | `chore/1102-flaky-slipform-price-idref` / `e4acbc3c6` | 지시 좌표 일치 |
| Docker | **18개 실행 · 18개 healthy** | 재빌드·재기동 없음 |
| slip-service | 다른 PR #1097 코드로 기동 중 | `git diff --name-only origin/main...e4acbc3c6 -- services/ shared/` **0파일**. 이 PR은 desktop만 변경하므로 재배포하지 않음 |
| 게이트웨이 | `http://localhost:8080` | 로그인 200, 품목 검색 200, 최근단가 200/204, 저장 201 |
| 렌더러 | `http://127.0.0.1:5175`, t1102 HEAD `e4acbc3c6` | `chromium.launch({ headless: true })`; Vite PID/Chromium은 종료 절에서 회수 |
| 자격 | `infrastructure/.env.local` 없음 | `docs/handoff/CURRENT-WORK.md` 환경 절 사용. 계정 비밀번호는 `<redacted>` |

실행 전 읽기 전용 표본은 `products 3,082`, `slips 344`, `partner_orders 3`이었다. 실행 종료 시점에는 공유 환경의 병렬 QA 영향까지 포함해 `slips 345`, `estimates 35`, `products 3,082`, `partner_orders 3`이었다. 이 라운드가 실 GUI로 새로 만든 것은 판매전표 `2026/08/07-20` 1건뿐이다. #1097 마이그레이션 뒤 표본이 크게 줄어든 상태임을 전제로, 살아 있는 최근단가 hit는 읽기 전용 SELECT로 찾고 선택·저장 자체는 전부 실 GUI에서 수행했다.

인앱 브라우저 연결 목록은 비어 있었다. 사용자 지시의 정본인 설치된 Playwright Chromium 실행 파일을 명시해 `chromium.launch({ headless: true })`로 직접 실행했다. 실제 API 응답은 가로채거나 지연하지 않았고 mock 호출은 사용하지 않았다. 렌더러 브라우저에서 Electron preload의 세션 저장 계약만 동일 shape의 메모리 브리지로 제공했으며 인증값·JWT는 산출물에 기록하지 않았다.

## 1. 라이브 QA ① — 조회 중 단가와 가격 출처

### hit 표본

- 거래처: 주식회사 제이앤피공조
- 품목: `AC060CS6PBH1SY`
- 카탈로그 판매가: 2,516,800원
- 최근단가: 1,590,000원
- 실제 요청: `GET /slips/price-memory?...` → 200
- 응답시간: 1차 26ms, 반복 측정 11ms

반복 측정에서 요청 시각과 브라우저 DOM 시각을 같은 epoch로 맞췄다.

```text
t+0ms   price-memory 요청 시작
t+7ms   요청 pending
         단가 input = "0"
         가격 출처 note = 없음
         행의 공급가액/VAT/합계 = 최근단가 1,590,000원 기준 값이 이미 노출
t+11ms  HTTP 200 응답
t+18ms  단가 input = "1,590,000", note = "판매가"
```

결과는 **FAIL**이다.

- 카탈로그 원값 2,516,800원이 단가 input에 노출되지는 않았다.
- S5가 가격 출처 note는 pending 동안 숨겼다.
- 그러나 단가 input은 빈 값이 아니라 R1과 같은 숫자 `0`을 노출했다.
- `lineForEditor`가 `unitPrice: ''`만 덮고 기존 `supplyAmount`/`vatAmount`/`lineTotal`은 그대로 전달해, 미확정 금액의 공급가액·VAT·합계도 동시에 보였다.
- 완료 뒤 최근단가로 수렴했고, EXPAND 세트인 이 품목은 이어서 구성품 가격으로 전개됐다.

PNG 캡처는 11~26ms 응답보다 느려 pending 프레임을 잡지 못했다. `01`과 `03`은 요청 이벤트에서 시작한 **pending 캡처 시도**지만 파일이 완성될 때는 응답 후였다. 중간 상태는 실제 요청 pending 플래그와 고빈도 실 DOM 샘플로만 관측했으며, PNG는 지시대로 **관측 불가**로 남긴다.

## 2. 라이브 QA ② — 조회 중 직접입력 보존

- 거래처: 동영 온라인점-송아름
- 품목: `AJ060MXHNBC1`
- 최근단가 GET: 200, 18ms
- `t+14ms`: 실제 input 이벤트로 654,321원 입력 완료
- `t+18ms`: 최근단가 응답 완료
- 응답 후 최종 단가: **654,321원 유지**
- 늦은 응답의 사용자값 덮어쓰기: **0건**

결과는 **PASS**다. Playwright의 일반 `fill`은 17ms 응답보다 늦게 완료돼 1차 시도에서는 “입력 시작만 pending”이었다. 같은 실제 input에 브라우저 input 이벤트를 다시 발생시킨 반복 측정에서는 응답 4ms 전에 값이 반영됐고, 응답 뒤에도 유지됐다.

## 3. 라이브 QA ③ — miss(204) fallback

- 같은 거래처에서 품목 `AJ020FERPBC2` 선택
- 최근단가 GET: **204**, 18ms
- 최종 단가: **1,089,000원**
- 가격 출처 note: **판매가**
- partner DC가 카탈로그 판매가에 적용된 기존 fallback 경로로 수렴

결과는 **PASS**다. timeout·500은 인위적으로 만들지 않았고 실제 204 miss만 검증했다.

## 4. 라이브 QA ④ — 연속 라인 입력

```text
품목 3 선택 전  1행 123,456 · 2행 654,321
품목 3 완료 후  1행 123,456 · 2행 654,321
```

이전 라인 단가 소실은 **0건**, 결과는 **PASS**다.

## 5. 라이브 QA ⑤ — 최종 저장

- 실 GUI의 [저장] 클릭
- `POST /slips` → **201**
- 목록 1순위에서 `2026/08/07-20`, `DRAFT`, 총액 5,202,777원 확인
- 읽기 전용 SELECT로 활성 라인 12개와 합계 5,202,777원 재확인

결과는 **PASS**다. 첫 hit 검증에서 전개된 기존 세트 구성품이 같은 폼 state에 남아 있어 저장 전표에는 직접입력 2행·miss 1행 외 구성품도 포함됐다. 저장 성공성 검증에는 영향이 없으며, 이 전표 외 DB 변경은 하지 않았다.

## 6. 코드 각도

### 결함 1 — 실제 `LineRow`가 S5의 빈 값을 다시 `0`으로 만든다

도달 경로:

```text
거래처 선택
→ 품목 선택
→ beginPriceLookup(line.id)
→ priceLookupPendingIds에 line.id 등록
→ SortableLineRow가 lineForEditor.unitPrice = '' 전달
→ design-system LineRow의 priceDisplay가 falsy unitPrice를 '0'으로 변환
→ pending 중 실제 단가 input에 0 노출
```

근거:

- `SlipFormPage.tsx:624-626` — pending이면 `unitPrice: ''`만 합성
- `LineRow.tsx:334` — `line.unitPrice ? ... : '0'`
- `LineRow.tsx:299-300` — 합계/VAT는 전달받은 기존 계산 필드를 계속 사용
- `SlipFormPage.test.tsx:81-127` — `@samhan/design-system`의 `LineRow`를 mock하고 `props.line.unitPrice`를 그대로 input value로 렌더
- `SlipFormPage.test.tsx:319-346` — 그래서 mock에서는 `''`가 GREEN이지만 실제 `LineRow`에서는 `0`

S4와 같은 테스트-실표면 비대칭이 S5에도 남았다. 이 결함은 R1의 도달 결함과 같은 사용자 경로이므로 **R1 결함 1건이 해소되지 않은 것**으로 센다.

### 결함 2 — generation Map 키가 성공·실패·삭제 뒤에도 남는다

도달 경로:

```text
beginPriceLookup(lineId)
→ priceLookupGenerationRef.current.set(lineId, generation)
→ 성공/204/실패의 endPriceLookup
→ pending Set에서만 lineId 삭제
→ generation Map 키는 유지

라인 삭제
→ removeLine(id)
→ lines/selection/bundle context만 정리
→ pending Set·generation Map 정리 없음
```

`emptyLine()`은 단조 증가 `tmp-N` ID를 만들어 삭제·추가로 index가 밀려도 새 라인에 옛 token이 오귀속되지는 않는다. 따라서 **라인이 영원히 pending으로 보이는 현상은 확인되지 않았다.** 다만 Map은 폼이 unmount될 때까지 과거 lineId를 계속 보존하고, 거래처 변경 때 `cancelAllPriceLookups()`가 모든 과거 키를 반복 순회·증가시킨다. S5가 새로 만든 명확한 수명주기 누수이므로 별도 결함 1건으로 센다.

### bulk refresh와 단건 조회

- 표시 masking은 `priceLookupPendingIds`, bulk busy/save gate는 `lookupLoading`/`partnerReprice.isPending`으로 분리돼 있다.
- 후보 0건 bulk cleanup이 모든 line의 `lookupLoading:false`를 쓰던 S3 경쟁은 S5에서 제거됐다.
- S3의 `lookupLoading` 기반 **가격 input/note masking 가드**는 남아 있지 않다. `lookupLoading`은 품목 placeholder·bulk 처리·저장 차단에 계속 쓰인다.
- `priceResolutionBusy`는 `priceLookupPendingIds`를 직접 포함하지 않는다. bulk가 `lookupLoading`을 먼저 내리는 동시 조합에서는 표시만 pending인데 저장 gate는 풀릴 가능성이 있다. 실제 API가 11~26ms여서 이 조합을 자연 상태 GUI에서 재현하지 못했으므로 결함 수에는 넣지 않고 미검증 위험으로 남긴다.

### 제시한 두 갈래 밖의 셋째 가능성

`beginPriceLookup`은 `getPartnerDcConfig` await **뒤**에 있다. 거래처 DC config가 아직 캐시되지 않은 상태에서 품목을 매우 빨리 고르면, DC 조회 중에는 `lookupLoading:true`여도 `priceLookupPendingIds`가 아직 비어 있어 S5 masking이 작동하지 않는 공백이 있다. 이번 표본에서는 DC 응답이 빨라 실 화면 확정 재현을 못 했으므로 결함 수에는 넣지 않았지만, 다음 fix는 “단건 price-memory Promise만”이 아니라 품목 선택의 전체 가격 확정 구간을 어느 신호가 소유하는지 다시 분석해야 한다.

## 7. 결함 수와 R1 대비

| 번호 | 결함 | 도달 여부 | R1 대비 |
|---:|---|---|---|
| 1 | 실제 desktop `LineRow`가 pending 빈 값을 `0`으로 렌더하고 계산 금액을 남김 | 실 GUI + 실제 API 재현 | R1 1건 미해소 |
| 2 | generation Map이 성공·실패·라인 삭제 뒤에도 과거 lineId를 보존 | 코드상 확정 | S5 신규 +1 |

**정확한 결함 수: 2건. R1 1건 대비 +1.** 새 워크플로우 규칙 ②에 따라 PM이 S5를 되돌리고 원인을 다시 분석한 뒤 LUNA fix·검증으로 넘겨야 한다.

## 8. 스크린샷

상대경로 `docs/qa-shots/1102-s6-live-qa/`:

1. `01-hit-pending-attempt.png` — 1차 pending 이벤트에서 캡처 시작, 파일 완성 때는 응답 후
2. `02-hit-final.png` — hit 완료·세트 전개 최종 상태
3. `03-hit-pending-repeat-attempt.png` — 반복 pending 이벤트 캡처 시도, PNG 중간상태 관측 불가
4. `04-manual-entry-during-lookup.png` — 일반 fill 직접입력 시도
5. `05-manual-entry-preserved-after-lookup.png` — 직접입력 123,456원 보존
6. `06-manual-event-during-lookup.png` — 응답 4ms 전 실제 input 이벤트 654,321원 반영
7. `07-manual-event-preserved-final.png` — 응답 뒤 654,321원 보존
8. `08-miss-fallback-and-consecutive-lines.png` — 204 fallback + 앞 라인 보존
9. `09-save-completed-list.png` — 저장 후 목록 1순위 `2026/08/07-20`

## 9. 본 범위와 안 본 범위

본 범위:

- t1102 HEAD의 desktop 판매전표 신규 작성 실 GUI
- 실제 gateway의 거래처·품목 검색, price-memory 200/204, 저장 201
- hit pending DOM, 직접입력 우선순위, miss fallback, 연속 라인, 저장
- S5 generation/pending과 기존 `lookupLoading`의 코드 상호작용

안 본 범위:

- 모바일 실기기/Capacitor 표면
- 인위적 timeout·500·네트워크 지연
- bulk와 단건 Promise가 장시간 실제로 겹치는 저장 클릭 경계
- pending 중 라인 삭제를 실 GUI로 성공시키는 11~26ms 레이스
- 다른 전표/견적 화면 및 #1097 백엔드 기능 정합성
- 컨테이너 재빌드·재기동, DB 쓰기 SQL

## 10. 새 파일 목록

- `docs/dev-reports/2026-08-07-1102-s6-reconvergence-and-live-qa.md`
- `docs/dev-reports/2026-08-07-1102-s6-fix-directive.md`
- `docs/qa-shots/1102-s6-live-qa/01-hit-pending-attempt.png`
- `docs/qa-shots/1102-s6-live-qa/02-hit-final.png`
- `docs/qa-shots/1102-s6-live-qa/03-hit-pending-repeat-attempt.png`
- `docs/qa-shots/1102-s6-live-qa/04-manual-entry-during-lookup.png`
- `docs/qa-shots/1102-s6-live-qa/05-manual-entry-preserved-after-lookup.png`
- `docs/qa-shots/1102-s6-live-qa/06-manual-event-during-lookup.png`
- `docs/qa-shots/1102-s6-live-qa/07-manual-event-preserved-final.png`
- `docs/qa-shots/1102-s6-live-qa/08-miss-fallback-and-consecutive-lines.png`
- `docs/qa-shots/1102-s6-live-qa/09-save-completed-list.png`

