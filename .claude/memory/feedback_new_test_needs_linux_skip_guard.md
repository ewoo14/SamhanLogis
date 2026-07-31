---
name: feedback-new-test-needs-linux-skip-guard
description: CI 러너는 ubuntu-latest — Windows 전용 단정은 테스트마다 개별 skip 가드가 필요하다. 한쪽만 붙이면 로컬 GREEN·CI RED (2026-07-29 #989 실측)
metadata:
  type: feedback
---

# 🚨 새 테스트마다 "이 단정이 Linux 에서 참인가" 를 개별 확인하라

**2026-07-29 #989 실측.** QA 경로 가드에 Windows 표기(UNC · `subst` · `mklink /J` · admin share) 판정표를 추가했다. **Windows 로컬에서 전체 GREEN** 이었고 PM 이 뮤테이션까지 돌려 확인했다. 그런데 CI 는 RED 였다.

```text
ok 7      978-A-1 경로 표기 판정표 …  # SKIP (Windows 필요)
not ok 16 978-A-1 … 타 워크트리 -ProjectRoot …  AssertionError
```

**새 테스트가 둘이었는데 skip 가드를 한쪽에만 붙였다.**

## PM 이 놓친 지점

PM 은 *"CI 잡이 `ubuntu-latest` 인데 Windows 전용 기능을 쓴다"* 까지 정확히 의심했고, 첫 테스트에 skip 가드가 있는 것을 확인한 뒤 **"CI RED 는 나지 않습니다" 라고 PR 에 썼다.** 두 번째 테스트를 따로 보지 않았다.

🔑 **가드의 존재를 파일 단위로 확인하면 안 된다. 새로 추가한 단정 하나하나에 대해 물어야 한다.**

## 적용

- 새 테스트를 추가하면 **각각에 대해** *"이 단정이 Linux 에서 참인가"* 를 묻는다. "이 파일에 skip 가드가 있다" 는 답이 아니다.
- 로컬이 Windows 인데 **CI 는 `ubuntu-latest`** 다. 로컬 GREEN 은 CI 를 예측하지 못한다.
- 플랫폼 의존 기능 목록: 경로 표기(드라이브 문자·UNC·`\\?\`) · `subst` · `mklink` · admin share · 파일 잠금 의미 · 대소문자 구분 · 라인엔딩.
- 브리핑에 **"CI 러너는 ubuntu-latest 다. 새 단정마다 Linux 에서 참인지 확인하라"** 를 넣는다.

관련: [[feedback_ci_test_filter_false_green]] · [[feedback_ungated_surface_and_mock_covering_defect]] · [[feedback_pm_verify_what_measurement_proves]]
