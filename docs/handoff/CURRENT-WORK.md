# 현재 작업 (CURRENT-WORK)

> 최종 갱신: 2026-08-16 · 집 PC · **세션 진행 중** (원격 접속 · 개발책임자 PowerShell 직접 실행 불가)

## 이 세션에서 한 일

```text
머지 완료      #1249 · #1246 · #1229        (3건)
자격 회전      phase1 + phase2 완결 · 25개 컨테이너 healthy
5슬롯 병렬     라운드 15회 이상 · 도달 결함 15건 발견
잔재 정리      워크트리 디렉토리 2 · node 프로세스 25 · codex 프로세스 5
메모리 추가    2건 (라이브QA Playwright 4차 재발 · QA 하네스 커밋 2번째 축)
```

## 🔑 자격 회전 — **완료**

```text
phase1  SAMHAN_GATEWAY_ATTESTATION · SAMHAN_INTERNAL_TOKEN
        SAMHAN_JWT_SECRET · SAMHAN_AROLOGIS_JWT_SECRET
phase2  DB/RabbitMQ/MinIO 공유 비밀번호 (6키 1값)
        757dafe9 → 9fb9ce51
사용자명은 회전하지 않았다 (비밀이 아니고 role 재생성 위험)
```

### 실행 전에 스크립트가 죽던 것 3건 — 고쳐서 커밋했다 (`ce39c4376`)

```text
1  두 스크립트 다 BOM 없는 UTF-8 + 한글 → PowerShell 5.1 이 ANSI 로 읽어 파싱 에러
2  RandomNumberGenerator::Fill 은 .NET Core 2.1+ 전용 → RNGCryptoServiceProvider
3  Set-Content -Encoding UTF8 이 BOM+CRLF 로 덮어써 첫 키를 ﻿QA_... 로 만들 뻔
   (.env.local 은 BOM 없음 + LF 단독 · compose :?required 가 mesh 를 깬다)
```

### 🚩 함께 드러난 것 — `logging-service` 는 `up -d` 가 건드리지 않는다

`profiles: [logging]` opt-in 이라 회전 전부터 12시간째 낡은 attestation 으로 떠 있었다.
**재배포할 때 `--profile logging` 을 붙여야 한다.**

## 열린 트랙 (PR ↔ 이슈)

| PR | 이슈 | 내용 | 상태 |
|---|---|---|---|
| #1241 | — | GAS 파리티 배치 1 (주문서웹 Ⓐ 6건) | **LUNA fix 중** · 배분금액 뒤바뀜 + main 충돌 해소 |
| #1242 | — | QA 전용 거래처 계정 시더 | 대기 |
| #1245 | #1234 | 레거시 CSV 전체 적재 | **LUNA 구현 중** (격리 리허설까지만) |
| #1248 | #1237 | GAS 격차 '없음' 19개 | **착수 전** |
| #1250 | #1239 | 일마감 금액 편집 | **SOL 검증 중** · 확정 6건 반영 완료 |
| #1251 | #1240 | Cloudflare 배포 워크플로 | ⏸️ 외부 조치 대기 |
| #1252 | #1243 | 발송내역 취소선 + 누락 복원 | **SOL 재수렴 중** |
| #1254 | #1253 | 배너 레이아웃 + 「보안인증서」 | **LUNA 마감 fix 중** · fix 5라운드째 |
| #1188 | #922·#1098 | 바로빌·알리고 | ⏸️ 외부 자격 대기 |

## 개발책임자 확정 (이 세션)

```text
#1250 일마감 6건 전부
  금액 정본 = 단가 기준 분리 (수량 2면 단가에서 나눈 뒤 곱한다)
    ⟹ 저장 도메인이 화면식을 따라가야 한다. 지금까지 반대였다
  출고가 편집 시 단가 유지 (기존 결정문 13 의 "재계산" 문구는 대체됨)
  금액 편집은 DELIVERED·COMPLETED 까지 (회계전표 존재 시 금지는 유지)
  셀 범위 선택과 전표 선택은 완전히 분리
  정렬·필터는 화면을 떠나면 초기화
  다중 붙여넣기는 이번 트랙에서 함께 구현

#1254  스택을 스크롤 가능하게 · 되돌리지 말고 마감 fix
```

## 🚨 이 세션에서 배운 함정

```text
라이브QA "Browser 런타임 []" 4차 재발 — 원인은 5슬롯 동시 발주
  브리핑이 짧아질 때 제일 먼저 잘리는 게 그 블록이었다 (4회 모두 동일)
  → .claude/briefing/live-qa-block.md 에 고정. 손으로 다시 쓰지 말고 붙인다
  → 슬롯 N개면 발주 직전에 N번 다 들어갔는지 센다

QA 증거 커밋이 CI 를 깨는 두 번째 축 — 캡처 경로 상수
  -real-qa 접미사는 맞았는데 resolveQaShotsDir()/_local 격리를 안 거쳤다
  #1246·#1229 두 트랙 연속으로 깼다
  → 커밋 전에 ①접미사 ②캡처 경로 규약 둘 다 본다

SAMHAN_GATEWAY_ATTESTATION 이 프로세스 환경에 없으면
  GatewayAttestationMockMvcConfig:24 에서 fail-closed 로 IT 가 무더기 실패한다
  (#1252 라운드에서 230건) — 코드 회귀로 오독하기 쉽다

합계가 맞아도 라벨-금액 짝이 뒤바뀔 수 있다 (#1241)
  AC060CS6PBH1SY 합계 1,660,000 은 정확한데 실내기/실외기 금액이 서로 반대
  → 합계 검사만으로는 절대 안 잡힌다. 라벨별로 하나씩 대조해야 한다

정렬키가 NULL 이면 페이징이 행을 잃는다 (#1252)
  DOM 117행인데 고유 주문 116개 — 1건 중복 · 1건 소실
  화면 재정렬로는 이미 빠진 행을 복원할 수 없다
```

## 다음 세션의 첫 걸음

```text
1  돌고 있던 5라운드 결과 수습 (#1241 · #1245 · #1250 · #1252 · #1254)
2  #1248 GAS 격차 '없음' 19개 착수 (이슈 #1237 — 무엇을 만들지 결정 필요)
3  잠긴 워크트리 디렉토리 회수
   .claude/worktrees/w1235 · wwh — 프로세스가 잡고 있어 삭제 실패
   등록은 이미 해제됐고 디렉토리만 남았다
4  #1254 결함 5 는 이 PR 범위 밖 — 별도 처리 필요
   미배차 화면에서 최신 자동저장 복원이 날짜 변경 응답을 덮는다
   응답 45건 · input 날짜 2026-08-08 인데 화면 1행 · 3/3 재현
```

## ⏸️ 개발책임자 조치 대기

```text
#1251 Cloudflare
  GitHub Secrets      CLOUDFLARE_API_TOKEN · CLOUDFLARE_ACCOUNT_ID
  Repository Variable SAMHAN_RELEASE_VERSION  (형식 YYYY/MM/DD-{번호})
  Cloudflare          Pages 프로젝트 samhan-order-app · custom domain order.samhan-air.com
  Cafe24 DNS          order 레코드를 Cloudflare Pages CNAME 대상으로 변경

#1188 바로빌·알리고 외부 자격
```
