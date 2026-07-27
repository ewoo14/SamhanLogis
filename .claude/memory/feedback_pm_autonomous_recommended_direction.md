---
name: feedback_pm_autonomous_recommended_direction
description: 2026-07-27 개발책임자 상시 위임 — PM 이 권장안을 제시하는 판단은 묻지 말고 그 방향으로 자율 진행하고 결과로 보고한다. 선택지를 나열하며 멈추는 것 자체가 병목
metadata:
  type: feedback
---

# 🚨 PM 권장 방향 = **묻지 말고 자율 진행** (2026-07-27 개발책임자 상시 위임)

> *"권장 방향으로 PM이 자율진행해"* · *"앞으로도 말야"*

## 규칙

- PM 이 **권장안을 제시할 수 있는 판단이면 묻지 않는다.** 결정하고 실행한 뒤 **결과와 근거를 보고**한다.
- 선택지 A/B/C 를 나열하고 답을 기다리는 것은 **그 자체가 병목**이다. 라운드 하나가 도는 동안 개발책임자를 기다리게 하지 않는다.
- 판단 근거·대안·버린 이유는 **PR 에 누적 기록**한다([[feedback_post_devlead_decisions_to_pr]]). 사후 뒤집을 수 있게 남기는 것이 승인받는 것보다 빠르다.

## 적용 범위 — 자율

- **슬라이스 범위 축소·재기획** (기획 전제가 거짓으로 드러난 경우 포함)
- **선재 결함 흡수 여부**
- **fix 방향 선택**(불변식은 PM, 수단은 구현자 — 이 분리는 불변)
- **트랙 충원·순서·병렬도**
- 리뷰 각도 배정·모델 배정([[feedback_canonical_workflow]] 발견=OPUS / 대조=SONNET5)

## 여전히 멈추는 것 (변경 없음)

- **신규 업무규칙·정책** 결정
- **새 이슈 등록**([[feedback_backlog_burndown_issue_bar]])
- **무결성 도메인 편집 정책**([[feedback_integrity_domain_policy_preconfirm]])
- 데이터손실·보안·운영중단급 P0
- 스테이지 **모델 부재 시 대체 여부**

## 실측 배경

2026-07-27 세션에서 PM 이 3건을 물어 세웠다 — ①#896 §11 설계 결정 10항 ②손상 WebP 흡수 여부 ③#863 범위 축소. 셋 다 **권장안이 그대로 채택**됐다. 물어본 시간만큼 트랙이 놀았다.

🔑 다만 ①은 **금액 민감 대형 FEAT 의 정책 10항**이라 묻는 것이 옳았다 — 자율의 경계는 *"내가 권장안을 근거와 함께 쓸 수 있는가"* 이지 *"중요한가"* 가 아니다. 권장안을 못 쓰겠으면 그때는 묻는다.

관련 — [[feedback_pm_permission_autonomy]] · [[feedback_pm_auto_merge_authority]] · [[feedback_pm_regulate_slice_effort]] · [[feedback_canonical_workflow]]
