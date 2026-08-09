---
name: feedback_recorded_plan_conflict_needs_escalation
description: 🚨 핸드오프·세션정리에 적힌 순서/계획을 실측이 반박해도 PM 이 임의로 바꾸지 않는다 — 근거의 강도와 실행 권한은 별개다 (2026-08-09 #1130 머지 순서)
metadata:
  type: feedback
---

# 🚨 기록된 계획과 실측이 어긋나면 **올리고 판단받는다**

> 개발책임자 (2026-08-09): *"그래도 그렇게 세션정리한 것을 멋대로 바꾸면 되냐?"*
> 판정: **유지하되 순서 변경을 정식 기록** · 앞으로는 **항상 올리고 판단받기**.

## 무슨 일이 있었나

전 세션이 `docs/handoff/CURRENT-WORK.md` 에 머지 순서를 적어 두었다.

```
#1145  →  #1130     권한 동결 목록에 MASTER × inbound.inspection 셀이 있음
```

새 세션 PM 이 실측하니 **auth-service Flyway 가 반대를 요구**했다.

```
main   V96      #1130  V98__grant_manager_inbound_inspection_update.sql
                #1145  V99__align_accounting_slip_permissions.sql
application.yml 의 flyway 블록에 out-of-order 키 없음 → 기본값 false
⟹ V99 가 먼저 적용된 DB 에 V98 이 도착하면 기동 실패
```

근거는 정확했다. **그런데 PM 은 그 자리에서 `#1130` 을 머지해 버렸다.**

## 🔑 왜 틀렸나 — 근거의 강도 ≠ 실행 권한

PM 은 *"코드로 확정한 사실이니 내 판단으로 실행해도 된다"* 로 두 가지를 섞었다.

| 축 | 판단 |
|---|---|
| **누가 옳은가** | PM 이 옳았다. Flyway 제약은 실재했고 역순은 배포 실패였다 |
| **누가 실행해도 되는가** | PM 이 아니다. **기록된 결정을 뒤집는 것 + 되돌리기 어려운 동작**이었다 |

[[feedback_pm_auto_merge_authority]] 의 자율 머지 위임은 **게이트 충족 판정**에 대한 위임이지, **적어 둔 순서를 바꾸는 것**에 대한 위임이 아니다. [[feedback_pm_autonomous_recommended_direction]] 의 자율 진행도 *"선택지를 나열하며 기다리지 마라"* 이지 *"기록을 갈아엎어도 된다"* 가 아니다.

⚠️ 결과적으로 문제가 없었다는 것이 절차를 정당화하지 않는다. 되돌림 비용이 실측으로 확인됐기 때문에 유지 판정이 난 것이지, 실행이 옳았기 때문이 아니다.

## How to apply

- 🚨 **핸드오프·PR 결정 기록·개발책임자 지시에 적힌 것과 실측이 어긋나면, 그 자리에서 바꾸지 말고 올린다.** 올릴 때 함께 적을 것:
  1. 기록된 것 — **원문 그대로**
  2. 실측 — 파일:줄 · 버전 번호 · 설정 키
  3. 기록대로 갔을 때 **무슨 일이 나는가** (실패인가 stale 인가)
  4. **되돌림 비용** (되돌릴 수 있는가 · 무엇이 무효가 되는가)
- 🔑 **되돌리기 어려운 동작은 항상 선확인**: main 머지 · 배포 · 삭제 · 외부 게시. 되돌리기 쉬운 것(브랜치 작업·문서 초안·라운드 발주)은 자율 진행 후 사후 보고.
- 🔑 **막지 말 것** — 어긋난 트랙만 멈추고 **영향 없는 트랙은 계속 돌린다**. 판단 대기를 전면 정지로 바꾸지 않는다.
- 판정이 나면 [[feedback_post_devlead_decisions_to_pr]] 대로 **해당 PR 에 결정 기록**을 남기고 핸드오프도 함께 고친다. 채팅에만 두면 다음 세션이 또 같은 것을 뒤집는다.

## 함께 보면

Flyway 번호가 머지 순서를 강제하는 사실 자체는 [[feedback_unmerged_migration_blocks_other_tracks]] 의 마지막 항목(번호 충돌)과 같은 계열이다 — **커밋 전 `origin/main` 과 열려 있는 다른 PR 의 최대 번호를 함께 보라**. 핸드오프에 머지 순서를 적을 때는 **Flyway 축을 먼저 확인하고 적을 것.** 이번 핸드오프는 권한 동결 목록 축만 보고 순서를 정했다가 더 강한 제약과 충돌했다.

관련: [[feedback_pm_auto_merge_authority]] · [[feedback_pm_autonomous_recommended_direction]] · [[feedback_applied_migration_immutable]] · PR #1130 · PR #1145
