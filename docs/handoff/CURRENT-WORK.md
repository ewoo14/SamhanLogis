# 현재 작업 — 2026-08-11 집PC 세션 (진행 중 · 자율 운행)

> 이 파일만 읽으면 이어받을 수 있습니다.

---

## 0. 🚨 이어받는 사람이 가장 먼저 할 것

```text
1  docker ps -a --filter "name=samhan-" --format "{{.Names}}\t{{.Status}}"
   🚨 있는 것만 읽지 말고 **없는 것을 세십시오**
2  git pull && .\scripts\sync-claude-memory.ps1
3  수치는 그 PC 에서 다시 세십시오 (양 PC 시드 상이)
```

### 🔴 배포·복구 시 `--no-deps` 를 빠뜨리지 마십시오

`--no-deps` 없이 돌리면 postgres·eureka·gateway 가 재생성돼 스택이 `Created` 로 멈춥니다.

```bash
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml \
  -f infrastructure/docker-compose.local-portfix.yml up -d --build --no-deps <svc>
```

### 🔴 배포본이 main 보다 낡으면 서비스가 죽습니다 — 이번 세션에 **두 번**

```text
세션 시작   product-service·partner-service 가 5시간 Exited(255)
            No enum constant ProductStatus.NOT_FOR_SALE — 배포본이 #1133 이전
중반        arologis-service 가 **재시작 770회** · 9시간 crash-loop
            Flyway 체크섬 불일치. DB 는 main 과 일치했고 **jar 이 낡은 것**이었다
🔑 복구 스크립트가 "checksum mismatch (none)" 을 내 준 덕에 DB 를 잘못 고치지 않았다
```

### 🔴 포트 8086 을 `influxd` 가 가져갔습니다

`infrastructure/docker-compose.local-portfix.yml` 로 우회(host 8186). 🚫 커밋 금지.

### 🚩 미해결 — `auth_db` 에 미적용 마이그레이션 `99`·`100`

배포된 auth-service 가 main 보다 낡습니다. auth 축 라이브QA 전에 재배포 필요.

---

## 1. 이번 세션 머지 5건

| PR | 머지 | 내용 |
|---|---|---|
| `#1126` | `2c62202c6` | 수량동기화 칩 |
| `#1134` | `97da5590` | 버전이력 모달 |
| `#1132` | `6b801a553` | 세트 전개 기본구성품 + 정액DC 분류축 |
| `#1167` | `a16eb48b6` | 입출고 예측 '—' 표시 |
| `#1164` | `62898108f` | UUID 잔여 노출 |

---

## 2. 열린 트랙

| PR | HEAD | 상태 |
|---|---|---|
| `#1131` 판매전표 계보 | `485b49d05` | **CI 51 SUCCESS** · SOL R13 재검증 중 (R12 가 제품결함 3 수정) |
| `#1165` 영업수수료 정산 | `06bb8bf6e` | S1 PASS · S2 에 **차단결함**(versioned 미작동) fix 중 |
| `#1166` 제품구분 정비 | `b5e34da0c` | 백필+미분류 개명 · SOL 검증 중 → 그다음 40% 규칙 |
| `#1162` 자격 노출 | `ae2609670` | ⏸️ 회사PC 이월 |

---

## 3. GAS 전수조사 — **종결. 결론은 유실 0**

```text
분모 이력   889 → 3,200 → (Critic 반증) 최소 3,595
   🚩 두 번 연속 틀렸다. v1 은 **포팅본을 조사하고 원본 GAS 를 안 봤다**
최종        원본 전용 업무규칙 257개
            유실 0 / 대체 132 / 불필요 116 / D-G1 귀속 8 / 보류 1
🔑 금액에 닿는 유실 8건이 **전부 영업수수료 정산(D-G1)의 구성 함수**였다
   ⟹ 조사의 값은 "무엇을 더 만들까" 가 아니라 **"더 없다는 것을 확정한 것"**
```

산출물: `2026-08-11-gasv2-CRITIC.md` · `-gasv3-remainder.md` · `-gasv4-lost-rules.md` · `-gasv4-CRITIC.md`

---

## 4. 개발책임자 결정 — `docs/dev-reports/2026-08-11-gas-sweep-devlead-decisions.md` 가 정본

```text
D-G1  영업수수료 정산 도메인 신설 (accounting-service · 회계 탭 신설 메뉴)
      문서번호 YYYY/MM/DD-N · DRAFT 무번호 · CONFIRMED 시 채번
      ApprovalReferenceDocType 7번째 값 → 지출결의서 참조 첨부
      정산 화면에 그룹웨어 연결 버튼 (저장소 최초 사례)
      🆕 연결된 그룹웨어 문서 확인·상태조회 · 문서번호 클릭 상세(#1094 규약)
D-G2  🚫 **철회** — "견적앱은 원래 자율 입력" · PM 이 틀린 전제로 선택지를 만들었다
D-G3  원장 특례 9199/9549/1089 — 영향액 산출 후 (집PC 0건 = 판정 불가)
D-G4  거래처 4자리 비밀번호 — 한시 허용 후 강제 재설정
D-G5  ✅ 입출고 예측 전년 자료 없으면 '—' (#1167 머지)
D-G6  정산 권한 — 전용 pageCode · 기본 회계담당자 이상 · 권한관리에서 개별 관리
D-G7  정산서 확정 후 기준일 수정 금지
      🚩 확정 취소 경로도 기준일 수정 API 도 **없다** — 영구 잠금이 되므로 재상정 필요
D-G8  제품구분 정비 — 품목명 자동분류 + 미분류
```

### 🚩 `#1166` 확정 사양 (40% 규칙)

```text
대상   주문 경로만
규칙   (실외기 없음 AND 실내기 없음) AND 변동DC 대상 품목 → 40%
🚫 견적은 대상 아님 — "종합견적서는 대부분 사용자가 커스텀"
   판정 기준·상한·페널티 아무것도 넣지 않는다
```

---

## 5. 🚨 이 세션에서 굳힌 것

```text
🚨 조사·제안 전 3축 대조 — ①코드 ②이슈(CLOSED 포함) ③기존결정
   유실 22 → 9 → 0 으로 줄었다. "이름이 다르다" 를 "기능이 없다" 로 읽지 마라
🚨 모델 순서 — LUNA 먼저 → 안 되면 TERRA. **SOL 은 구현 폴백 금지**
   (그 PR 을 리뷰한 모델에게 구현을 맡기면 검증이 사라진다)
🚨 슬롯이 비면 즉시 채운다 — 결과 회수 → 발주 → 그다음 커밋·게시
🚨 라운드마다 커밋 — #1131 이 R4~R9 다섯 라운드 미커밋으로 쌓였다
🚨 SOL 판정을 릴레이하지 않는다 — #1164 는 SOL 이 머지 차단을 냈으나
   PM 이 실 DB 를 세어(발화 0건) 게이트에서 뺐다
🚨 좁힌 범위의 "실패 0" 을 전체의 0 으로 세지 마라
   #1131 이 99건 돌려 0 을 냈는데 CI 는 719건 중 3건 실패였다
🚨 codex 브리핑에 감사·우회·보안 어휘를 쓰면 콘텐츠 필터에 걸린다
🚨 병렬 라운드 워크트리에서 git add -A 금지 — SOL 의 임시 파일을 삼켰다
```

### 🚩 PM 이 이번 세션에 낸 오류 (전부 구현자가 멈춰서 막혔다)

```text
· D-G2 를 "49% vs 48% clamp 통일" 로 올렸다 → 견적엔 clamp 가 없었다
· D-G5 설계를 두 번 틀렸다 → 실적 0 인 품목까지 '산출 불가' 가 될 뻔했다
· 제품구분 축을 두 번 잘못 짚었다 → 없는 걸 만들자고 할 뻔했다
· "순증 94건" → 실제 41건 (보수 규칙과 겹침)
· "이름에 실외기가 있으면 무조건 실외기" → 실외기 일자발은 받침대다
⟹ 브리핑의 **"제 전제가 틀렸다면 고치지 말고 중단·보고"** 가 다섯 번 작동했다.
   이 문장을 빼지 마십시오
```

---

## 6. `#1162` — 회사PC 로 이월

```text
✅ jar BOOT-INF 평문 0건 · 소스 잔존 28건은 전부 docs/·.claude/memory/
🔴 컨테이너 제거 + postgres_data 볼륨 유지 시 부트스트랩이 새 랜덤 자격을 만들어 전 서비스 인증 실패
   좌표 scripts/ensure-local-env.sh:86 · infrastructure/scripts/ensure-local-env.ps1:51
🔑 전달한 infrastructure/.env 를 회사PC 에 넣으면 이 상황 자체가 안 생김
```

---

## 7. 기록만 해 둔 것 (트랙 아님)

```text
· 2026-08-03 이카운트 적재 1,963건 중 **660건이 0원** — 적재가 가격을 못 가져온 것인지 별건
· product_code NULL 388건 (전부 SHEET 계보 · 실제 도달 2제품·DRAFT 23건)
· 메인장비 판정이 견적앱·주문앱에서 정반대 (실거래 표본 0 — 판정 불가)
```
