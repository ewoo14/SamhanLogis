---
name: client-bundle-is-also-a-deployment
description: 라이브QA 전 "배포본 나이"는 백엔드만이 아니라 값을 내는 서비스와 클라이언트 번들 전부를 재야 한다
metadata:
  type: feedback
---

# 🚨 "배포본 나이를 재라" 는 백엔드 전용 규칙이 아니다 (2026-08-07 #1077 · 한 세션 2회)

라이브QA 가 FAIL 을 내면 제품 결함으로 세기 전에 **무엇을 실행했는지**부터 확정한다.
이 세션에서 같은 계열 오판이 **두 번** 났고, 둘 다 QA 는 정직했고 **PM 브리핑이 틀렸다**.

## 1회차 — 값을 내는 서비스를 잘못 지목

```text
PM 판정   git diff 719b4d7de..3259c8076 -- services/  → 결과 없음
          ⟹ "백엔드 재배포 불필요"

실제      세트 전개 base 를 내는 것은 slip-service 가 아니라 product-service
          slip-service     2026-08-06T15:31  (맞았음)
          product-service  2026-08-05T17:31  ← 이틀 낡음. 그 PR 자신의 S29 미포함
          ProductSummaryResponse.java  배포본 이후 31 insert / 12 delete
```

재배포 후 실 API 가 `deliveryPrice=1460000.0` 을 냈다. **브랜치 diff 는 맞았고 본 서비스가 틀렸다.**

## 2회차 — 클라이언트 번들이 낡음

```text
package.json  main = out/main/index.js
out/                        2026-08-06 20:40 빌드
out/renderer/assets/*.js    2026-08-06 07:22
R21                         2026-08-07 01:16   ← 번들에 없음
R25                         2026-08-07 03:00   ← 번들에 없음
```

`_electron.launch({ args: ['.'] })` 는 **소스가 아니라 `out/` 을 실행한다.**
그래서 fix 이전 동작이 측정됐고, 이미 PASS 였던 시나리오까지 "회귀" 로 보고됐다.
🔑 **직전 라운드에 PASS 였던 것이 갑자기 FAIL 이면 코드보다 실행 대상을 먼저 의심한다.**

## 🔑 판별법 — 시각보다 **내용**이 확실하다

```bash
# 번들에 그 fix 의 식별자가 실제로 들어갔는가
grep -rl "calculateBundleParentDiscount" out/renderer/   # R25 헬퍼
grep -rl "deliveryPrice"                 out/renderer/   # R21 필드
```

타임스탬프는 캐시·부분빌드로 속을 수 있다. **fix 가 도입한 새 식별자를 grep** 하면 결정적이다.
브리핑에 *"실행 전에 이 grep 을 돌리고 0건이면 중단·보고"* 를 넣으면 라운드를 통째로 아낀다.

## 브리핑에 넣을 것

```text
1. 이 시나리오의 값을 실제로 내는 것이 무엇인가 (서비스 · 번들 · DB)
2. 그것 각각의 나이와 내용 확인 명령
3. "확인이 0건이면 고치지 말고 중단·보고"
```

관련: [[stale-deployment-looks-like-defect]] · [[qa-environment-verification-first]]
