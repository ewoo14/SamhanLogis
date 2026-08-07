# #1052 R6 SOL fix directive — 실 사용자 전표 발행·배포 완결성

## 1. 판정

머지 차단이다. 집PC의 활성 창고는 8행이지만 `staging.ecount_warehouse_map`은 0행이고,
운영 템플릿은 `STRICT`와 네 코드(`00003`, `2`, `14`, `1`)를 선언한다. 이 상태로 HEAD를
배포하면 실제 estimate-app의 `전표 생성`이 호출하는 `POST /internal/slips/from-estimate`가
동일한 `WarehouseCodeMapper.resolve()`에서 거부된다.

동시에 운영 기동·배포 경로는 slip-service의 비성공 health를 완료 조건으로 기다리지 않는다.
따라서 이 PR이 발견한 실패가 실제 전표를 막아도 배포는 완료로 끝날 수 있어, 이슈의 원래
사용자 증상인 “배포 성공처럼 보인 뒤 전표 발행 실패”가 닫히지 않았다.

실 사용자 화면도 서버의 `{ok:false}`를 RPC 성공 콜백으로 받는다. 현재 두 전표 생성 UI 중
하나는 녹색 완료 표시와 객체 문자열을 보여 줄 수 있고, 다른 하나도 녹색 아이콘과
`전표 생성 오류`를 함께 표시한다. 서버 실패가 사용자 성공으로 보이면 안 된다.

## 2. 실 사용자 도달 사슬

1. 사용자가 estimate-app에서 견적을 작성하고 `전표 생성`을 누른다.
2. `sendOrderFromUi()`가 창고 코드를 `00003` 또는 `2`로 결정한다.
3. estimate-app 서버가 slip-service 직결 `POST /internal/slips/from-estimate`를 호출한다.
4. internal controller와 공개 controller는 같은 `SlipPublishService.publishFromEstimate()`를 호출한다.
5. 서비스는 저장 전에 `WarehouseCodeMapper.resolve(warehouseCode)`를 호출한다.
6. `STRICT`에서 권위 alias가 0행이면 상태는 `NOT_FOUND`, resolve는 `INTERNAL_ERROR`이고 HTTP 500이 된다.
7. 전표는 생성되지 않지만 운영 기동 스크립트는 health를 기다리지 않고 완료 문구를 출력한다.

집PC 읽기 실측:

```text
required_aliases | all_aliases
-----------------+------------
               0 |          0
```

```text
code            | name                  | id
00003           | 초월창고 S18          | 39f50e97-c497-4dc4-b77a-8a369313de85
2               | 상일창고 S18          | 794fd5c0-cac6-4d3c-afad-1508aeb7e373
CS-001          | 거래처 위탁창고       | 11111111-1111-1111-1111-000000000003
HQ-001          | 본사창고              | 11111111-1111-1111-1111-000000000001
QA-1039-CHOWOL  | 초월창고 QA-1039-초월 | e6ce7153-2b8a-4cde-abea-82f79d8fe256
QA-1039-SANGIL  | 상일창고 QA-1039-상일 | d98f13e6-53cf-4f59-9a1c-efaf01f31bec
VH-001          | 1호차 차량재고        | 11111111-1111-1111-1111-000000000002
VR-001          | 가상창고              | 11111111-1111-1111-1111-000000000004
```

정상 발행 실표본은 0건이다. DB 쓰기 금지 때문에 새 전표나 alias를 만들지 않았으므로 정상
성공은 `판정 불가`다. 다만 표본을 만드는 실 관리자 API
`POST /admin/warehouses/imports/ecount`는 존재한다. 현재 raw 디렉터리에는 `.gitkeep`만 있고,
운영 기동·배포 절차에는 이 API를 통한 alias 준비·검증 선행 조건이 없다.

## 3. 반드시 지킬 불변식

1. 운영 release가 사용자 트래픽을 받거나 배포 완료로 판정되기 전에, 실제 발행 계약이 요구하는
   모든 eCount 코드의 권위 alias가 활성 창고와 대응되어야 한다.
2. alias가 없거나 불일치한 새 release는 직전 정상 release를 대체해 사용자의 정상 전표 발행을
   전면 차단해서는 안 된다.
3. 권위 alias 준비는 지원되는 관리자 경로로 수행 가능해야 하며, DB 직접 수정이 배포 전제여서는 안 된다.
4. alias 준비 실패·조회 지연·inventory 장애는 배포 성공으로 보고되어서는 안 된다. 실패 시 사용자는
   이전 정상 release를 계속 이용할 수 있어야 한다.
5. 검증 대상은 실제 발행 계약과 일치해야 한다. 현재 사용자가 생성할 수 없는 코드 하나 때문에
   실제 사용 코드의 정상 발행이나 전체 slip-service 가용성이 영구 차단되어서는 안 된다.
6. `STRICT`의 코드별 fail-closed와 `DEV_SUBSTITUTE`의 개발 전용 정상 동작은 유지한다.
7. 서버가 전표를 만들지 못한 결과는 모든 전표 생성 UI에서 실패로 표시되어야 한다. 성공 아이콘,
   완료 문구, 성공 로그, 중복방지 성공 상태가 남아서는 안 된다.
8. 서버가 전표를 정상 생성한 경우에만 전표번호가 표시되고 성공 후속 동작이 실행되어야 한다.

## 4. 양방향 RED-first

### RED A — 정상 동작을 보존한다

- 실제 사용 가능한 eCount 코드들의 권위 alias가 모두 활성 창고와 대응된 release는 배포 완료가 되고,
  사용자가 estimate-app에서 전표 생성을 누르면 전표번호를 받는다.
- 운영자가 지원 관리자 API로 누락 alias를 준비한 뒤에는 정해진 복구 한계 안에서 release가 정상화되고,
  사용자는 재배포나 DB 직접 수정 없이 전표를 발행할 수 있다.
- `DEV_SUBSTITUTE`에서는 외부 alias 조회 없이 현재 개발용 전표 발행이 계속 동작한다.

### RED B — 결함이 재발하지 않는다

- 권위 alias가 0행인 운영 데이터로 새 release를 올리면 배포 완료로 보고되지 않고, 직전 정상 release의
  사용자 전표 발행은 유지된다.
- 일부 실제 사용 코드가 누락·불일치이거나 alias 조회가 지연·실패해도 새 release가 조용히 단독
  사용자 트래픽을 받지 않는다.
- 서버가 4xx·5xx·네트워크 실패 또는 `{ok:false}`를 반환하면 두 전표 생성 UI 모두 실패 상태를
  표시하며, 녹색 성공 표시·완료 문구·성공 로그·전표번호가 생기지 않는다.
- 서버 실패 뒤 사용자가 입력을 수정하거나 운영 alias가 복구되면 같은 화면에서 다시 시도할 수 있다.

## 5. 범위 경계

- UUID를 템플릿에 추측·하드코딩하거나 운영 mode를 `DEV_SUBSTITUTE`로 바꾸는 것은 허용하지 않는다.
- DB 직접 INSERT/UPDATE, 컨테이너 재빌드·재시작, AWS apply로 검증을 대신하지 않는다.
- 공개 `/api/v1/slips/from-estimate`의 게이트웨이 500도 실측했지만, 현재 estimate-app의 실제 호출은
  직결 `/internal/slips/from-estimate`이므로 이 지시서의 머지 차단 근거에는 포함하지 않는다.
- 테스트 강도·mock 구성·문서 표현은 본 지시서의 결함으로 세지 않는다.

