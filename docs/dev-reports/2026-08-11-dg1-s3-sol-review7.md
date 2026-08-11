# PR #1168 D-G1 S3 — CODEX SOL 5.6 재검토7

> 대상 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wdg1s3`  
> 대상: PR #1168 / HEAD `ae2a2f0130f22146be05744e5d0f25b0ef678a64`  
> 검토일: 2026-08-11  
> 범위: 게이트 신뢰성만 재검토  
> 환경: `clients/desktop` 직접 Playwright, headless Chromium-1217, 기존 QA 서버 PID 71632

## 1. 판정

**결함 0. 게이트는 fix5 exact rollback을 10/10 RED로 잡고 정상 구현을 10/10 GREEN으로 통과시켰다. 공식 S3 live도 9/9 통과했다. 머지 가능하다.**

```text
fix5 exact rollback + 수정 gate   10/10 RED
정상 production + 수정 gate       10/10 GREEN
공식 S3 live                      9/9 GREEN
production source 변경            0건
```

이번 라운드에서는 구현자 보고의 수치를 인용해 판정하지 않고 세 실행을 모두 fresh로 직접 수행했다.

## 2. fix5 exact rollback — 10/10 RED

`DocumentReferencePicker.tsx`에 fix5 커밋 `6d9856f0a`의 production 변경만 임시 역적용했다.
임시 상태가 fix5 직전 `d56fa5fe1`과 동일한지는 다음 두 값으로 확인했다.

```text
git diff d56fa5fe1 -- clients/desktop/src/renderer/components/groupware/DocumentReferencePicker.tsx
→ 출력 0건

임시 rollback SHA-256
F5A954F8CBF1922A49A7399583C354F37523D4E7C8FFAB8C6D445F2B401AB4C3
```

실행:

```powershell
$env:PLAYWRIGHT_SKIP_WEB_SERVER='1'
$env:AUDIT_BASE_URL='http://127.0.0.1:5193'
npx playwright test `
  'playwright/2026-08-11-dg1-s3-fix/s3-fix-live.spec.ts' `
  --grep 'scroll 0→3 직후 재클릭은 첫 rAF부터 anchor와 정렬된다' `
  --repeat-each=10 --workers=1 --project=chromium --reporter=line
```

결과는 예상된 exit 1, **10 failed**였다. 열 번의 관측값은 전부 같았다.

```text
FIX5_FIRST_RAF={"visible":true,"aligned":false,"belowGap":7,"scrollY":3}
10/10 RED · false-green 0/10
```

즉 수정된 observer는 실제 mouse click 전에 설치되고, 결함 구현이 만든 첫 rAF의 3px 낡은 좌표를
스케줄링 표본 열 번 모두 놓치지 않았다.

## 3. 정상 구현 — 10/10 GREEN

임시 rollback을 패치로 원복한 직후 production SHA-256과 tracked diff 0건을 먼저 확인하고 같은 명령을
정상 구현에 실행했다.

```text
FIX5_FIRST_RAF={"visible":true,"aligned":true,"belowGap":4,"scrollY":3}
10/10 GREEN · RED 0/10
10 passed (23.7s) · exit 0
```

열 번 모두 정확한 4px gap이었다. 게이트가 과민해 정상 구현을 막는 현상도 관찰되지 않았다.

## 4. production source 불변 확인

재검토6이 기록한 원복 기준과 현재 값을 대조했다.

| 항목 | 재검토6 | 재검토7 종료 | 결과 |
|---|---|---|---|
| `DocumentReferencePicker.tsx` SHA-256 | `9E8E9F3B9CABF8360B15AAEBC191704FCF6EA0EAAE80F68913AA2DC39387870A` | 동일 | 일치 |
| production tracked diff | 0건 | 0건 | 일치 |

또한 `a1277c770..ae2a2f013`의 변경 파일은 Playwright 스펙 1개, dev-report 1개, QA PNG 4개뿐이다.
`clients/desktop/src/**`, `clients/*/src/**`, `services/**/src/main/**`, `infrastructure/**`에 commit diff는 0건이다.

## 5. 공식 S3 live 9/9 및 flaky 관찰

먼저 `--list`로 대상이 1파일 9개인지 확인한 뒤, 같은 기존 서버와 Chromium project에서 `workers=1`로
공식 스펙 전체를 실행했다.

```powershell
npx playwright test `
  'playwright/2026-08-11-dg1-s3-fix/s3-fix-live.spec.ts' `
  --workers=1 --project=chromium --reporter=line
```

```text
9 passed (20.0s) · exit 0
first-rAF 공식 표본  visible=true / aligned=true / belowGap=4 / scrollY=3
```

이번 fresh 공식 9개에서 실패·retry·timeout은 없었다. 핵심 first-rAF 게이트는 별도 RED 10회와 GREEN
10회에서도 각각 10회 동일값이어서, 이번 표본 안에서는 flaky 징후가 없다.

## 6. 환경·제약 확인

- Playwright는 `clients/desktop` 안에서 직접 실행했다. Codex 내장 브라우저는 사용하지 않았다.
- 기존 QA 서버 PID 71632는 시작·종료 모두 같은 Vite command line으로 살아 있다.
- `PLAYWRIGHT_SKIP_WEB_SERVER=1`을 사용했으며 새 QA 서버를 띄우지 않았다.
- 공유 DB는 조회·write 모두 하지 않았다.
- checkout/reset/commit/stage 등 git 작업 트리 조작은 하지 않았다. 해시·diff·status 조회만 사용했다.
- 검증 종료 후 production 파일은 기준 SHA-256으로 복원됐고 tracked 작업 트리는 이 보고서 외 깨끗하다.

## 7. 이번 라운드가 보지 않은 표면

- 제품 위치 계산과 다섯 번째 제품 surface: 사용자 지시대로 재검토하지 않았다.
- Desktop 전체 Vitest, Accounting 전체, Groupware 전체: 구현자 보고 수치를 이번 좁은 라운드에서 재실행하지 않았다.
- headful·비-Chromium·다른 Chromium revision·OS/GPU/주사율 조합은 보지 않았다.
- 공유 DB와 실제 backend 연동 경로는 보지 않았다.

이 미검토 범위를 전체 결함 0으로 확대하지 않는다. 이번 판정의 결함 0은 **수정된 first-rAF gate의
RED/GREEN 판별 신뢰성, production 불변, 공식 S3 live 9개 비회귀**에 한정한다.
