# 트랙 #1256 — 구글 시트 연계 경로 제거

## 개발책임자 확정 (2026-08-16)

> **"맞아 구글 시트와 지금은 연계되어서는 안돼."**

## 현황 — 지금은 DB 를 타지만 통로가 남아 있다

```js
// clients/web/estimate-app/lib/code.js:1847
const useDb = String(process.env.CATALOG_SOURCE || 'db').toLowerCase() === 'db';
const sheetsToPreload = useDb ? [] : [ …13개 시트… ];
```

```text
CATALOG_SOURCE   compose · .env.local 어디에도 없음 → 기본값 'db'
현재 원천        product-service 벌크 endpoint (카탈로그 9종)
주문서웹         GET /api/v1/partner-orders/bootstrap — 시트 경로 없음
```

`CATALOG_SOURCE=sheet` 로 명시 opt-out 하면 **시트를 다시 탄다.**

## 불변식

- 구글 시트를 타는 경로가 남아 있지 않다 — 환경변수로도 되살릴 수 없다
- 🚨 현재 DB 경로 동작을 하나도 잃지 않는다 (카탈로그 9종 동일 로드)
- 🚨 시트 자산 삭제 전 전수 확인 — `apps-script-shim` 은 시트 외 legacy API 도 대행할 수 있다
- 🚨 시트 관련 환경변수·자격이 compose·`.env.local`·문서에 남아 있으면 함께 정리
- DB 로드 실패 시 fallback 이 시트가 아니라 빈 값/오류 표시여야 한다

## 완료 조건

`CATALOG_SOURCE=sheet` 를 설정하고 띄워도 시트를 읽지 않는 것을 실행으로 증명 +
카탈로그 9종이 DB 에서 동일 내용으로 로드되는 화면 증명.
