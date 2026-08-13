---
name: feedback_narrow_briefing_completes_wide_times_out
description: 🚨 브리핑을 좁혀야 완주한다 — 넓으면 7200초 타임아웃. 실측 4건 + 되살린 방법 (2026-08-12 갱신)
metadata:
  type: feedback
---

# 🚨 한 라운드 = 한 가지 질문. 넓으면 죽는다

## 2026-08-12 실측 — 타임아웃 4건 + 무출력 1건

```text
#1170 rebase   7200초   rebase + 전량 재검증 + 라이브QA 를 한 라운드에
#1172 SOL3     7200초   3임무 + 라이브QA
#1175 SOL2     7200초   3임무 + 라이브QA
#1174 fix6     7200초   (변경은 남겼으나 보고서 없이 죽음)
mock 측정      65분     측정 + 전환 + 재확인 + 뮤테이션
#845 DS-4      2시간    무출력

🔑 공통점 — 전부 **라이브QA 를 포함한 다임무 라운드**
```

## ✅ 되살린 방법 — 두 문장이 실제로 효과가 있었다

브리핑에 이 두 줄을 넣자 **29분 만에 산출물이 나왔다**(그전 라운드는 65분간 0건).

```text
"측정이 끝날 때마다 보고서를 **이어 붙이십시오.** 마지막에 몰아 쓰지 마십시오"
"N분을 넘기면 그때까지의 결과로 보고하십시오 — **완주보다 보고가 먼저**입니다"
```

그리고 범위를 이렇게 잘랐다.

```text
❌ (죽은 형태)  "① 확인 ② 확인 ③ 확인 + 라이브QA + 전량 재실행"
✅ (완주 형태)  "확인할 것 셋 — 이것만. 🚫 라이브QA 실행 금지.
                🚫 전체 테스트 재실행 금지(구현자 수치를 인용). 🚫 새 각도 탐색 금지.
                20분 안에 보고."
```

## 🚩 타임아웃은 **워크트리를 더럽힌 채** 끝난다

```text
tools/.s24-build-only/build/deep/tracked-writer.mjs 가
**두 워크트리에서 각각** 지워져 있었다 (w1068 · w883)
```

⟹ 라운드 종료 절차에 넣을 것:

```bash
git diff --name-status origin/main...HEAD | grep '^D'   # 삭제 목록 확인
```

## 🚩 죽은 라운드가 남긴 변경은 **버리지 말고 PM 이 읽어라**

`#1174` fix6 는 보고서 없이 죽었지만 워크트리에 스펙 수정이 남아 있었다.
diff 를 읽으니 **정당한 변경**이었다(옛 식별자 단정 → 공통 resolver 단정 + 단정 1개 추가).

```text
✅ PM 이 diff 를 직접 읽어 정당성을 판단하고 커밋하되,
   **"구현자 검증 원문이 없으므로 이 커밋만으로 결함 0 을 주장하지 않는다"** 를 명시하고
   CI 를 최종 판정자로 둔다
```

관련: [[feedback_codex_parallel_throughput_collapse]] · [[feedback_pm_codex_progress_verification]] ·
[[feedback_briefing_title_only_truncates_existing_report]]
