# D-G5 입출고 예측 — 전년 자료 없으면 "예측 산출 불가"

> 근거: `docs/dev-reports/2026-08-11-gas-sweep-devlead-decisions.md` (개발책임자 결정 D-G5)

## 이 항목이 상정된 경위

```text
GAS 조사가 "입출고 예측 기능의 존폐" 로 올렸다
→ 3축 대조 결과 **이미 구현돼 있었다** (#1012 CLOSED)
→ PM 이 질문을 "존폐" → "계산식을 바꿀지" 로 바꿔 상정
→ 개발책임자 결정: 전년 자료가 없으면 0대로 예측하지 말고 "예측 산출 불가" 로 표시
```

🔑 3축 대조가 없었으면 **이미 있는 기능을 새로 만들 뻔했다.**

## 좌표 (PM 실측)

`clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.ts:113-116`

```ts
const forecastRate = totalPrevious > 0 ? totalCurrent / totalPrevious : 1
const forecast = Array.from({ length: 12 - (lastMonth + 1) }, (_, offset) => {
  return { month: monthIndex + 1, quantity: Math.round((previous[monthIndex] ?? 0) * forecastRate) }
})
```

`previous[monthIndex]` 가 0 이면 결과가 **항상 0** 이다.

## 문제

화면의 `0` 이 *"안 팔린다"* 인지 *"자료가 없다"* 인지 구분되지 않는다. **이 예측은 구매 발주에 쓰인다.**

## 불변식

```text
1  '자료 없음' 과 '실적 0' 을 구분한다 — 전년 합계가 0 인 것과 데이터 자체가 없는 것은 다르다
2  전년 실적이 있는 품목의 예측값은 **하나도 바뀌지 않는다**
3  이 값을 읽는 다른 화면·집계가 있으면 빈 값을 받을 수 있어야 한다
```
