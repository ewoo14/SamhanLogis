# #1052 R8 SOL fix directive — R7 배포·readiness 재수렴

## 1. 판정과 좌표

머지 차단이다. R6의 UI 성공 판정은 닫혔지만, R7은 직전 지시서의 배포 불변식 2·4·5를
충족하지 못한다.

검토 좌표:

- `infrastructure/terraform/templates/user_data.sh:347-354`
- `infrastructure/docker-compose.prod.yml:376-433`
- `infrastructure/scripts/phase11-deploy.ps1:328-429`
- `services/slip-service/src/main/resources/application.yml:189-215`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/WarehouseCodeMapper.java:77-79,150-161`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/WarehouseMappingValidationService.java:48-73,150-167`
- `clients/web/estimate-app/views/index.ejs:1655,10547-10568`
- `clients/web/estimate-app/lib/code.js:2240-2282`

## 2. 도달 결함

### D1 — unhealthy 새 release가 직전 정상 release를 대체한다

운영자가 동일 Compose 프로젝트에 새 이미지를 배포하면 동일 서비스·컨테이너가 교체된 뒤
새 release의 readiness를 기다린다. 새 release가 alias 누락·불일치 또는 inventory 장애로
unhealthy가 되면 배포 성공은 보고되지 않지만, 사용자가 계속 이용할 직전 정상 slip-service도
남아 있지 않다. `--wait-timeout`도 지정되지 않아 배포 명령의 대기 상한이 없다.

### D2 — 최초 운영 기동의 alias 준비 순서가 순환 대기다

최초 EC2 기동은 `user_data.sh`의 `docker compose ... up -d --pull always --wait`를 먼저 실행한다.
운영 DB의 권위 alias가 비어 있으면 slip-service는 unhealthy이고 이 단계는 완료되지 않는다.
지원 관리자 import는 그 뒤 별도로 실행하는 `phase11-deploy.ps1 -Action healthcheck`에만 있으므로,
표준 기동 절차 자체에는 `--wait` 전에 alias를 준비하는 도달 경로가 없다.

또한 저장소 raw 디렉터리는 `.gitkeep`만 있고, 기존 사용자 가이드는 6종 시트가 든 `.xlsx`
취득을 안내하지만 새 옵션은 정확한 7열 CSV와 실행 위치·접속 URL·권한 있는 계정 UUID를
요구한다. 운영자가 표준 안내만 따라서는 준비 입력과 실행 지점을 확정할 수 없다.

### D3 — 실제 사용자 발행 계약 밖의 코드가 전체 readiness를 차단한다

estimate-app의 사용자 선택은 `00003`, 자동 분기는 `00003` 또는 `2`만 만든다. 그러나 운영
설정은 값이 빈 `14`와 `1`도 map key로 등록하고, readiness는 네 key가 모두 `VERIFIED`여야
`ACCEPTING_TRAFFIC`이 된다. 실제 사용 코드 `00003/2`가 모두 정상이어도 미사용 `14/1` 중
하나가 없으면 전체 slip-service가 unhealthy로 남아 정상 전표 발행까지 막힌다.

## 3. 반드시 지킬 불변식

1. 새 release가 alias 누락·불일치, inventory 장애, 설정 오류 또는 readiness 시간 초과로
   정상 판정을 받지 못해도 직전 정상 release의 사용자 전표 발행은 중단되지 않아야 한다.
2. 배포 실패는 유한한 시간 안에 비성공으로 종료되어야 하며, 성공 문구나 성공 종료 상태를
   남겨서는 안 된다.
3. 최초 운영 기동과 후속 배포 모두 권위 alias 준비·검증을 새 slip-service의 트래픽 수락보다
   먼저 완료할 수 있어야 한다. 별도 비공개 요령, DB 직접 수정, 교착된 배포의 두 번째 셸 개입이
   필수 전제여서는 안 된다.
4. 운영자가 지원 관리자 경로를 사용할 때 입력 원본의 취득 위치, 허용 형식·필수 열, 실행 위치,
   인증된 관리자 식별, 성공 확인 기준을 하나의 실행 가능한 절차로 알 수 있어야 한다.
5. 전체 service readiness를 결정하는 코드는 현재 실 사용자 발행 계약에서 생성 가능한 코드와
   일치해야 한다. 계약 밖 코드의 부재가 정상 사용 코드의 발행을 차단해서는 안 된다.
6. 실제 발행 요청에 들어온 코드는 코드별로 권위 alias가 검증된 경우에만 해석되어야 한다.
   readiness 범위를 줄이더라도 미검증 요청 코드를 fail-open해서는 안 된다.
7. `STRICT` 운영 fail-closed와 `DEV_SUBSTITUTE` 개발 전용 정상 동작은 유지한다.
8. R6의 UI 계약은 유지한다. `{ok:true, slipNo}`만 성공이며 그 밖의 응답·예외는 두 UI 모두
   실패·재시도 가능 상태여야 한다.

## 4. 양방향 RED-first

### RED A — 정상 경로와 반대급부를 보존한다

- 권위 alias가 준비된 상태에서 새 release가 정상화되면 배포는 유한 시간 안에 성공하고 새
  release가 사용자 트래픽을 받는다. 직전 release를 영구 고정해서 정상 승격을 막으면 안 된다.
- 실제 사용자 코드 `00003/2`가 모두 검증된 운영 환경은 계약 밖 코드 `14/1`의 부재만으로
  unhealthy가 되지 않으며, 사용자는 전표번호를 받는다.
- 운영자가 공식 절차로 원본을 취득하고 지원 관리자 경로로 준비하면 DB 직접 수정이나 서비스
  코드 변경 없이 readiness가 정해진 재검증 한계 안에 정상화된다.
- `DEV_SUBSTITUTE`에서는 외부 alias 조회 없이 기존 개발 전표 발행이 계속 동작한다.
- 서버의 정상 `{ok:true, slipNo}` 응답은 두 UI에서 성공으로 표시되고 성공 후속 동작이 실행된다.

### RED B — 결함이 재발하지 않는다

- 직전 정상 release가 사용자 전표를 발행 중인 상태에서 새 release의 alias 검증을 실패시키면,
  새 release는 트래픽을 받거나 성공으로 보고되지 않고 직전 정상 release의 발행은 계속된다.
- alias 조회가 응답하지 않거나 inventory가 장애인 경우 배포 작업은 유한한 실패로 끝나며 직전
  정상 release를 잃지 않는다.
- 권위 alias가 0행인 최초 운영 데이터에서도 표준 절차가 순환 대기하지 않고, 운영자가 지원
  관리자 경로로 준비한 뒤 같은 절차를 완료할 수 있다.
- `00003/2`만 실 사용자 발행 계약인 상태에서 `14/1` alias를 누락시켜도 정상 코드의 readiness와
  발행은 유지된다. 반대로 사용자가 미검증 코드를 실제 요청에 넣으면 그 요청은 거부된다.
- 4xx·5xx·네트워크 끊김·15초 downstream timeout·`{ok:false}`·200 무전표·RPC body 파손은
  두 UI 모두 실패 상태가 되고 성공 아이콘·완료 문구·성공 로그·중복방지 성공 상태가 남지 않는다.

## 5. 범위 밖

- 구현 수단, 배포 토폴로지, release 전환 기술은 이 지시서가 정하지 않는다.
- 운영 AWS는 아직 없으므로 실제 AWS/ALB/EC2 트래픽 전환은 이번 라운드에서 실행하지 않았다.
- 라이브 컨테이너에는 어떤 쓰기 요청도 보내지 않았다. DB는 SELECT만 수행했다.
- 테스트 강도, mock 구성, 문서 문체는 결함으로 세지 않는다.
- estimate-app 외 다른 클라이언트가 미래에 추가할 warehouseCode 정책은 현재 계약에 포함하지 않는다.

## 6. 커밋 전 좁은 검증 명령

```powershell
.\gradlew.bat :services:slip-service:test `
  --tests "com.samhanair.logis.slip.publish.WarehouseMappingValidationServiceTest" `
  --tests "com.samhanair.logis.slip.publish.WarehouseReadinessLifecycleTest" `
  --tests "com.samhanair.logis.slip.config.WarehouseBootPathConfigurationTest" `
  --no-daemon --rerun-tasks

Set-Location clients/web/estimate-app
npx jest test/code.test.js --runInBand
```

