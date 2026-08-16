# 현재 작업 — 2026-08-15~16 **집PC 야간 세션** (진행 중 스냅샷)

> 이 파일만 읽으면 이어받을 수 있습니다.

---

## 0-A. 🆕 08-16 07:20 스냅샷 — 밤새 진행분

### 머지 완료 (야간 8건)

```text
#1224  단톡방 거래처코드 106 / 4 모호 / 2 미매칭     9994c248f
#1226  없는 URL 이 500 이 아니라 404 (14 서비스)      54fe5c535
#1222  금액 천단위 콤마 + ArrowUp 6화면              b3f874a44
#1225  가입고 XLSX → 입고전표 (멱등 실동작 확인)      c6aea2666
#1227  비결정 테스트 2건 (정렬 결정화 · 9초 원인 제거) 477484223
#1228  레거시 적재기 파싱 2건 (DC 100배 · 발송금지 6행) 13753a6b6
#1223  주문 전환 흐름 + 사이드바 중복 정리           633d40c64
#1230  일마감 다중선택 + 정렬/필터                   9769f46e9
(그 전) #1221 · #1218 · #1219
```

### 열린 PR — 상태

| PR | 내용 | CI | 남은 것 |
|---|---|---|---|
| #1231 | 잘못된 식별자 500 → 400/405 | **41/41** | 라이브 실측 후 머지 |
| #1229 | 주문서웹 창고 = 품목분류 | 재실행 중 | 재수렴 검증 |
| #1162 | 자격 로테이션 | 확인 중 | 🚩 **머지 보류** ↓ |
| #1188 | 바로빌·알리고 | — | ⏸️ 자격 확보 전 |

### ✅ 개발책임자 확정 4건 (08-16 06:20)

`docs/decisions/2026-08-16-warehouse-and-data-source-decisions.md`

```text
① 미분류 품목 → 초월(00003)          현재 구현 유지
② 갈리는 32개 → 예외로 레거시 유지    구현 완료 (재계수 32/32)
③ 마스터 미등록 → 확정 실패 유지      가격 방어선 그대로
④ 레거시 데이터 정본 → CSV(Notion)    적재는 착수 전 백업 조건 필요
```

### 🚨 야간에 드러난 운영 결함 (main 에도 있던 것)

```text
주문서웹 가격 미리보기 500
  product-service 가 id·categoryId 를 opaque token 으로 주는데
  partner-order-service 가 UUID 로 파싱한다
  ⟹ #1229 에서 수정 중 (product 응답 계약은 안 건드림)
  🚩 slip-service 는 왜 안 깨지는지 확인 중 (전표 생성은 성공했다)

일마감 상세가 전부 0
  모델 0 · 카테고리 0 · 기준 납품가 0 · 기대율 0% · DC액 0 · 확인 사유 0
  slip-service 응답에 그 키들이 없다. origin/main 에서 재현됨
  ⟹ 원인 정찰 중. 처리 방향은 개발책임자 판단
```

### 🚩 배포본 주의

```text
product-service · partner-order-service 는 지금 wwh(#1229) 빌드다
⟹ #1229 가 머지되거나 QA 가 끝나면 main 으로 되돌릴 것
```

### 🚨 #1162 머지를 보류한 이유

```text
머지되면 compose 가 SAMHAN_INTERNAL_TOKEN 등을 :?required 로 요구한다
⟹ infrastructure/.env(.local) 없이는 컨테이너가 뜨지 않는다
⟹ 반쪽 재배포가 mesh 를 깬다. 14개를 함께 재배포해야 한다
자격 값은 7개 워크트리 .env.local 에 이미 영속화해 뒀다 (gitignored)
```

### 🔑 야간 최대 발견 — 자격이 어디에도 영속되지 않았다

```text
notification-service  재배포 → attestation 이 비어 기동 실패
arologis              내부 토큰만 48자(런처 생성) · 나머지 13개는 28자 → 권한 401
```

값이 **과거 PowerShell 세션의 `$env:` 에만** 있었다. 셸 상태는 툴 호출 사이에 남지 않는다.
증상은 전부 **"권한 없음"** 으로 위장한다. → [[feedback_credentials_only_in_volatile_shell_env]]

현재 14/14 internal token `cb9b211f` · arologis attestation `443e251d` 일치.

### 🚩 개발책임자 판단 대기 (아침)

```text
① 아로로지스 배차 하위 메뉴가 안 뜬다
   게이트웨이가 아로로지스 토큰을 검증할 열쇠를 갖고 있지 않다 (main 도 동일)
   ⟹ 독립 운영 단위인데 게이트웨이에 열쇠를 주는 게 맞는지가 결정 사항
② 주문서웹 창고 변경 상품 32개 (상일↔초월)
   docs/dev-reports/2026-08-15-order-web-warehouse-category-mapping.md
③ 전수조사 2단계 완료 — 배차 계열 포함 12개 프로그램 60건
   동일 8 · 다름 37 · 없음 13 · 확인 불가 2
   docs/dev-reports/2026-08-16-dispatch-and-rest-gas-rule-parity.md
   🚩 금액에 닿는 4건이 문서 맨 앞에 모여 있다
④ 외부 도메인 TLS 주체 불일치 · 주문 웹앱 504 (인프라)
```

### 🚩 정리 못 한 것

```text
.claude/worktrees/ 의 w404 · wlink · wconv 는 머지·종료됐으나
Windows 파일 잠금으로 디렉터리가 남아 있다 (git worktree 등록은 이미 해제)
⟹ 다음 세션에서 rm -rf 로 정리할 것
```

---

## 0. 🚨 이어받는 사람이 가장 먼저 할 것

```text
1  git pull && .\scripts\sync-claude-memory.ps1
2  배포본 나이를 재십시오 — 컨테이너 안의 jar 를
     docker exec samhan-<svc> ls -l /app/app.jar   ← 워크트리 jar 시각과 대조
   🚨 docker inspect 의 .Created 는 이미지 시각이지 jar 시각이 아닙니다
3  열린 PR 4건의 CI 를 exact SHA 로 다시 확인하십시오
4  수치는 그 PC 에서 다시 세십시오 (양 PC 시드 상이)
   실측 예 — 집PC user_db.employees 활성 24명 · ecount_code 부여 0명
            (메모리에 적힌 "91/91 100% 부여" 는 회사PC 값입니다)
```

---

## 1. 🔴 이번 야간 세션 최대 발견 — **"만든 것" 과 "사용자가 닿는 것" 은 다릅니다**

세 트랙이 각각 다른 얼굴로 같은 실패를 했고, **다섯 건 전부 단위 테스트는 GREEN 이었습니다.**

| 트랙 | 테스트가 본 것 | 사용자가 겪는 것 |
|---|---|---|
| `#1214` | `DetailWindowRoute` 배선 통과 | 견적서·주문서 번호를 눌러도 창이 안 열림 |
| `#1214` | 링크 목적지가 맞다 | 판매/구매조회는 **현재 창**이 상세로 바뀜 → 목록을 못 씀 |
| `#1218` | 채팅방 API·컴포넌트 통과 | 그 화면이 **폐기된 숨은 `#/chat`** 에만 있음 |
| `#1218` | dev 역할 셋 catalog "정확히 일치" | **실제 아로로지스 계정**은 `data=[]` → 배차 메뉴 전멸 |
| `#1217` | 메인이 env→query 를 막는다 | 패키지 앱 URL query 로 **만료 인증서가 "31일 남음"** (CRITICAL) |

🔑 **다섯 건 전부 SOL 라이브QA 가 잡았습니다.** 안 돌렸으면 전부 머지됐습니다.
→ [`feedback_built_it_but_user_cannot_reach_it.md`](../../.claude/memory/feedback_built_it_but_user_cannot_reach_it.md)

🚩 **캡처가 있다고 안심하지 마십시오.** `#1218` 은 캡처 5장을 냈고 그게 사용자가 닿지 않는 화면이었습니다.
⟹ 지금은 **캡처마다 "사용자는 여기에 어떻게 오는가" 한 줄**을 적게 하고 있습니다.

---

## 2. 🔴 두 번째 — **낡은 배포본이 하룻밤에 네 번**, 매번 다른 결함의 얼굴로

```text
api-gateway (8/9 JAR)   /app/notices/active 401 → renderer 전면 로그아웃
                        ⟹ attestation 값 불일치로 두 라운드 낭비
auth-service            /auth/admin/menu-catalog 500 NoResourceFoundException
                        ⟹ 컨트롤러 경로 오타로 팔 뻔했다
slip-service            GET /slips 500 No enum constant DeliveryTag.SALE
                        ⟹ UI 셀렉터 문제로 팔 뻔했다
slip-service 재배포 1차   같은 증상 (이번엔 바로 잡음)
```

원인은 스크립트가 아니라 **스크립트를 건너뛴 경로**였습니다 (수동 `compose up` · `-SkipBuild`).
⟹ `-SkipBuild` 시 소스가 JAR 보다 최신이면 **즉시 실패하는 가드**를 넣었습니다.

---

## 3. 🔴 세 번째 — 병렬 트랙은 **워크트리에 main 을 자주 머지**해야 합니다 (개발책임자 지시)

```text
#1210  브랜치가 main 보다 9 커밋 뒤 — CI 를 막던 파일이 브랜치에 아예 없었다
#1216·#1218  Internal Chat Desktop 실패 → main 머지로 소멸
#1217  carrier-list-page · DocumentRenderer 실패 · main 은 같은 시각 CI success
```

🚨 **다만 에이전트가 도는 워크트리에는 머지하지 마십시오.** 충돌 마커가 있는 파일을 그 에이전트가 읽고 자기 결함으로 조사했습니다.
→ [`feedback_merge_main_into_worktree_regularly.md`](../../.claude/memory/feedback_merge_main_into_worktree_regularly.md)

---

## 4. 머지 완료 (이번 야간)

```text
#1210  [FEAT] #999 축③ QR 스캔 입출고        75e9d0d33
#1216  [FEAT] #1144 3·4순위 orchestration    585e28037
```

### `#1210` 이 남긴 것
```text
QR 생성   구매 · 차용 · 대여반납
QR 미생성 반품 · 착하반품 · 회차 · 재입고
🔑 SOL 이 "착하반품·재입고에서 중복 QR" 을 잡았고 7종 전수 RED 로 고쳤다
   대여반납이 QR 을 만들던 것도 정책이 맞아서가 아니라 PURCHASE 로 뭉개져서였다
```

### `#1216` 이 남긴 것
```text
회계전표 생성 전 일마감·금액검증 선행 강제 · 409 사유를 화면까지 전달
삭제/재생성 수명주기 (연쇄 soft delete · 재삭제 404 · 중복 판정)
🔑 SOL 이 오류를 강제 주입해 연쇄 삭제 원자성(1|1|1 롤백)까지 확인했다
```

---

## 5. 열린 PR 4건 — 상태와 다음 한 걸음

### `#1214` UI 정합 (상세 새창 · 작성일 열 · 라인 입력)
```text
S1~S5 구현 완료 · SOL 결함 3건 + 증거 불일치 1건 → 전부 fix
라이브 증거  7종 + 판매·구매조회 번호 클릭 → 창 1 → 2 · ?detailWindow=1
정정         "화면 14개" → 실제 13개
다음 한 걸음  CI green 확인 → 재수렴 → 머지
```

### `#1215` 요청 신원 처리 wave 2
```text
15개 서비스 전부 적용 완료
정상 경로  게이트웨이 경유 GET 200 (8개 표면) · 권한 부족 403 · 위조 401
구조 fix   fail-open 제거(빈 설정이면 기동 실패) · compose 단일 attestation 참조
           필터 순서 15개 명시 배선 · redeploy -SkipBuild 가드
⏳ SOL 검증이 1시간 40분째 진행 중 (15서비스 × 4경로 실계정)
다음 한 걸음  SOL 결과 → fix → 게이트웨이 창 개방 → #1218 검증 → 머지
🚩 role=UNKNOWN 이 403 메시지에 남는다 (표기 문제로 보이나 미확정)
```

### `#1217` 클라이언트 자동 업데이트 (Electron 3 + Expo 3)
```text
Electron 배너 통일 · 인증서 만료 알림 · Expo 3앱 OTA 작업중 보류
SOL 결함 3건 (CRITICAL 1 · HIGH 2) → fix 완료
⏳ CRITICAL 재검증 대기 — 패키지 앱에서 다시 뚫어 봐야 닫힌다
⏳ CI 1건 — DocumentRenderer decode 대입 (pool=forks 여파 가설)
🚩🚩 개발책임자 결정 대기 — EAS project ID 가 PLACEHOLDER 라 OTA 가 실제로 꺼져 있다
     EAS 소유 계정·비용 정책을 정해야 eas init 과 채널 연결이 가능하다
```

### `#1218` #901 클로드 도구 + #894 채팅방
```text
메뉴 catalog 서버 권한 교집합 (정적 94개 중 82개 승격)
채팅방 신설·편집 · 클로드 읽기 전용 도구 1개 (MANAGER 200/70건 · SALES 403)
SOL 결함 3건 → fix 완료 (도구 거부 404/405 포함)
🔒 개발책임자 지적 반영 — 본체 데스크톱 채팅 잔재 전부 제거
   /chat · /chat/:roomCode 라우트 · 사이드바 링크 · ChatRoomsPage/ChatRoomPage
   보존: messengerApi·realtime(공유물) · /admin/chat-rooms(관리 화면) · 독립 메신저 앱
⏳ 아로로지스 메뉴 복구는 게이트웨이 재배포 후 확인 (X-Arologis-Role 헤더)
⏳ CI 1건 — sidebar-category-toggle-인사 (mock fixture 누락 추정)
```

---

## 6. 🚩 트랙 공통 미결

```text
inbound-permission-contract.test.ts  기본 5초 제한에 실제 5149ms — 마진 149ms
  #1214·#1215·#1216·#1218 네 트랙이 각자 "환경 문제" 로 보고했다
  🔑 네 트랙에서 같은 테스트가 같은 이유로 걸리는 것은 환경이 아니다
  npm test 공식 실행이 이 때문에 종료코드 1

호스트 influxd 가 8086/8088 점유
  slip-service 18086 · partner-order-service 18088 로 우회 기동 중
  기본 포트를 가정한 스크립트가 있으면 그것도 막힘의 원인이 된다

QA 경로 가드가 플랫폼 의존
  Windows 에서 qa-shots-dir.sh 를 못 찾아 Desktop 전체 실행이 중단된다
```

---

## 7. 🚩 이 세션에서 PM 이 틀렸던 것 (같은 실수 반복 방지)

```text
"S3 7종 완결"          → 견적서·주문서 2종이 실제로는 안 열렸다
"채팅방 라이브QA 완료"   → 그 캡처가 사용자가 닿지 않는 숨은 화면이었다
"명칭 개편이 접두사를 깼다" → 파일이 main 과 SHA-256 동일했다. 원인은 렌더 타이밍
"attestation 값 불일치가 원인" → 값을 맞춰도 401. 진짜 원인은 8/9 JAR
"main 머지로 CI 실패가 사라졌다" → 아직 안 돈 것이었다. 완료되니 그대로 실패
"partner-auth 는 신원 모델이 다를 것" → 같은 계약이었다. 스펙이 리터럴을 요구한 게 문제
```

🔑 공통점 — **관측을 결론으로 승격시켰습니다.** 진행 중인 것을 완료로, 일부를 전체로, 가설을 원인으로.

---

## 8. 이번 세션에 추가된 메모리

```text
feedback_built_it_but_user_cannot_reach_it        만든 것 ≠ 사용자가 닿는 것
feedback_merge_main_into_worktree_regularly       병렬 트랙 워크트리 main 머지 (개발책임자 지시)
feedback_stale_deployment_looks_like_defect       (증보) 하룻밤 네 번 · 매번 다른 얼굴
feedback_unmerged_migration_blocks_other_tracks   (증보) 되돌리기는 1회 조치다
feedback_compose_up_recreates_parent_containers   compose 가 eureka·gateway 를 끌고 간다
feedback_cancelled_ci_job_can_be_a_disguised_failure  cancelled 는 매달린 실패일 수 있다
feedback_live_qa_needs_renderer_running_first     "로그인 화면에서 막혔다" = renderer 미기동
```
