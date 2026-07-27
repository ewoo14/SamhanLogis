---
name: feedback_reconvergence_before_merge
description: 검증 라운드 fix(특히 상태머신·타이밍·불변식 변경, CI/늦은 포착 fix 포함) 후 머지 전 재수렴 적대라운드 의무. CI/vitest/타깃QA green ≠ 수렴. 적대 [NEW]/심각도 라벨은 baseline git diff로 pre-existing 여부 확증 후 disposition. 2026-07-17 #825 슬1.
metadata:
  type: feedback
---

**사건(2026-07-17 #825 슬1)**: CODEX SOL R2 fix + CI "mock 회귀 hard gate" 회귀 fix(handleChange debounce 상태머신 변경) 후, **vitest 61/810 · ac-2/ac-3 Playwright 14 · 타깃 라이브QA 좁은 재검증만 하고 수렴 선언·머지**. 개발책임자 "재수렴 리뷰 한거 맞아?" 지적. 소급 재수렴(OPUS handleChange · OPUS 종합잔여 · CODEX SOL 3렌즈) 돌리니 **결과는 깨끗(슬1 순변경 기준 0 신규 HIGH/MED)** 이었으나, **머지 전 재수렴을 안 돌린 규율 공백은 실재**. 결과가 다행히 양호했을 뿐.

**Why (두 실책)**:
1. **CI 게이트 통과 = 수렴 착각**. fix 가 상태머신(candidates/status/debounce)을 바꿨는데 좁은 테스트로만 재검증하고, 그 fix 자체를 적대적으로 재검증(0 신규 HIGH/MED 확인)하지 않고 머지. 캐논 "0수렴까지 반복" 의 재수렴 라운드를 생략.
2. **적대 [NEW] 라벨 검증 전 수용(과잉 경보)**. 소급 재수렴에서 CODEX·OPUS종합이 pre-existing 결함을 `[NEW] MED` 로 오판했고, PM(나)이 baseline 확인 전 그 라벨을 받아들여 "머지 성급했다" 경보. `git show <merge-sha> -- <file>`(부모 대비 순변경) 로 직접 대조하니 **둘 다 pre-existing**(항목 A 는 오히려 슬1 이 stale 창을 단축 = 개선). 렌즈는 중간 이터레이션(R1 임시상태)·현재 코드 형상만 보고 pre-existing 을 NEW 로 오판할 수 있음.

**How to apply**:
1. **검증 라운드 fix(상태머신·타이밍·불변식·debounce·선택로직 변경) 후 = 좁은 재검증으로 끝내지 말 것.** 머지 전 **재수렴 적대라운드**(그 fix + 파생을 새 눈으로 적대검증, 신규 HIGH/MED 0 수렴 확인)를 반드시 1회. **CI·늦은 포착으로 인한 fix 도 동일** — 그 fix 자체가 재수렴 대상이다.
2. **CI green · vitest green · 타깃QA green ≠ 수렴.** 수렴의 정의 = 적대라운드가 신규 HIGH/MED 0. 게이트 통과는 필요조건이지 충분조건 아님.
3. **적대검증 [NEW]/심각도 라벨은 그대로 수용/무마 금지 → baseline git diff 로 확증 후 disposition.** `git show <sha> -- <file>` 또는 부모 대비로 pre-existing vs 슬라이스도입을 실측. PM 은 검증 전 경보(과잉)와 무마(은폐) 둘 다 금지 — 근거는 diff 다.
4. **pre-existing 확증 LOW** = 개발책임자 disposition(이슈 등록/후속 슬롯 흡수). **슬라이스 도입 HIGH/MED** = 현 PR 내 fix + 재수렴.
5. **🚨 2-model 재수렴 = 한 모델 '수렴' 선언을 단독 신뢰 금지**(2026-07-18 #825 슬2 실증): OPUS 재수렴이 "0 confirmed·수렴 완료"로 판정한 코드를 **CODEX SOL이 매 라운드 실엣지를 반복 포착**(partnerCode 길이 계약·CM-b 빈draft 우회·동명 거래처 가드 우회). 반대로 CODEX가 `[NEW] MED` 오판한 것을 baseline diff로 반증하기도 함. → **양 모델 모두 돌리고**(OPUS+CODEX), 어느 하나의 "수렴/미수렴" 단독 판정 금지. 6라운드까지 갈 수 있으니 narrow 엣지는 [[feedback_pm_regulate_slice_effort]]로 바운드하며 수렴(내 fix가 낳은 신규결함도 재수렴이 포착 — AA·autoFocus·mock갭).

6. **🚨 0수렴 = "양측 새 지적 0"(any-severity) — 신규 HIGH/MED 0 ≠ 수렴**(2026-07-18 #825 슬4 실증): CODEX SOL R2 fix 후 OPUS 재수렴이 "**신규 HIGH/MED 0**"이나 **LOW 2건 지적**. PM(나)이 LOW를 "비차단·개발책임자 처분"으로 뭉뚱그리고 **머지 승인 선언** → 개발책임자 "재수렴 0도 아닌데 왜 머지?" 지적. 캐논 기준은 `feedback_canonical_workflow` "어느 라운드든 1건이라도 지적되면(false-positive 의심이어도) ①명시 disposition ②full 재수렴(양측 새 지적 0) ③PM 종합 후에만 머지" = **심각도 무관 0**. **적용**: 재수렴이 LOW라도 내면 → (a)fix 하거나 (b)개발책임자 명시 disposition(수용) 받은 뒤 (c)재수렴이 진짜 "양측 새 지적 0" 확인해야 머지. **PM 임의로 LOW를 '처분 대상'이라 적고 머지 예정 선언 금지**(그 처분 권한은 개발책임자). 이번엔 LOW 2건 fix(통합테스트 커버·mock 프레이밍)→최종 OPUS 재수렴 0건 확인 후 머지.

## 🚨 2026-07-28 — **재수렴을 좁게 하면 놓친다. 한 밤에 세 번 연속 실증됐다.**

⚠️ 위 §5·§6 의 "신규 HIGH/MED 0" 표현은 2026-07-22 캐논 개편(**심각도 축 → 도달성 축**) 이전 서술이다. 현행 종료 조건은 **도달 가능한 결함 0**이다. 아래는 그 축에서의 실증.

세 PR 이 같은 밤에 각각, **fix 직후의 재수렴이 좁았다면 놓쳤을** 결함을 냈다:

| PR | 재수렴이 잡은 것 |
|---|---|
| **#951** | R4 fix 가 이미지 검증에 넣은 새 분기가 **애니메이션 WebP 를 거부하는 회귀**를 만듦. 그 형식이 **저장소 자체 자산**(`design-system/.../mascot/samhani.webp`)이고 fix 이전 main 에서는 `201` 로 저장됐다 |
| **#956** | R1 fix 의 **핵심 주장 자체가 거짓**. *"복원해야 `@Async` 가 형제 풀로 안 간다"* 고 production Javadoc 에 단정했는데, `@EnableAsync` 를 실제로 켜보니 **fix 전/후 착지점이 동일**(`scheduling-1`). 원인은 `@Primary` — `getBean(TaskExecutor.class)` 가 성공 반환해 이름 fallback 에 도달조차 못 함. dev-report 는 그 반대를 사실로 서술 |
| **#952** | fix 가 **이 PR 이 지키려고 만든 게이트를 스스로 0 으로** 만듦(가드 step 이 죽어 641 테스트 미실행) |

🔑 **공통 구조** — fix 는 **새 표면을 만든다.** 그 새 표면은 원래 결함이 있던 자리가 아니라 **fix 가 건드린 자리 전체**다. 좁은 재검증은 정의상 "원래 결함이 사라졌나"만 묻고 "새로 무엇이 생겼나"를 묻지 않는다.

### 적용

- **fix 직후 재수렴의 범위 = fix 가 건드린 표면 전체.** "그 결함이 해소됐나"로 좁히지 말 것. 리뷰 브리핑에 **fix 가 무엇을 바꿨는지 나열하고 "새 표면이다, 좁게 보지 말라"를 명시**한다.
- **fix 의 회귀 울타리는 합성 입력이 아니라 저장소·실세계의 실재 자산으로 세운다.** #951 이 합성 4계열로 울타리를 세우고 정작 저장소가 쓰는 형식을 놓쳤다. 울타리를 세울 때 `git ls-files "*.<확장자>"` 로 **실제로 존재하는 것**을 먼저 훑을 것.
- **fix 가 문서·주석에 단정을 새로 쓰면 그 단정도 재수렴 대상이다.** #956 은 코드가 아니라 **출하되는 Javadoc 이 거짓**이었다. 도달성 0 이어도 [[feedback_quoted_output_splice_forgery]] 의 증거 무결성 카브아웃에 해당한다.

### 2-model 실증 사례 (#825 슬4)
OPUS R1이 "결재작성 prefill 정상"이라 판정한 것을 **CODEX SOL R2가 HIGH로 반증** — effect(`GroupwareApprovalCreatePage`)의 무조건 `setApprovers([])`가 조회 isLoading→done 전환 시 사용자 추가 결재자를 덮어씀(version 가드는 async default-load만 보호·동기 clear 무방비). baseline 확증 pre-existing이나 §5 acceptance 소관이라 현 PR fix(templateCode 실제 변경 시에만 reset). → 5단계 이종 모델(OPUS↔CODEX SOL) 교차의 실질 가치.

→ [[feedback_design_system_playwright_mock_suite]](이 사건의 CI 포착 계기)·[[feedback_pm_regulate_slice_effort]](BATCH disposition·재수렴 1회)·[[feedback_canonical_workflow]](0수렴까지 반복·양측 새 지적 0)·[[feedback_recon_grep_false_negative]](검증 없는 단언 금지)·[[feedback_no_fake_data_ever]](정직 보고)·[[feedback_qa_live_shared_data_readonly]](라이브QA 공유 실데이터).
