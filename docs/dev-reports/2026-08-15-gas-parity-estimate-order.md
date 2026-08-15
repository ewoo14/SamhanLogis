# 종합견적서·주문서 GAS 파리티 정찰 (2026-08-15)

## 개발책임자 질문

> *"현재 일마감 중인데 종합견적서와 주문서도 지금 모든 기능이 GAS대로 작동하는지 문의."*

배경 — 같은 날 일마감에서 **화면 모양은 맞췄는데 기능이 통째로 빠진** 사례가 나왔다.
`DailyClosingPage.tsx` 1,217줄 → 285줄, 마감 실행·역마감 증발. 일마감을 못 하면 매출전표도 못 만든다.

## 결론

**"GAS 의 모든 기능과 동일하게 작동한다" 고 답할 수 없다.** 다만 일마감처럼 통째로 삭제된 형태는 아니다.

```text
GAS 종합견적서 함수 332개 중 현행에 없는 이름   4개
  decodeBase64 · initDataLayer · loadInitialData · runHeavyInit
  ⟹ 넷 다 업무 버튼이 아니라 GAS 전용 초기 데이터 적재 방식
현행에 추가된 초기화·API 함수                  31개
```

## 🔴 가장 큰 것 — **운영 빌드에서 그 화면에 못 닿는다**

```ts
// clients/desktop/src/renderer/components/sales/SalesSubNav.tsx:39,43
url: import.meta.env.VITE_WEB_ESTIMATE_URL ?? 'http://localhost:5183'
url: import.meta.env.VITE_WEB_ORDER_URL    ?? 'http://localhost:5180'
```

```ts
// clients/desktop/src/main/external-url.ts:24,27
if (parsed.protocol === 'https:') return true
if (!isPackaged && parsed.protocol === 'http:') { /* localhost 만 */ }
return false
```

**두 환경변수를 설정하는 곳은 전수 검색 결과 단 하나** — `scripts/run-client-local-dev.cjs:13-14`, 로컬 개발 런처이고 값도 `http://localhost`.

```text
개발 실행                    ✅ localhost 허용 → 도달 가능
패키징 운영판 + env 미주입    ❌ localhost 거부 → 눌러도 무반응
패키징 운영판 + HTTPS 주입    ✅ 가능하나 주입하는 설정을 저장소에서 못 찾음
```

🔑 `external-url.ts` 주석이 경위를 남겨 뒀다 — 원래 운영 https 도메인이 하드코딩돼 있었고, localhost 기본값으로 바뀌며 dev 가 깨졌다. **그건 고쳤는데 운영 URL 을 되돌리는 일은 안 됐다.**

⟹ 이건 `feedback_built_it_but_user_cannot_reach_it` 의 여섯 번째 사례다.

## 실제 차이 — 종합견적서

### ① 유연호스 I형 단가 — **개발책임자 확정: 현행 8,000 이 맞다**

```js
// GAS  index.html:4720
if(/유연호스I형|I형유연호스/i.test(norm)) return 7000;
// 현행 index.ejs:5149
if(/유연호스I형|I형유연호스/i.test(norm)) return 8000;
```

⟹ **의도된 차이**(가격 인상 반영, GAS 가 낡음). 고칠 것 없음. 대조표에 기록만 한다.

### ② 저장본 미리보기 — 반쪽

```text
화면  item.image 가 있어야 "보기" 버튼을 만든다   index.ejs:18209
DB    preview_image 폐기 · "미리보기 이미지는 저장하지 않는다"
      V100__normalize_quote_snapshot_json_owner_totals.sql:22
⟹ 신규 저장본은 보기 버튼이 안 생긴다
```

### ③ 파생 계산 함수 원문 상이

```text
recomputeFootAll · recomputeHomeRemotes · recomputeHomeDerived · recomputeCommDerived
현행이 카탈로그 누락 감지 · 수동수량 잠금 · 서버 대상 코드 보정을 추가 적용
🚩 실제 값이 GAS 와 같은지는 실데이터 실행 없이는 미확인
```

정적 본문이 동일했던 것: `recomputeSingleBaseFoot` · `recomputeSingleExtras` · `recomputeHomePanels` ·
`recomputeHomeBranches` · 4계열 합계 · `roundK` · `splitIndoorOutdoorToK` · `adjustSingleSetBasePrice`

## 실제 차이 — 거래처 발송 주문서

```text
① 주소검색 이중화 상실
   GAS   배송지·실사지 각각 네이버/카카오 개별 버튼
   현행  각각 버튼 하나로 통합 · Kakao postcode 만 로드
   사라진 함수 14개 중 12개가 네이버 주소검색·주소조합
   🚩 폐기 근거 문서를 못 찾았다 (Ecount·Notion 제거는 README 에 명시돼 있다)
② 메일 발송
   GAS   Code.js:2341
   현행  대응 기능 미확인
```

## 저장 구조 — 둘 다 원본을 안 고친다 (일마감과 같은 성질)

```text
종합견적서  quote_snapshots (JSONB) — 정규 견적 estimates/estimate_lines 와 별도
            V36__create_quote_snapshot.sql:11 이 명시
주문서      partner_order_drafts — 확정 시에만 partner_orders·lines·slip outbox 생성
```

## 내부 관리 화면 도달성 — 정상

| | 종합견적 | 주문서 |
|---|---|---|
| route | ✅ `/sales/estimates` | ✅ `/sales/partner-orders` |
| 사이드바 | ✅ | ✅ |
| pageCode | ✅ `estimates.list` | ✅ `sales.partner-order.list` |
| 하위 메뉴 | ✅ 견적서 관리 | ✅ 주문서 관리 |

🚩 다만 이건 **목록·조회 관리 화면**이다. GAS 의 45개 버튼짜리 작성기와 40개 버튼짜리 주문 앱은 외부 웹앱이고, 그쪽 도달성이 위 🔴 항목이다.

## 보지 못한 범위

```text
운영 빌드에 주입된 실제 환경변수 · 운영 배포 도메인
실거래 데이터로 계산한 결과 · 실제 메일·문자 발송 결과
(규율상 앱·컨테이너·DB 를 건드리지 않았다)
```
