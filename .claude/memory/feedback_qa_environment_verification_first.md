---
name: feedback_qa_environment_verification_first
description: 라이브QA 브리핑 맨 앞에 환경 확인 절을 넣어라 — "결함처럼 보이는 것" 이 배포·워크트리·데이터 조건이었던 사례가 하루 다섯 번
metadata:
  type: feedback
---

# 🚨 QA 브리핑 맨 앞에 **환경 확인 절** — 결함의 절반이 환경이었다 (2026-08-04 · 5회)

## 무슨 일이 있었나

라이브QA 가 올린 차단 중 **다섯 건이 제품 결함이 아니었다.**

```text
#1057  /internal/slips/by-period 404   다른 PR(#1059) 빌드가 배포돼 있었음
#984   R13 의 422 미재현                배포본이 커밋보다 앞섬
                                       (SOL 이 image·jar·commit 시각 대조로 적발)
#984   GUI 임포트 진입점 없음 BLOCKER   임포트는 운영/API 작업 · PM 브리핑 오류
#1057  409 productCode 는 필수          임포트 전 데이터 상태
#1061  R10 전면 BLOCK                   QA 가 다른 워크트리의 mock 프런트를 띄우고 측정
```

## 🔑 가장 위험했던 것 — 다른 워크트리의 프런트

`#1061` R10 은 *"집계·상세 불일치 · 인쇄가 잘못된 거래처"* 로 **전면 BLOCK** 을 냈다. 진단해 보니

```text
5173  다른 워크트리 t1013b · legacy /journals/ledger-data · MOCK_DATA 활성  ← QA 가 본 것
5200  PR 워크트리   t1001b · 공통 /journals/partner-ledger · live query
```

인쇄에 뜬 `강남공조㈜ 12,080,000/7,000,000원` 이 **구 정적 mock 과 원 단위로 일치**해서 잡혔다. 실제 공통 API 는 집계 = 상세로 정상이었다.

**워크트리를 여러 개 띄우는 병렬 세션에서는 포트만 보고 "우리 화면" 이라고 단정할 수 없다.**

## 규칙 — QA 브리핑 맨 앞에 넣을 것

```text
① 이 PR 의 워크트리 경로에서 vite 를 띄운다 (경로를 브리핑에 명시)
② 빈 포트를 --strictPort 로 잡는다. 이미 떠 있는 vite 를 재사용하지 않는다
③ 화면이 부르는 API 를 네트워크로 확인한다
     기대  GET <이 PR 이 쓰는 경로>
     금지  GET <legacy·다른 화면 경로>
④ 위 셋을 보고서 맨 앞 "환경 확인 절" 에 기록한다
```

PM 쪽에서도 QA 결과를 집계하기 전에 물을 것:

```text
배포본 나이   docker inspect -f '{{.Created}}'  vs  해당 커밋 시각
그 PR 이 그 표면을 건드렸는가   git diff --name-only origin/main...HEAD
데이터 조건   발화에 필요한 행이 실제로 있는가
```

## 🆕 2026-08-08 — **백엔드를 바꿨으면 push 직후 PM 이 재배포한다** (하루 3회)

QA 를 붙였다가 **배포본 불일치로 판정 불가**를 받은 것이 하루에 세 번이다.

```text
#1074  배포 JAR 에 되돌린 assertWithinCutoffForCreation 이 남아 있었다
#1092  배포 JAR 이 S2 커밋보다 오래되고 ChangeEstimateOwnerRequest.class 가 없었다  (2회)
```

세 번 다 **QA 가 판정을 거부한 것이 옳았고**, 세 번 다 PM 이 재배포한 뒤 다시 돌렸다.
⟹ QA 한 라운드가 통째로 낭비된다. **QA 가 잡을 일이 아니라 PM 이 미리 맞출 일이다.**

```text
✅ 백엔드 파일이 diff 에 있으면  →  커밋·push 직후 곧바로 재배포한다
                                    (QA 브리핑을 쓰기 전에)
✅ 브리핑에 "배포본 = HEAD 를 맞췄다" 를 근거와 함께 적는다
🚫 "QA 가 알아서 볼 것" 으로 미루지 않는다
```

재배포는 override 를 반드시 함께 준다(→ [[feedback_parallel_backend_tracks_share_docker_stack]]):
```
docker compose -f docker-compose.yml -f docker-compose.local-all.yml \
               -f docker-compose.slip-port-override.yml up -d --build --no-deps <service>
```

🔑 확인은 **파일 시각이 아니라 산출물**로 — *"배포 JAR 안에 이번에 추가한 클래스가 있는가"* 가
   `docker inspect .Created` 보다 확실하다. `#1092` 를 가른 것이 그 확인이었다.

## 관련

- [[feedback_stale_deployment_looks_like_defect]] — 배포본 나이 계열의 선행 관측
- [[feedback_parallel_backend_tracks_share_docker_stack]] — 병렬 트랙이 서로의 이미지를 덮는 계열
- [[feedback_qa_pass_is_not_defect_zero]]
