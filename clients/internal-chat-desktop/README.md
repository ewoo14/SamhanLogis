# Samhan Internal Chat Desktop

S2 앱 셸입니다. 본체(`clients/desktop`)와 독립 실행되며, 창을 닫으면 트레이에 상주합니다.

현재 범위에는 로그인 연계, 접속 상태, 부재중, 알림, 파일 전송, 참조번호, 이모티콘, 서버 API와 DB가 포함되지 않습니다.

## 확인

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

Windows installer/portable 빌드는 명시적인 `VITE_APP_VERSION=YYYY/MM/DD-N`과 함께 `npm run build:win`을 실행합니다. S2에서는 코드서명 자격과 배포 피드를 연결하지 않습니다.
