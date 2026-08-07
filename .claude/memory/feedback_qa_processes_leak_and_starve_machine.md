---
name: qa-processes-leak-and-starve-machine
description: 라이브QA 가 남긴 브라우저·Electron·node 프로세스가 안 죽고 쌓여 개발 PC 를 고갈시킨다 — headless 기본 + 라운드 끝 회수 + BelowNormal
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c13996f5-fe35-4d8e-ae50-ba7df3c72afa
  modified: 2026-08-06T23:40:25.760Z
---

# 🚨 QA 라운드 프로세스가 안 죽고 쌓인다 (2026-08-07 실측)

야간 자율 라운드가 끝난 뒤에도 프로세스가 살아남아 **약 14 GB** 를 쥐고 있었다.

```text
chrome (Playwright)      31개   1,895 MB   ← 전부 내 것 (사용자 브라우저는 Whale 이라 안 섞임)
chrome-headless-shell    19개   2,143 MB
electron (t1013b)         4개     424 MB   ← 새벽 3:05 QA. 라운드는 몇 시간 전 종료
node_repl                80개   1,628 MB   ← 78개가 2시간 넘은 codex 잔재
java (Gradle 데몬)        6개   3,661 MB   ← 13.5시간·3.75시간 묵은 것 포함
```

## 🔑 피해가 두 갈래라 하나만 고치면 안 된다

1. **창 탈취** — headed chromium·Electron 이 뜨면 전체화면 앱이 alt-tab 아웃된다.
2. **자원 고갈** — 14 GB + Gradle 컴파일 + 컨테이너 스택이면 기계가 다른 일을 못 한다.

## 상시 규칙

```text
① Playwright 는 headless: true 가 기본이다
   🔑 headless 캡처도 실 앱이 실 서버를 때린 진짜 스크린샷이다 —
      [[no-fake-data-ever]] 위반이 아니다. 그 규칙은 합성·fixture 금지이지 창 표시 의무가 아니다.
② Electron QA 는 headless 가 안 되니 창이 뜬다 — 개발책임자 PC 사용 중이면 먼저 여쭙는다
③ 라운드 끝나면 브라우저·Electron 을 반드시 회수한다 (끝났다고 안 죽는다 — 4시간 생존 실측)
④ 내 장기 프로세스는 BelowNormal 로 강등해 둔다
⑤ 묵은 Gradle 데몬은 주기적으로 정리 — 유휴여도 RAM 을 쥔다
```

## 판별 명령

```powershell
# 창을 가진 프로세스
Get-Process | ? { $_.MainWindowTitle -ne '' } | Select Name, MainWindowTitle

# 내 chrome 인지 사용자 브라우저인지
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  ? { $_.CommandLine -match 'playwright|remote-debugging-port|--headless' }

# 잔재 나이
Get-CimInstance Win32_Process -Filter "Name='node_repl.exe'" |
  % { [int]((Get-Date)-$_.CreationDate).TotalHours }
```

🚫 **사용자 프로세스를 휩쓸지 말 것** — 죽이기 전에 커맨드라인으로 내 것임을 확정한다.
확인 없이 `Stop-Process -Name chrome` 을 했다면 작업 중인 탭을 다 날렸을 것이다.

관련: [[live-qa-every-round-screenshots]] · [[qa-environment-verification-first]]
