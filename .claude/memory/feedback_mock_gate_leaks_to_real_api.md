---
name: feedback_mock_gate_leaks_to_real_api
description: 🚨 mock 전용 E2E 가 handler 없는 새 endpoint 를 실 API 로 누출시켜 로컬에서만 통과한다 — 격리 실행(VITE_API_BASE_URL=http://127.0.0.1:1)으로만 드러난다 (2026-08-06 #1069 S30)
metadata:
  type: feedback
---

# 🚨 **mock hard gate 가 실 API 로 누출된다 — 로컬 green, CI red**

**2026-08-06 `#1069`(PR #1077) S30.** CI 가 **세 SHA 연속 red** 였는데 로컬에서는 통과했다.

## 기전

```
slip.ts:310-318   화면이 새 endpoint POST /slips/expand-line 을 호출
mock.ts           이 경로 handler 가 없다 → return null
client.ts:63-68   mock mode 라도 getMockResponse() 가 null 이면 adapter 를 설치하지 않는다
                  → 실제 Axios 요청이 나간다
SlipFormPage.tsx  요청 실패를 catch 해 원래 행을 빈 행으로 교체
```

`VITE_MOCK_MODE=1` 이라고 선언한 spec 이 **외부 서버 유무에 따라 red/green 이 갈린다.** 개발자 머신에는 `localhost:8080` 이 떠 있어서 통과했다.

```
기본 API localhost:8080 사용   2 passed (6.8s)     ← false green
API 를 127.0.0.1:1 로 격리      2 failed (18.4s)    ← CI 와 동일한 DOM 전이
```

## 🔑 격리 실행이 판별 도구다

```powershell
$env:CI='1'; $env:VITE_API_BASE_URL='http://127.0.0.1:1'
npx playwright test <spec> --project=chromium --workers=1 --retries=0 --reporter=line
```

Docker 도 DB 도 필요 없고 **18초**면 끝난다. mock 게이트를 자처하는 spec 은 이 실행에서 green 이어야 한다. 그렇지 않으면 그 spec 은 mock 게이트가 아니라 **로컬 환경 게이트**다.

## 🔑 DOM 증거를 오독하기 쉽다

```
3 x <input id=":rl:"  value="SET" aria-label="라인 1 품목">
6 x <input id=":r1l:" value=""    aria-label="라인 1 품목">
```

같은 라벨에 input 두 개가 **동시에 존재하는 것처럼 보이지만 아니다.** `toHaveValue` 의 시간순 polling 중 원래 행이 실패 catch 로 제거되고 새 행이 재마운트된 **기록**이다. 중복 렌더로 단정하면 엉뚱한 곳을 고친다.

## 🚨 PM 이 만든 함정 — 이지선다를 미리 만들어 주면 진짜 답이 밖에 있다

PM 이 *"(가) spec 이 옛 계약을 단언한다 / (나) 전개가 세트 옵션 기능을 깨뜨렸다 — 둘 중 어느 쪽인가"* 로 물었다. **둘 다 아니었다.** 브리핑에 넣어 둔 *"제 전제가 틀렸다면 중단·보고하십시오"* 가 작동해 검증자가 전제를 반려했고, 그 덕에 한 사이클을 아꼈다 → [[feedback_conflict_is_mostly_one_sided_blank]] 의 *"선택지 자체가 잘못 만들어져 있었다"* 와 같은 계열.

- 갈래를 제시하더라도 **"셋째 가능성이 있으면 그것을 내라"** 를 항상 함께 적는다.
- 특히 *"돌려서 확정하라"* 와 이지선다를 같이 주면 검증자가 **주어진 두 칸에 답을 욱여넣을** 위험이 있다.

## 🔑 한 번에 계열을 닫는다

한 endpoint 만 고치면 다음 PR 에서 같은 일이 난다. fix 라운드에 **이 PR 이 추가·변경한 API 호출을 전수 열거하고 mock handler 유무를 표로 대조**시킨다.

## 관련
[[feedback_ungated_surface_and_mock_covering_defect]] · [[feedback_qa_environment_verification_first]] · [[feedback_conflict_is_mostly_one_sided_blank]] · [[feedback_stale_deployment_looks_like_defect]] · [[feedback_qa_harness_commit_breaks_ci]] · PR #1077 S30
