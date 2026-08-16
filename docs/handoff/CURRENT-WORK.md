# 현재 작업 (CURRENT-WORK)

> 최종 갱신: 2026-08-16 17:20 · 집 PC · **세션 종료 핸드오프**

## 이 세션에서 한 일

개발책임자 지시: *"이슈를 완전히 닫는 것을 목표로 전체 이슈 및 미완료 내역에 대한 모든 트랙(PR)을 열고 병렬 진행"*

```text
머지 완료        #1232 · #1244 · #1247        (3건)
트랙 개설        이슈 10건 → PR 11건
도달 결함        36건 발견 → 27건 fix · 9건 검증/fix 대기
증거 무결성 위반  6건 적발·정정 (그중 2건은 PM 이 통과시킨 것)
QA 오염 정리      18건 (1건 삭제 + 17건 거래처명 복구)
디스크 회수       60.24 GB · 프로세스 잔재 275 → 0
메모리 규칙 추가   6개
```

## 열린 트랙 (PR ↔ 이슈)

| PR | 이슈 | 내용 | 상태 |
|---|---|---|---|
| #1229 | — | 창고 결정 + 금액 단일원천 + opaque 식별자 sweep | fix 5회 · SOL 4회 · **목적 경로 도달 확인** |
| #1241 | — | GAS 파리티 배치 1 (주문서웹 Ⓐ 6건) | CI 47/47 · SOL 재수렴 중 |
| #1242 | — | QA 전용 거래처 계정 시더 | CI 34 pass · **#1229 머지 후 재확인 필요** |
| #1245 | #1234 | 레거시 CSV(Notion) 전체 적재 | **착수 전** |
| #1246 | #1235 | Expo 배선 + 릴리스 자격 차단 | CI 46/46 · **결함 4건 fix 대기** |
| #1248 | #1237 | GAS 격차 '없음' 19개 | **착수 전** |
| #1249 | #1238 | GAS 파리티 배치 2 + 구글 시트 제거 | **도달 결함 0** · CI 1건 실패(아래) |
| #1250 | #1239 | 일마감 금액 편집 + 양방향 할인율 | **착수 전** |
| #1251 | #1240 | Cloudflare 배포 워크플로 | CI 38/38 · ⏸️ **외부 조치 대기** |
| #1252 | #1243 | 발송내역 취소선 + 권한 8행 | SOL 검증 중 |
| #1254 | #1253 | 배너 레이아웃 + 「보안인증서」 | fix 진행 중 |
| #1188 | #922·#1098 | 바로빌·알리고 | ⏸️ 외부 자격 대기 |

## 다음 세션의 첫 걸음

```text
1  #1249 CI 1건 분류 후 머지
   실패  Frontend Desktop (typecheck + lint + build)
         Test Files 1 failed | 299 passed (300)
         src/renderer/routes/components/CodefImportScopeForm.test.tsx
           "F2 — 라벨 해석이 전부 실패해도 '선택 항목이 없습니다'라고 말하지 않는다"
   🚩 이 PR 은 estimate-app 만 건드렸고 desktop CODEF 폼과 무관하다
      로그에 jsdom XHR AggregateError · SSE 503/404 가 다수 — flaky 의심
      ⟹ main 에서도 같은 테스트가 실패하는지 먼저 확인하라 (재실행 1회 포함)
      main 도 실패하면 #1249 소관이 아니다
   🚨 PR 본문의 Closes #1238 을 제거하라 — GAS Ⓐ 나머지가 남아 있다
2  #1246 결함 4건 fix
   릴리스 가드 우회 2경로 (APP_VARIANT 미지정 · BUILD_ENV 미지정)
   거래처 검색 전면 404 (/api/v1/partners/quick-search 컨트롤러 부재)
3  #1229 · #1241 · #1252 · #1254 재수렴 후 머지
4  착수 전 3트랙 (#1245 CSV 적재 · #1248 GAS 없음19 · #1250 일마감 금액편집)
```

## 개발책임자 확정 (이 세션)

```text
종합견적서는 직원 전용 · 주문서웹이 거래처용
  → .claude/memory/feedback_estimate_app_is_staff_only.md
구글 시트와 연계되어서는 안 된다 (#1249 에서 제거 완료)
발송내역 삭제행은 취소선+회색으로 남긴다 (레거시보다 나은 쪽으로 의도적 이탈)
주문서웹으로 보낸 주문이 발송내역에 안 뜨는 것은 결함 → #1252 에서 처리
QA 오염 전표 17건은 삭제 대신 거래처명 복구 (재고 연결 보존)
Expo 는 네비게이터 배선부터 · #1240 은 Cloudflare 로 이전
새 이슈를 만들지 말고 기존 트랙 안에서 처리한다
확인 필요건은 항상 선택지로 올린다
```

## 🔑 자격 회전 — 다음 세션에서 수행 (개발책임자 승인 완료 · 실행만 남음)

2026-08-16 검증 중 codex 세션 출력에 자격 값이 노출됐다. 회전은 승인됐고 **스크립트까지 준비돼 있다.**

```text
scripts/ops/rotate-credentials-phase1.ps1   앱 시크릿 4개 (저위험)
scripts/ops/rotate-credentials-phase2.ps1   인프라 공유 비밀번호 1개 (고위험)
```

### 회전 대상 — 9키가 실제로는 6개 값

```text
757dafe9  DB_PASSWORD = POSTGRES_PASSWORD = RABBIT_PASSWORD
          = RABBITMQ_DEFAULT_PASS = MINIO_ROOT_PASSWORD = SAMHAN_S3_SECRET_KEY
          ⟹ 인프라 4종이 비밀번호 하나를 공유한다
0ec39e75  DB_USER = POSTGRES_USER = RABBIT_USER
          = RABBITMQ_DEFAULT_USER = MINIO_ROOT_USER = SAMHAN_S3_ACCESS_KEY
443e251d  SAMHAN_GATEWAY_ATTESTATION      독립
cb9b211f  SAMHAN_INTERNAL_TOKEN           독립
153cd5d4  SAMHAN_JWT_SECRET               독립
4c3f6e4f  SAMHAN_AROLOGIS_JWT_SECRET      독립
```

### 실행 순서

```text
0  진행 중 codex 라운드가 없는지 확인한다
   🚨 라운드가 공유 DB 를 pg_dump 로 읽는 중이면 비밀번호 변경이 그 라운드를 깬다

1  phase1 실행 → .env.local 백업 · 앱 시크릿 4개 교체 · 인프라 키 불변 확인
2  전 서비스 재배포 → 헬스 확인
   🚨 compose 가 :?required 로 19키를 요구한다. 반쪽 재배포는 mesh 를 깬다 (실측 2회)
3  phase1 이 깨끗하면 phase2
   PostgreSQL ALTER USER → 새 비밀번호 접속 검증 (실패 시 .env.local 미변경 상태로 중단)
   RabbitMQ change_password → authenticate_user 검증
   .env.local 6개 키 동시 갱신
   MinIO 컨테이너 재생성 (root 자격이 env 기반 · 데이터 볼륨 유지)
4  14개 전체 재배포 → 헬스 확인
5  9개 워크트리에 .env.local 동기화
   🚨 동기화 시 형식 검증을 먼저 하고 덮어라 — 이번 세션에서 옛 값이 덮인 사고가 있었다
```

### 🚩 범위를 좁힌 부분 (PM 판단 · 개발책임자 확인 필요)

```text
사용자명(DB_USER · MINIO_ROOT_USER · RABBIT_USER · SAMHAN_S3_ACCESS_KEY)은 회전하지 않는다
  비밀이 아니고, 바꾸려면 새 PostgreSQL role 생성 + 소유권 이관 + MinIO 루트 교체가 필요해
  실패 시 데이터 접근이 막힐 위험이 크다
사용자명까지 바꿔야 한다면 별도 작업으로 계획을 다시 세운다
```

## ⏸️ 개발책임자 조치 대기

```text
#1251 Cloudflare  다음 세션에 상세 안내 예정
  GitHub Secrets      CLOUDFLARE_API_TOKEN · CLOUDFLARE_ACCOUNT_ID
  Repository Variable SAMHAN_RELEASE_VERSION  (형식 YYYY/MM/DD-{번호})
  Cloudflare          Pages 프로젝트 samhan-order-app · custom domain order.samhan-air.com
  Cafe24 DNS          order 레코드를 Cloudflare Pages CNAME 대상으로 변경

#1235 Expo 네이티브  Expo 계정/EXPO_TOKEN · Android SDK · EAS signing credential
```

## 🚨 이번 세션에서 배운 함정

```text
실행 중 서비스가 PR HEAD 가 아니면 백엔드 항목을 라이브로 못 잡는다
  → PR HEAD JAR 로 격리 배포하고 JAR SHA-256 을 컨테이너와 대조하라

stub 화면은 한글도 정상이다 — 행 수를 세야 걸린다
  → .claude/memory/feedback_screenshot_row_count_must_match_data.md

fix 가 정상 경로를 막은 것이 이 세션에만 세 번
  → 회귀표를 한 스위트에 넣어 양방향으로 잠가라

함수 단위 테스트가 통과해도 배선은 미검증일 수 있다
  → RPC/HTTP 엔드포인트를 통해 upstream 이 받는 것을 단정하라

라이브QA 프로세스는 회수 지시가 없으면 쌓인다 (275개까지 갔다)
  → .claude/memory/feedback_gui_live_qa_steals_the_desktop.md

금액은 단계마다 갈라진다 — 품목표·미리보기·최종확인·저장값을 나란히 비교하라
  → .claude/memory/feedback_amount_must_be_single_source_across_steps.md
```
