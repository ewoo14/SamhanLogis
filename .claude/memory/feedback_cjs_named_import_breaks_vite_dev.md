---
name: feedback_cjs_named_import_breaks_vite_dev
description: 🚨 .cjs 를 named import 하면 빌드는 되고 Vite dev 만 죽는다 — 앱 셸이 통째로 빈 DOM 이 되고, 패키지 앱만 검증하면 못 잡는다 (2026-08-15 #1217 실측)
metadata:
  type: feedback
---

# 🚨 `.cjs` named import — **빌드는 통과하고 dev 만 죽는다**

2026-08-15 `#1217`. Desktop Playwright mock 게이트가 30분 타임아웃으로 두 번 `cancelled` 됐다.

```text
PAGEERROR The requested module
'.../scripts/certificate-expiry.cjs?import'
does not provide an export named 'classifyCertificateExpiry'
```

`CertificateExpiryNotice` 의 CommonJS named import 를 Vite dev 가 평가하지 못해 **앱 셸 전체가 빈 DOM** 이 됐다.

```text
증상   업데이트 배너와 무관한 결재·문서 화면이 전부 element(s) not found
       30분에 183/669 진행 · 실패 90 → 완주 못 하고 타임아웃
fix 후 669/669 · 6분 56초 · exit 0
```

## 🔑 왜 검증이 통과했는데 CI 가 죽었나

```text
패키지 빌드(Rollup)  정상   CJS 를 정적 분석해 named export 를 합성해 준다
Vite dev(ESM 변환)   중단   그렇게 해 주지 않는다
```

**적대검증 16장이 전부 패키지 앱이었다.** 그래서 도달 가능한 결함 0 으로 판정됐다.
그리고 `main` 에는 그 셸 import 자체가 없어서 **브랜치 대조로도 안 보였다.**

## How to apply

```text
🚨 `.cjs` / CommonJS 모듈은 renderer 에서 named import 하지 마라
   default import 후 구조분해하거나 ESM interop 래퍼를 하나 두고 그것만 import 한다
🚨 라이브QA 를 패키지 앱으로만 하지 마라 — dev 와 패키지는 다른 번들러다
   "패키지에서 됐다" 는 "dev 에서 된다" 가 아니다 (그 역도 같다)
🚩 cancelled 잡을 매달림으로 읽지 마라 — 진행률과 실패 번호를 로그에서 세라
   183/669 · 실패 90 이면 매달린 게 아니라 기어가다 타임아웃된 것이다
```

🔑 **RED 는 증상이 아니라 원인으로 잡아라.** "ac-845 가 통과한다" 가 아니라 "named export 가 없다" 를 단정해야 계열 전체가 닫힌다.

관련: [[feedback_cancelled_ci_job_can_be_a_disguised_failure]] · [[feedback_built_it_but_user_cannot_reach_it]] ·
[[feedback_live_qa_first_not_last]] · [[feedback_electron_packaging_gotchas]]
