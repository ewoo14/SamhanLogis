---
name: feedback_compose_up_recreates_parent_containers
description: 🚨 "네 서비스만 재배포" 를 지켜도 compose 단위 기동은 의존 컨테이너(eureka·gateway)까지 재생성한다 — 명령 자체가 규칙을 어긴다 (2026-08-15 #1218 실측)
metadata:
  type: feedback
---

# 🚨 "내 서비스만 재배포" 를 지켜도 **eureka·gateway 가 같이 재생성된다**

2026-08-15 `#1218`. 브리핑에 이렇게 썼다:

```text
🚨 재배포는 auth-service 만 · 공통 인프라(postgres/eureka/rabbitmq/elasticsearch) 재생성 금지
```

구현자는 그대로 따랐다. 그런데 실측은 이랬다:

```text
samhan-eureka        재생성됨 (기동 11분 전)
samhan-api-gateway   재생성됨 (기동 11분 전)
samhan-postgres      무사 (32시간 연속)   ← 이건 살았다
```

🔑 **지시를 어긴 것이 아니라, 지시대로 해도 그렇게 되는 명령이 있었다.**
compose 파일 단위 기동은 대상 서비스의 `depends_on` 사슬을 함께 끌고 간다.

## 왜 이게 아픈가 — 남의 관측을 흔든다

```text
eureka 재생성  ⟹ 전 서비스가 재등록해야 한다
               ⟹ gateway 가 옛 컨테이너 IP 를 들고 있는 창이 생긴다
```

같은 밤 실측된 두 증상이 전부 이 창에서 나왔다:

```text
#1215  게이트웨이 경유 GET 최초 500 → 약 45초 뒤 200
#1216  "저장 버튼이 disabled"  실제로는 slip-service Connection refused
       ⟹ 완벽하게 UI 결함으로 보였다
```

🚩 **재배포한 쪽은 자기 서비스가 healthy 인 것만 보고 끝낸다.** 흔들린 것은 남의 트랙이라 재배포한 사람 화면에는 안 나온다.

## How to apply

```text
① 브리핑에 서비스 이름만 쓰지 말고 "어떻게 띄우는가" 까지 못 박아라
   🚫 compose 파일 전체를 대상으로 up 하지 마라
   ✅ 해당 서비스 컨테이너만 대상으로 재생성하라 (--no-deps 계열)
② 재배포 후 PM 이 부모 컨테이너 나이를 확인한다
   docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'eureka|gateway|postgres'
   🚩 "Up N minutes" 가 방금이면 끌려 나온 것이다
③ eureka 가 재생성됐으면 다른 트랙의 라이브QA 결과를 그 창 안의 것으로 의심하라
   45초 정도는 정상 요청도 500/refused 가 난다
```

🔑 **postgres 가 살아남은 것은 운이 아니라 depends_on 구조 덕이다.** 다른 조합에서는 DB 가 끌려 나올 수 있다 — 그때는 복구가 아니라 손실이다.

관련: [[feedback_parallel_backend_tracks_share_docker_stack]] · [[feedback_qa_live_shared_data_readonly]] ·
[[feedback_stale_deployment_looks_like_defect]] · [[feedback_pm_verify_what_measurement_proves]]
