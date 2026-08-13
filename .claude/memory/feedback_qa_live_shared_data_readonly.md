---
name: feedback_qa_live_shared_data_readonly
description: 라이브QA가 공유 실 도메인 데이터(템플릿·마스터·설정)에 write 하면 위험 — 읽기전용/throwaway 격리. soft-delete replace-set 모델을 이해 못한 채 DB 수술 시 활성 데이터 파손. 2026-07-18 #825 슬4 실증.
metadata:
  type: feedback
---

**사건(2026-07-18 #825 슬4)**: 실서버 라이브QA에서 결재양식(ApprovalTemplate) 편집 테스트가 **실 공유 템플릿(휴가신청서)에 옵션 저장을 write**. 템플릿 update 는 **soft-delete replace-set**(기존 필드 `is_deleted=true` 마킹 + 신규 필드 행 추가) 설계인데, PM(나)이 `SELECT ... WHERE field_key='leaveType'`로 조회해 [soft-deleted 원본(720X·5옵션)] + [활성 저장본(random-UUID·4옵션)] **2행을 보고 "중복 삽입 버그"로 오진** → **활성 행(random-UUID)을 hard-delete** → LEAVE_REQUEST 활성 필드 0 = **일시 파손**. 뒤늦게 `is_deleted` 컬럼·`ux_..._key_active WHERE is_deleted=false` 유니크 인덱스 확인하고 원본 720X 를 **un-soft-delete(is_deleted=false)** 해 원상복구(API 검증: 4필드·leaveType 5옵션). 잔여 오염 0.

**Why**:
1. **라이브QA가 공유 실데이터를 write** — mock 이 못 잡는 것(실 UUID 미노출·실 delta round-trip)만 실서버로 검증하면 되는데, 편집 테스트가 실 템플릿을 저장해 공유 상태를 변형. 단일 세션이라도 실 문서를 오염시키면 타 사용자/후속 QA 에 영향.
2. **soft-delete replace-set 모델을 이해 못한 채 DB 수술** — "중복처럼 보이는 2행"이 실은 [비활성 원본]+[활성 신규]. 심각도 도메인(회계 아님이나 결재 설정)에서 활성 판별(is_deleted) 없이 DELETE = 활성 파손.

**How to apply**:
1. **공유 실데이터 write 라이브QA = 회피.** ① 읽기전용 검증(렌더·칩·DOM UUID·delta 관측)으로 대체하거나 ② **throwaway 전용 엔티티**(전용 거래처/품목/템플릿 생성→검증→삭제)로 격리. 실 공유 마스터/설정/템플릿에 직접 write 금지. (delta 왕복이 꼭 필요하면 net-zero add+remove 로 최소화하고 대상은 안전한 전용 레코드.)
2. **DB 직접 수술 전 = 도메인의 soft-delete/버전 모델부터 이해.** BaseEntity soft-delete(`is_deleted`/`deleted_at`/`deleted_by`)·replace-set(update=old soft-delete + new insert)·`WHERE is_deleted=false` 유니크 인덱스를 확인. "중복 행"은 대개 [비활성 이력]+[활성 현재]. **hard-delete 전 is_deleted 로 활성 판별 필수.** 서비스 update 로직(예 `replaceFields`)을 읽어 정상 설계인지 먼저 확인(정상 설계를 버그로 오진 금지).
3. **오염 유발 시 = 즉시 완전 복구 + 정직 고지.** 원상 확인(seed/원본 값)→최소 수술로 복구(un-soft-delete 등)→API 로 복원 검증→PR·dev-report·개발책임자께 사건 명시([[feedback_no_fake_data_ever]] 정직). 무결성 인접 도메인은 특히.

→ [[feedback_parallel_agent_gradle_shared_tree_contention]](③ 공유 라이브DB 쓰기 경합)·[[feedback_qa_docker_real_test]]·[[feedback_realqa_run_and_false_red]]·[[feedback_applied_migration_immutable]](soft-delete/불변 모델)·[[feedback_no_fake_data_ever]].

---

## 🚨 2026-08-12 — **로그인 자체가 write 다** (SOL 실측)

```text
`#1174` 라이브QA 가 read-only 계약을 위반했다
원인  로그인이 공유 DB 의 `dev_master.last_login_at` 을 **1회 갱신**
```

🔑 지금까지 모든 라이브QA 브리핑이 *"공유 DB 는 조회만"* 을 적으면서 **로그인을 예외로 세지 않았다.**
화면을 밟으려면 로그인해야 하고, 로그인은 write 다. 계약이 처음부터 성립할 수 없었다.

### 그래서 무엇을 할 것인가

```text
✅ 공유 DB 를 쓰는 라이브QA 는 **화면 밟기 자체가 불가능**하다고 보라
   → 격리 DB + 격리 서비스로 하거나, 공유는 SELECT 전용 probe 로만 쓴다
✅ 브리핑 문구를 바꾼다
   ❌ "공유 DB 는 조회만"
   ✅ "공유 DB 는 조회만 — **로그인도 write 이므로 공유 스택으로 화면을 밟지 마십시오**.
       화면 QA 는 격리 DB/서비스로 하십시오"
✅ 이미 갱신된 것을 **되돌리려 하지 말 것** (되돌리는 것도 write 다)
```

### 🚩 같은 라운드에서 함께 나온 것 — "전수" 가 전수가 아니었다

`#1174` 는 14개 서비스를 돌고 공통 resolver 까지 만들었는데 **여섯 곳이 남았다.**
남은 것들의 공통점:

```text
· 공통 resolver 를 **지나지 않는 경로** (홈택스 이력 · 제외 목록 · 협업 이력)
· **변형 UUID** (brace `{32hex}` · `urn:uuid:` · zero-width) — canonical 만 보면 놓친다
· **표시 문자열 불일치** (`system` vs `시스템`)
· **화면 밖 기록** (권한 변경 로그) — "화면만 N/A" 로 판정했다가 뒤집혔다
```

⟹ sweep 의 분모를 **"서비스 목록"** 이 아니라 **"그 값이 사람에게 보이는 모든 출구"** 로 세라.
화면 · 엑셀 · 인쇄 · 알림 본문 · 로그 · 툴팁 · 이력/감사 API 응답.
그리고 **각 출구가 공통 resolver 를 지나는지**를 표로 만들라.

관련: [[feedback_qa_rounds_pollute_shared_data]] · [[feedback_defect_family_sweep_fix]] · [[feedback_qa_environment_verification_first]]
