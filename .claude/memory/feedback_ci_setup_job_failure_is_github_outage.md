# 2026-08-07 새벽 — GitHub Actions 장애 중 CI red 판별법

## 증상

```text
Failed to resolve action download info. Error: Internal Server Error
Failed to resolve action download info. Error: Service Unavailable
```

액션 다운로드 단계에서 죽어 **우리 코드가 실행조차 되지 않습니다.**

## 🔑 판별법 — 이것만 보면 1초에 갈립니다

```bash
gh api repos/ewoo14/Samhan-Public/actions/jobs/<job-id> \
  --jq '.steps[] | select(.conclusion=="failure") | .name'
```
```text
"Set up job"  → GitHub 인프라. 우리 코드는 실행되지 않았다. 고칠 것이 없다.
그 밖         → 실제 실행 중 실패. 원인을 파야 한다.
```

## 왜 이 기록이 필요한가

실패가 **서로 무관한 영역에 흩뿌려집니다** — 모바일·노션 가드·회계·문서 스펙·Detox·Playwright.
코드 회귀라면 이렇게 흩어지지 않는데, 그걸 모르면 **없는 결함으로 fix 라운드를 엽니다.**

실제로 이 새벽에 관측된 것:
```text
#1083  docs 전용 커밋(SOL 지시서 마크다운 1개)인데 7잡 red
       직전 SHA 는 43/43 green ⟹ 코드 원인이 불가능한 상황
#1077  Playwright · 문서 본문 단언 스펙
#1082  slip-it-public · 자격 평문 가드
#1088  Detox Android · Config Audit Guard
```

## 조치

```bash
gh run rerun <run-id> --failed        # 실행 중이면 끝난 뒤 재실행
```
🔑 **자동 재실행 루프**를 백그라운드로 돌리면 사람이 매번 손대지 않아도 회복됩니다.
게이트 ②는 **재실행 후 exact SHA 기준**으로 다시 판정합니다.

## 🚫 하지 말 것

```text
· 이 상태의 red 를 근거로 fix 라운드를 열지 말 것
· "CI red 이므로 머지 불가" 로 트랙을 멈추지 말 것 — 판별부터 하고 재실행
· 재실행 결과를 안 보고 "CI green" 이라 쓰지 말 것
```
