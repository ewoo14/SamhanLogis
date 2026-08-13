# #999 재고 인스턴스 — 시리얼키·QR 스캔 입출고·2축 분리 정찰

- 측정일: 2026-08-12 (Asia/Seoul)
- 작업 위치: `C:\dev\Samhan-Public` main 워크트리
- 조사 계약: 구현·마이그레이션·spec 작성 없음, 공유 Docker 스택 읽기 전용, 로그인 없음, git 명령 없음
- 기준: 코드 / 이슈(CLOSED 포함) / `docs/dev-reports/` 개발책임자 결정 3축 대조

## 1차 측정 — PR #1128·Issue #999 원문

### 실측 명령과 출력 원문

```powershell
gh pr view 1128 --json number,title,state,headRefName,baseRefName,body,url,files,comments,reviews
```

```text
{"baseRefName":"main","body":"연관 Issue: #999\n\n## 트랙 개설 — 착수 전 확인\n\n2026-07-29 등록.\n\n### 🚨 이 트랙은 오늘 밤 발견과 직결됩니다\n`#1113` 진단에서 **재고 201행이 참조하는 product UUID 101개 중 100개가 활성 카탈로그에 없다**는 것이 나왔습니다(삭제된 행과는 정확히 일치). 재고 인스턴스를 새로 설계하기 전에 **기존 재고 데이터의 상태**를 먼저 알아야 합니다.\n\n### 정찰이 실측할 것\n1. 현재 `stock_balances`·`stock_instances` 구조와 실 행 수\n2. **노출용 시리얼키** — UUID 는 화면 노출 금지이므로 사용자 노출 코드를 별도로 정해야 합니다(`feedback_uuid_no_user_visibility`: 엔티티마다 노출 코드를 정한다)\n3. \"재고상황/품질 2축 분리\" 가 무엇을 가르는지 이슈 본문과 레거시에서 확정\n4. QR 스캔 — 모바일 클라이언트의 기존 스캔 경로가 있는가\n\n### 🚨 업무 판단\n시리얼키 발급 규칙 · 품질 축의 값 집합 · 기존 재고와의 마이그레이션 — **추측 금지**","comments":[{"id":"IC_kwDOSRV6Us8AAAABN_jPyQ","author":{"login":"ewoo14"},"authorAssociation":"OWNER","body":"## S1 정찰 완료 — 🚨 **재고 조회가 전체 404 입니다**\n\n```text\n실제 GET /inventory/balances   →   HTTP 404 전체 실패\n```\n\n**재고 인스턴스를 새로 설계하기 전에 이것부터입니다.** 지금 재고 화면이 아예 안 뜹니다.\n\n### 기존 재고 데이터 상태 — `#1113` 관측 재측정\n\n```text\nstock_balances        202행 · product UUID 102개\n  활성 product 연결      2개\n  삭제 product 연결    100개\n  활성 카탈로그 누락   100개      ← #1113 시점과 동일\nstock_instances        20행 · 그중 삭제 product 참조 1개\n```\n\n🔑 **오늘 머지된 `#1133`(품목 상태)·`#1154`(기초거래처) 이후에도 핵심 결함 수가 변하지 않았습니다.** 그 둘이 원인이 아니라는 뜻입니다.\n\n### 다음 한 수 — 순서가 바뀝니다\n\n```text\n1  /inventory/balances 404 의 원인 확정 (진단)\n2  삭제 product 참조 100건을 어떻게 할 것인가  ← 개발책임자 판단\n3  그다음에 재고 인스턴스 설계\n```\n\n🚨 **2번은 `#1051`(전표↔품목 연결 끊김) 트랙과 같은 뿌리**입니다 — 오늘 `#1157` 로 열었습니다. 같은 데이터를 두 트랙이 만지지 않도록 **끊긴 참조 처리 방침은 `#1157` 에서 한 번만** 정하겠습니다.\n\n### 못 한 것\n\n브라우저 미연결로 PNG 캡처 없음. **실제 API 응답과 FE 오류 분기로** 전체 조회 오류임을 확인했습니다.","createdAt":"2026-08-09T21:50:37Z","includesCreatedEdit":false,"isMinimized":false,"minimizedReason":"","reactionGroups":[],"url":"https://github.com/ewoo14/Samhan-Public/pull/1128#issuecomment-5234020297","viewerDidAuthor":true}],"files":[{"path":"docs/dev-reports/2026-08-10-1128-s1-recon.md","additions":288,"deletions":0,"changeType":"ADDED"},{"path":"docs/dev-reports/track-open-999.md","additions":17,"deletions":0,"changeType":"ADDED"}],"headRefName":"feat/999-stock-instance-serial-qr","number":1128,"reviews":[],"state":"OPEN","title":"[FEAT] #999 재고 인스턴스 — 시리얼키·QR 스캔 입출고 · 2축 분리 (트랙 개설)","url":"https://github.com/ewoo14/Samhan-Public/pull/1128"}
```

```powershell
gh issue view 999 --json number,title,state,body,url,labels,comments
```

```text
{"body":"## 배경\n\n2026-07-30 개발책임자 결정입니다.\n\n> *\"재고 인스턴스의 경우 **미노출 UUID 서버키와 별도로 노출용 시리얼키(자체 시리얼번호 체계)** 도 필요할 것 같아.*\n> *부자재를 제외한 **실외기, 실내기, 판넬은 QR을 붙여서 QR코드 스캔을 통해 입출고를 관리**하는 방향으로 전환할거야.*\n> *그리고 **재고의 상태도 기록**이 필요해. 예를 들어, 정상, 중고, 파손, 재포장, 박스불량으로 구분할 수 있으면 좋겠어. 이를 **창고에서 입출고 시 분류**할 수 있는거지.\"*\n>\n> *\"UUID는 미노출, 시리얼 키는 노출로 따로 분리하도록 하자.\"*\n> *\"재고상황과 품질로 구분하도록 하자.\"*\n\n## 이미 있는 것 (집PC 실측)\n\n착수 전에 확인했습니다. **인스턴스 모델은 이미 상당히 있습니다.**\n\n```text\ninventory_db.stock_instances\n  id(UUID PK) · product_id · product_code · warehouse_id · status\n  inbound_type · received_at · unit_cost\n  inbound_slip_no · outbound_partner_code · outbound_slip_no · outbound_at\n  + BaseEntity 7 audit + soft delete\n\nStockInstanceStatus enum   AVAILABLE(가용) · RESERVED(예약) · SHIPPED\nproducts.inventory_qty_mgmt  관리방식(개별 시리얼 vs 묶음) 구분 컬럼\n```\n\n기존 설계는 [[project_serial_inventory_model]] 에 박제돼 있습니다 — FIFO 출고(`received_at ASC`)·역FIFO 회수(반품/회차)·슬라이스 S1~S4 분해까지.\n\n## 🚩 그런데 기존 설계와 이번 결정이 충돌합니다\n\n박제된 메모리에 이렇게 적혀 있습니다.\n\n> **UUID = 품목 시리얼 키(PK)**, 개별 instance 식별자\n\n⟹ **UUID 를 노출 시리얼키로 쓰려던 설계**입니다. 2026-07-30 결정(*\"UUID는 미노출, 시리얼 키는 노출로 따로 분리\"*)과 정면으로 어긋납니다. 이 이슈가 그 정정을 포함합니다.\n\n## 해야 할 것\n\n### ① 노출용 시리얼키 신설\n- `stock_instances` 에 **자체 시리얼번호 체계** 컬럼 추가. `id(UUID)` 는 **미노출 서버키로 유지**\n- 체계(자릿수·접두사·발급 규칙·중복 방지)는 정찰 후 확정\n- 사용자 화면·QR·문서에는 **시리얼키만** 노출\n\n### ② 상태를 두 축으로 분리\n현재 `status` 는 **재고상황**(가용·예약·출고) 축입니다. **품질** 축을 별도 컬럼으로 둡니다.\n\n| 축 | 값 |\n|---|---|\n| **재고상황** | `AVAILABLE` · `RESERVED` · `SHIPPED` (기존 유지) |\n| **품질** | 정상 · 중고 · 파손 · 재포장 · 박스불량 |\n\n🔑 한 컬럼에 섞으면 *\"파손인데 가용\"* 같은 실제 조합을 표현할 수 없습니다.\n\n### ③ QR 스캔 입출고\n- 대상: **실외기 · 실내기 · 판넬** (부자재 제외)\n- QR 에 담을 값은 **시리얼키**(UUID 아님)\n- 창고에서 **입출고 시 품질을 분류**할 수 있어야 함\n- 대상 판정을 `products.inventory_qty_mgmt` 로 할 수 있는지, 아니면 별도 구분이 필요한지 정찰\n\n## 불변식\n\n1. **UUID 는 화면·QR·문서·외부 연동에 노출되지 않는다.** 노출 식별자는 시리얼키다\n2. **재고상황과 품질은 독립적으로 기록·조회된다** — 한쪽이 다른 쪽을 가리지 않는다\n3. **기존 재고 인스턴스가 깨지면 안 된다** — 시리얼키 신설 시 기존 행의 발급 방식을 정한다\n4. 부자재는 개별 시리얼 대상이 아니다 — 묶음 관리를 유지한다\n5. 입출고 시 품질을 **기록하지 않고 넘어갈 수 있으면 안 된다** — 기본값이 무엇인지 명시한다\n6. 신규 컬럼·테이블은 BaseEntity 7 audit + Soft Delete 규약을 따른다\n\n## 선행 의존\n\n⚠️ **#984(순번코드 → 모델명 = 품목코드 전환)** 와 맞물립니다. `stock_instances.product_code` 가 현재 `010001` 형태이고 전환 후 모델명이 되므로, **키 이관이 이 이슈의 QR/스캔 조회에 직접 영향**을 줍니다. 순서를 정해야 합니다.\n\n## 참고\n\n- [[project_serial_inventory_model]] — 기존 설계(정정 필요)\n- [[feedback_uuid_no_user_visibility]] — *\"엔티티마다 사용자 노출 코드를 정한다\"*\n- PR #984 코멘트 — 품목코드 전환 결정 기록\n","comments":[{"id":"IC_kwDOSRV6Us8AAAABNhERRw","author":{"login":"ewoo14"},"authorAssociation":"OWNER","body":"## 📌 개발책임자 결정 (2026-08-06) — 시리얼키는 **창고 방식 그대로 (접두사만 다르게)**\n\n> 선택: *\"창고 방식 그대로 (접두사만 다르게)\"*\n\n### 사내 선례를 그대로 씁니다\n\n```java\n// WarehouseService.java:88-91\n'WH-' + 6자\ncharset = \"23456789ABCDEFGHJKMNPQRSTUVWXYZ\"   // 0 · 1 · O · I · L 제외\n```\n\n⟹ 재고 인스턴스는 **접두사만 다르게** 하고 자릿수·charset·발급 방식은 동일합니다.\n\n🔑 `0/1/O/I/L` 제외는 **사람이 읽고 옮겨 적을 때 헷갈리는 문자를 뺀 것**입니다. 시리얼키는 라벨·QR 로 현장에서 육안 확인되므로 이 성질이 그대로 필요합니다.\n\n### 아직 남은 결정 2건\n\n이 이슈에는 개발책임자 확인 항목이 셋이었고 하나만 확정됐습니다.\n\n```text\n✅ 시리얼키 체계\n⏸ 기존 stock_instances 행에 시리얼키를 **소급 발급**할 규칙 (불변식 3)\n⏸ 품질 미기록 금지의 **기본값** (불변식 5) — '정상' 기본값인가 입력 강제인가\n```\n\n착수 전 이 둘을 다시 올리겠습니다. 특히 **소급 발급**은 기존 행 수를 먼저 세야 범위가 정해집니다.\n","createdAt":"2026-08-06T08:06:52Z","includesCreatedEdit":false,"isMinimized":false,"minimizedReason":"","reactionGroups":[],"url":"https://github.com/ewoo14/Samhan-Public/issues/999#issuecomment-5202055495","viewerDidAuthor":true}],"labels":[],"number":999,"state":"OPEN","title":"[FEAT] 재고 인스턴스 — 노출용 시리얼키 · QR 스캔 입출고 · 재고상황/품질 2축 분리","url":"https://github.com/ewoo14/Samhan-Public/issues/999"}
```

### 1차 판정

- 현재 모델은 “수량만”이 아니다. `stock_balances` 수량 잔고 축과 `stock_instances` 개체 축이 이미 공존한다. 실제 코드·DDL·DB 행 수로 후속 확정한다.
- “2축 분리”는 서버 UUID/노출 시리얼키 분리가 아니라, **재고상황(status)과 품질(quality)의 분리**다. UUID/시리얼키 분리는 별도의 식별자 불변식이다.
- 품질 값 집합은 이슈 본문에 이미 결정돼 있다: 정상·중고·파손·재포장·박스불량.
- 시리얼키 규칙도 2026-08-06 결정으로 이미 확정됐다: 창고 코드와 같은 6자 charset/발급 방식, 접두사만 변경. 남은 결정은 기존 20행 소급 발급 방식과 품질 기본값/입력 강제 방식이다.
- PR 코멘트의 행 수는 과거 관측(2026-08-09)이므로 최종 수치로 사용하지 않고 이 PC DB에서 재측정한다.

