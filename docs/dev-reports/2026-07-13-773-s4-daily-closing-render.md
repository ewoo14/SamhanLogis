# #773 S4 — 일마감 재검증 결과 FE 렌더 (GAS 파리티·매출만)

- **일자**: 2026-07-13 · **PR**: #811 · **연관**: #773 스펙 §6.7 · 선행 S2c(#808 `d5ba9a45`)
- **워크플로우**: Opus 기획+조기 PR → Codex 구현 → Opus 5-agent(FE/BE/Design/DevOps/QA)+fix+라이브QA+게시 → Codex 5-agent 적대검증+fix+게시 → 0수렴 → PM 종합 9-게이트 → CI green → 머지. **표준 캐논·순차·단축 없음.**

## 배경 (S4 갭)
S2b/S2c 가 BE(`DailyProductLine` 6필드)+mock parity 를 완료했으나 `DailyClosingPage` 는 `taxInvoices` 만 렌더하고 `productSummaries`(재검증 라인)를 **0 렌더** → S4 유일 잔여. 순수 FE 렌더(BE 무변경 원칙).

## 개발책임자 결정 (2026-07-13)
- **① totalDiscount = "GAS대로"**: 레거시 일마감 워크시트는 총 할인 총액 부재(라인별 할인율만·정찰 확증) → totalDiscount 총액 미도입·라인 할인율(actualRate %)로만 노출.
- **② PURCHASE 노출 = 매출만 S4 렌더**: TAX_INVOICE+SALES_SLIP 만. 매입(PURCHASE)은 S4 제외(referent=판매기준 참고용·후속 확정).

## 변경
| 구성 | 내용 |
|---|---|
| `routes/DailyClosingPage.tsx` | Daily Detail Card 에 **모델별 재검증 2nd DataTable**(품명·수량·공급가·출고가·납품가·기대율·할인율·확인 배지·사유). `closingKind==='SALES'` 게이팅(매입 제외). 포맷터 `fmtNullableKrw`(null→'—')·`fmtRate`(0→'0%'·null→'—')·`rateStyle`(음수→빨강). 확인 Badge 3상태(success/danger/neutral). 사유=판정불가 상태만 라벨(VERIFIED→'—'). 새니티 캡션. |
| `routes/DailyClosingPage.test.tsx`(신규) | BE-faithful 7행 픽스처(6 status 전수)·배지 행-스코프·SALES/PURCHASE/ALL 3게이팅·포맷 엣지. |
| `playwright/773-s4-...-real-qa/`(신규) | 라이브 QA 스펙(웹=BrowserRouter 실경로 `/accounting/daily-closings`·dev_accountant·mock OFF). |

## 리뷰 disposition (0수렴)
### R1 — Opus 5-agent(FE/BE/Design/DevOps/QA) + fix + 라이브 QA
genuine 결함 **4건 포착**(5-agent 단축금지 정당성 실증) → Opus 직접 fix:
- **🔴[Design HIGH] 사유='확인' 자기모순** — `DiscountRevalidator.verified(...)`가 verified true/false 모두 `Status.VERIFIED` 반환 → 불일치(verified=false) 행이 확인 배지(🔴불일치) 옆에 사유='확인'. **fix**: 사유는 `status==='VERIFIED'` 시 '—'(배지가 판정 전달·사유=판정불가 사유 전용). **라이브 확증**.
- **🔴[DevOps P0·CI RED] 픽스처 문서번호 형식** — `TX-.../S-.../SRC-...` 이 표준 `yyyy/MM/dd-N` 계약(`mock.test.ts`) 위반 → Frontend Desktop 잡 RED. **fix**: `yyyy/MM/dd-N` 정정.
- **🟠[Design MED] 새니티캡션** — spec §6.7.1 요구(집계=모델·일 평균·라인단위 아님) 누락 → 캡션 추가.
- **[Design/BE Low] 모델 dead 컬럼** — BE modelName 상시 null → 제거(품명에 임베드).
- **[QA MED×2] 테스트 무결성** — verified=true 배지 마스킹→행-스코프·AMBIGUOUS+verified=false BE-불가능→BE-faithful 7행·ALL 게이팅.
- **반증(정상)**: 타입 안전(typecheck exit 0)·enum 4-way·400 불변식·totalDiscount 미도입·회계 규약(음수 '-X' 빨강·0/null).

### 🖥️ 라이브 QA (Docker 실서버·mock OFF·:8080·dev_accountant·2026-05-19 SALES_SLIP 239전표 실데이터)
모델별 재검증 테이블 실 GUI — **불일치 행 사유 '—'**(HIGH fix 확증)·판정불가/불일치 배지·할인율 %·기대율 null '—'·새니티 캡션. `docs/qa/773-s4-daily-closing-render/`.

### R2 — Codex 5-agent 적대검증 (genuine·인라인 리뷰)
- **blocking 0. R1 fix 반증 실패**(5차원 견고): 사유 fix(VERIFIED→'—')·BE-faithful 7행·모델 컬럼 제거·포맷/게이팅 전부 계약 정합.
- **[fix·QA] ALL 상세호출 억제 미검증**(Codex 유일 genuine) → **수용·수정**: ALL 테스트에 `detailQuery enabled: closingKind!=='ALL'` 계약 단언 추가(`getDailyClosingDetailMock` ALL 시그니처 미호출).
- **[disposition·Low] 모델 컬럼 제거 근거** — Codex 인라인에 BE 소스 부재로 "상시 null" 미확인(context 한계). Opus BE 리뷰어가 `MonthEndCloseService:387` `new DailyProductLine(key, null, ...)` always-null 확증 + modelName 토큰은 productName(라벨)에 임베드(중복) → 무변경. BE 채움 시 재도입은 후속(dev-report 후속 참조).
- **환경 메모**: codex exec 파일읽기 PowerShell 스폰이 desktop heap 고갈(0xC0000142)로 반복 실패 → conhost 정리(22→6) + **리뷰 대상 diff 인라인 제공**(shell 불필요)로 genuine 확보.

> Codex R2 fix 후 Opus 재수렴 0 → 0수렴.

## 검증
- vitest `DailyClosingPage` 3/3·`mock.test.ts` 51/51(P0 해소)·전체 desktop **691/691**·`npm run typecheck` exit 0.

## 후속
- **매입(PURCHASE) 재검증 노출** — referent=판매기준 참고용·노출 방식 개발책임자 확정 후 별도 슬라이스.
- **modelName 채움**(BE) — 모델 컬럼 재도입 시. **totalDiscount** — 정의 확정 시(GAS엔 부재).
- 라벨 resolveByLabel N+1 bulk endpoint · 할인율 히트맵(dc-45~49 GAS 시그니처·선택).
