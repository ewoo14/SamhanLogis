---
name: feedback-parallel-backend-tracks-share-docker-stack
description: services/** 를 건드리는 트랙은 병렬로 돌릴 수 없다 — Docker 이미지가 서로 덮이고 공유 DB 가 상대 검증을 오염시킨다 (2026-07-29 #984↔#985 실측)
metadata:
  type: feedback
---

# 🚨 백엔드 트랙은 직렬화 — 병렬 트랙이 서로의 이미지를 덮는다

**2026-07-29 실측.** PM 이 #984(이카운트 임포트)와 #985(주문 확정 단가)를 병렬로 돌리며 **양쪽 브리핑에 `product-service` 재빌드를 지시**했다. 두 워크트리는 소스가 다른데 **Docker 스택과 DB 는 하나**다.

```text
15:13~15:14  #984 트랙이 t9-984 소스로 product-service 재빌드   (R4 lineage 포함)
15:15        #984 임포트 2회 HTTP 200 → 726건 전수 diff 0
     ↓
15:23:46     #985 트랙이 t8-985 소스로 product-service 재빌드    ← R4 없음. 덮어씀
15:24:04     컨테이너 재기동
15:25:03     PM 3회차 임포트 → 422 MIG2_NO_MAIN_CANDIDATE
```

PM 이 결과를 독립 재현하려다 422 를 받고서야 알았다. **검증 결과가 틀린 게 아니라 검증 환경이 파괴된 것**이었다.

## 왜 안 보이는가

각 트랙은 자기 워크트리 안에서만 산다고 착각하기 쉽다. **워크트리는 격리되지만 Docker 데몬·이미지 태그·DB 는 전역**이다. `infrastructure-<svc>:latest` 는 단 하나뿐이라 나중에 빌드한 트랙이 조용히 이긴다. 로그에도 에러가 안 난다 — 그냥 다른 코드가 돌 뿐이다.

DB 는 더 나쁘다. #984 의 임포트가 `products` **2,655행을 갱신**했고, 그 시각에 #985 는 같은 DB 로 부트스트랩↔확정 대조를 돌리고 있었다. 대조 **사이**에 갱신이 끼었다면 표시와 저장이 서로 다른 카탈로그를 본 것이라 **판정 자체가 무효**다.

## 적용

- **`services/**` 를 건드리는 트랙은 동시에 둘 이상 돌리지 않는다.** 프론트 전용·문서·스크립트 트랙만 병렬 허용.
- 병렬 트랙 브리핑에는 **"Docker 기동·DB 접근·`services/**` 빌드 금지 — 건드리면 다른 트랙 검증이 무효가 된다"** 를 명시한다. 경로 배타만으로는 부족하다.
- **검증 결과를 받으면 그 이미지가 아직 그 코드인지 확인**한다:
  ```bash
  docker inspect -f '{{.Created}}' infrastructure-<svc>:latest
  docker exec samhan-<svc> sh -c 'unzip -l /app/app.jar | grep -i <새심볼>'
  ```
  심볼이 없으면 그 검증은 **지금 재현되지 않는다**.
- **"당시엔 옳았다"는 게이트를 통과시키지 않는다.** 머지 게이트 ①은 재현 가능성을 요구한다. 클로버됐으면 직렬화 후 재검증한다.
- 실행 중인 Codex 는 **강제 종료하지 않는다** — MCP codex 는 중단 시 산출물이 하나도 안 남는다. 끝난 뒤 직렬로 재검증하는 편이 낫다.

## 🆕 반대 방향 — **내 이미지가 내 브랜치보다 낡다** (2026-07-29 #985)

남이 덮은 게 아니라 **내가 배포한 뒤 커밋을 더 쌓았는데 재배포를 안 한** 경우다.

PM 이 `9c776fa3c` 로 이미지를 배포하고, 그 뒤 두 커밋(`0194628d4` 계약 변경 ·
`af81ebb88` 중복 방지)을 올린 채 라이브QA 를 돌렸다. 결과:

```text
HTTP 400 INVALID_INPUT — lines[0].productId: 널이어서는 안됩니다   ← 배포본이 아직 @NotNull
동일 payload MD5 인데 draft ID 가 재사용되지 않고 2개 생성됨        ← 재사용 로직이 배포본에 없음
```

**두 관측 모두 코드 결함처럼 보였지만 전부 stale 배포였다.** QA 실행자는 정확히
관측했고 PM 이 틀렸다. 이 결과를 코드 판정으로 썼다면 있지도 않은 결함을 고치려
했을 것이다.

🔑 **라이브QA 를 지시하기 전에 배포본이 검증 대상 SHA 인지 확인한다.** 확인은 두 줄이면 된다:

```bash
docker images --format '{{.Repository}}	{{.CreatedSince}}' | grep infrastructure-
docker exec samhan-<svc> sh -c "unzip -p /app/app.jar BOOT-INF/classes/<새 클래스 경로>.class | strings | grep <새 필드>"
```

실제로 통한 확인 (#985):
```text
infrastructure-partner-order-service   35 seconds ago
/productId;modelCode;categoryKey;quantity;remark    ← 5필드 record = 새 코드 맞음
```

🔑 **커밋을 하나라도 더 쌓았으면 재배포 없이 라이브QA 를 돌리지 않는다.**

## 🆕 세 번째 방향 — **재배포 창(window)이 남의 라이브QA 를 UI 결함으로 위장시킨다** (2026-08-15 #1215↔#1216)

이미지가 덮인 것도, 낡은 것도 아니다. **재배포하는 그 몇 초 동안** 다른 트랙이 화면을 보고 있었다.

```text
#1215 트랙  slip-service · accounting-service 재배포 (자기 소유 서비스라 규칙 위반 아님)
#1216 트랙  같은 시각 회계전표 화면에서 라이브QA
            증상  "저장 버튼이 disabled 라 제출에 도달 못 함"
            gateway 로그  slip-service 172.19.0.11:8086 Connection refused
            실제 원인  sourcePartner.status !== 'valid'  (원천 조회가 401 로 실패)
```

🔑 **화면에서는 완벽하게 UI 결함으로 보인다.** "입력을 덜 했나" 로 읽히고, 버튼이 안 눌리는 이유가 폼 어디에도 없다.
그런데 원인은 **뒤에서 남의 컨테이너가 교체되는 중**이었다. 재배포가 끝나면 증상도 사라져 재현도 안 된다.

🚩 **각 트랙은 규칙을 지켰다.** "네 서비스만 재배포하라" 를 둘 다 따랐는데도 충돌했다.
소유가 갈려 있어도 **두 트랙이 같은 서비스를 필요로 하면** — 한쪽은 배포 대상으로, 한쪽은 의존 대상으로 — 경합한다.

### 적용

```text
백엔드 트랙을 둘 이상 열어야 하면, 라이브QA 는 조용한 창에서만 돌린다
  ⟹ 재배포하는 트랙의 라운드가 끝난 뒤 PM 이 따로 지시한다
그동안 대기 트랙은 서버가 필요 없는 일을 시킨다 (구현·단위/통합 테스트)
  🔑 슬롯을 비우지 말고 일을 바꿔라
"저장/조회가 안 된다" 류 증상은 gateway 로그를 먼저 본다
  🚩 Connection refused 가 보이면 UI 를 파지 마라 — 그건 UI 얘기가 아니다
```

🚨 **IT 통과를 실 HTTP 통과로 세지 마라.** 스택이 흔들려 IT 로 대체했으면 보고서에 그렇게 적고, 조용한 창에서 실 HTTP 로 다시 밟는다. 같은 날 카나리에서 **IT 403 · 실 HTTP 401** 이 갈린 전례가 있다.

관련: [[feedback_parallel_agent_gradle_shared_tree_contention]] · [[feedback_qa_live_shared_data_readonly]] · [[feedback_pm_verify_what_measurement_proves]] · [[feedback_live_qa_needs_renderer_running_first]]
