# nginx healthcheck IPv6 오판 수정 보고서

## 원인 및 재현

PM 실측과 현재 실행 중인 컨테이너에서 같은 원인을 확인했다.

```text
docker inspect samhan-nginx --format '{{json .Config.Healthcheck}}'
{"Test":["CMD-SHELL","wget -qO- http://localhost:80/healthz || exit 1"],"Interval":15000000000,"Timeout":5000000000,"Retries":10}

docker exec samhan-nginx sh -c "getent hosts localhost; netstat -tln"
::1               localhost  localhost
tcp        0      0 0.0.0.0:80              0.0.0.0:*     LISTEN
tcp        0      0 127.0.0.11:44809        0.0.0.0:*     LISTEN
```

즉 `localhost`가 컨테이너 안에서 `::1`로 해석되지만 nginx는 IPv4의
`0.0.0.0:80`에서만 리슨한다. BusyBox `wget`은 이 경우 IPv4로 폴백하지
않는다.

수정 전 명령의 원문도 재현했다.

```text
docker exec samhan-nginx sh -c "wget -qO- http://localhost:80/healthz"
wget: can't connect to remote host: Connection refused

docker exec samhan-nginx sh -c "wget -qO- http://127.0.0.1:80/healthz"
ok
```

## prometheus · grafana 비교 확인

둘 다 `wget` healthcheck를 사용하지만 IPv6에서 리슨하므로 이 결함이 없다.

```text
docker inspect samhan-prometheus --format '{{.State.Health.Status}} · {{json .Config.Healthcheck}}'
healthy · {"Test":["CMD-SHELL","wget -qO- http://localhost:9090/-/healthy || exit 1"],"Interval":15000000000,"Timeout":5000000000,"Retries":10}

docker exec samhan-prometheus sh -c "netstat -tln; wget -qO- http://localhost:9090/-/healthy"
tcp        0      0 127.0.0.11:32863        0.0.0.0:*     LISTEN
tcp        0      0 :::9090                 :::*          LISTEN
Prometheus Server is Healthy.

docker inspect samhan-grafana --format '{{.State.Health.Status}} · {{json .Config.Healthcheck}}'
healthy · {"Test":["CMD-SHELL","wget -qO- http://localhost:3000/api/health || exit 1"],"Interval":15000000000,"Timeout":5000000000,"Retries":10}

docker exec samhan-grafana sh -c "getent hosts localhost; netstat -tln; wget -qO- http://localhost:3000/api/health"
::1               localhost  localhost
tcp        0      0 127.0.0.11:44541        0.0.0.0:*     LISTEN
tcp        0      0 :::3000                 :::*          LISTEN
{
  "database": "ok",
  "version": "11.3.1",
  "commit": "64b556c137a1d9bcacd19ccb16c4cf138c78ca40"
}
```

따라서 prometheus와 grafana는 수정하지 않았다.

## 수정 범위

`infrastructure/docker-compose.yml`의 nginx healthcheck 대상만
`localhost`에서 `127.0.0.1`로 변경했다. nginx의 `nginx.conf`, `listen`,
라우팅, 서빙 설정은 변경하지 않았다. `infrastructure/docker-compose.prod.yml`
에는 nginx service/healthcheck가 없어 변경 대상이 없었다.

`|| exit 1`은 유지하여 요청 실패 시 healthcheck가 실패한다.

## 성공 및 진짜 고장 감지 증명

컨테이너를 재생성하지 않고 현재 컨테이너에서 수정된 명령과 동일한 요청을
직접 실행했다.

```text
docker exec samhan-nginx sh -c "wget -qO- http://127.0.0.1:80/healthz || exit 1"
ok
```

같은 구조에서 존재하지 않는 경로를 사용한 실패 증명이다.

```text
docker exec samhan-nginx sh -c "wget -qO- http://127.0.0.1:80/does-not-exist || exit 1"
wget: server returned error: HTTP/1.1 404 Not Found
```

응답 본문/상태가 성공 조건이 아니므로 `wget` 실패 뒤 `|| exit 1`이 실행된다.
`|| true`나 이에 준하는 우회는 추가하지 않았다.

## 검증

```text
cd infrastructure
docker compose -f docker-compose.yml config
Exit code: 0
```

## 신규 파일

- `docs/dev-reports/2026-08-09-nginx-healthcheck-ipv6.md`
