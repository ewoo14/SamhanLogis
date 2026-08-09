---
name: feedback_recon_is_pm_codex_implements_only
description: 🚨 정찰은 Claude(PM)가 직접 한다 — codex 는 구현·적대검증·fix 만 (2026-08-09 개발책임자 지시)
metadata:
  type: feedback
---

# 🚨 정찰은 PM 이 직접 · codex 는 **구현 · 적대검증 · fix** 만

> 개발책임자 (2026-08-09): *"정찰은 클로드가 직접하고 코덱스는 구현과 적대검증, fix만 진행하도록 하자."*

## 역할 분담 (현행 정본)

| 단계 | 주체 |
|---|---|
| **정찰 (recon)** — 무엇이 이미 있고 무엇이 없는가 · 표면 전수 · 실 데이터 분포 | **Claude (PM) 직접** |
| **기획 / 설계** | Claude (PM) — 종전과 같음 |
| **구현 (fix 포함)** | CODEX LUNA 5.6 |
| **적대검증 (라이브QA 포함)** | CODEX SOL 5.6 |
| **산출물 검증 · commit 대행 · 게시 · 머지** | Claude (PM) — 종전과 같음 |

## Why

[[feedback_pm_delegate_to_codex_conserve_tokens]] 는 *"정찰·구현·리뷰·라이브QA 를 Codex 에 최대 위임"* 이었다. **정찰만 PM 으로 되돌린 것**이고 나머지 위임은 그대로다.

정찰 결과는 **PM 이 쓰는 기획의 입력**이다. 남이 정찰하면 PM 은 그 보고서를 다시 검증해야 하고([[feedback_pm_verifies_round_and_directs_next_fix]] 의 릴레이 금지), 결국 같은 파일을 두 번 읽는다. 게다가 정찰은 **"무엇을 물어야 하는지" 자체가 설계 판단**이라 위임하면 각도가 어긋난다.

## How to apply

- 새 트랙 착수 시 **PM 이 직접**: 이슈 원문 읽기 · 트랙 문서 읽기 · `git ls-files`/`grep`/`gh pr view` 로 기존 산출물 확인 · 공유 DB `SELECT` 로 실 분포 세기 · **"이미 있는 것 / 새로 만들 것" 경계선** 긋기.
- 정찰 결과는 **기획 문서에 그대로 흡수**한다. 별도 정찰 보고서를 codex 에게 시키지 않는다.
- codex 브리핑에는 **정찰 결과를 전제로 제공**한다 — 구현자가 다시 찾게 하지 않는다(그게 라운드를 늘린다).
- 🚫 `docs/dev-reports/*-recon.md` 를 codex 에게 발주하지 말 것. 이미 발주했다면 `TaskStop` 으로 중단.

## 관련
[[feedback_pm_delegate_to_codex_conserve_tokens]](나머지 위임은 유지) · [[feedback_pm_gives_coordinates_not_means]](설계는 PM) · [[feedback_canonical_workflow]] · [[feedback_pm_no_direct_implementation]](구현은 여전히 LUNA)
