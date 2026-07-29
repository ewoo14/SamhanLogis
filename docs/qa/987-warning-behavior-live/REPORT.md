# PR #987 경고 거동 라이브 QA

## 0. 실제와 주입의 구분

- 실제: 지정된 `http://localhost:5202/` 주문서가 `http://localhost:8080/api/v1/partner-orders/bootstrap`의 실서버 응답을 받아 렌더링했다.
- 주입: Playwright 응답 가로채기에서 실응답 JSON을 먼저 받은 뒤, 아래 지정 모델 행만 배열에서 제거해 전달했다. 응답 전체를 지어내지 않았다.
- 인증: 저장소 QA 기록의 실 거래처 UI 로그인(`2118712345` / PIN `1234`)만 수행했다. 수량 입력 및 화면 확인까지만 실행했으며 주문 저장·미리보기·전송은 실행하지 않았다.

- 캡처 viewport: 1440x900

## 1. 화면별 결과

### qa-01-unused-pump-no-warning

- 시나리오: 상업멀티 미사용 펌프 누락
- 기대: 경고 없음
- 경고 유무: 없음
- 예상 대비: 일치
- 경고 영역 hidden: true
- 경고 영역 textContent 전문: (빈 문자열)
- 수량 입력 직후 경고 textContent: (빈 문자열)
- 유연호스 제외 checked: false
- AM016MN1PBH2 수량: 
- 화면 행 수: 331

가로챈 제거 내역:
- commercialMulti의 ADP-N047SNK1D: 원본 408건 중 1건 제거 → 전달 407건
  - 실응답 행: model=ADP-N047SNK1D, name=DUCT 드레인펌프(고정압 29kW이상), disp=DUCT 드레인펌프(고정압 29kW이상)

콘솔 에러: `Failed to load resource: the server responded with a status of 404 (Not Found)`; `Failed to load resource: the server responded with a status of 400 (Bad Request)`
페이지 에러: (없음)
요청 실패: (없음)
4xx/5xx: `GET http://localhost:8080/app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F29-1 404`; `PATCH http://localhost:8080/api/v1/auth/partner-tutorial 400`

### qa-02-missing-hose-warning

- 시나리오: 상업멀티 1WAY 호스 양쪽 누락
- 기대: FH-LFHLF가 포함된 경고
- 경고 유무: 없음
- 예상 대비: 불일치 — 기대=경고 있음, 실제=경고 없음
- 경고 영역 hidden: true
- 경고 영역 textContent 전문: (빈 문자열)
- 수량 입력 직후 경고 textContent: (빈 문자열)
- 유연호스 제외 checked: false
- AM016MN1PBH2 수량: 1
- 화면 행 수: 1

가로챈 제거 내역:
- homemulti의 FH-LFHLF: 원본 120건 중 1건 제거 → 전달 119건
  - 실응답 행: model=FH-LFHLF, name=유연호스 L형 1WAY, disp=유연호스 L형 1WAY
- commercialMulti의 FH-LFHLF: 원본 408건 중 1건 제거 → 전달 407건
  - 실응답 행: model=FH-LFHLF, name=유연호스 L형 1WAY, disp=유연호스 L형 1WAY

콘솔 에러: `Failed to load resource: the server responded with a status of 404 (Not Found)`; `Failed to load resource: the server responded with a status of 400 (Bad Request)`
페이지 에러: (없음)
요청 실패: (없음)
4xx/5xx: `GET http://localhost:8080/app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F29-1 404`; `PATCH http://localhost:8080/api/v1/auth/partner-tutorial 400`

### qa-03-normal-no-warning

- 시나리오: 정상 카탈로그 동일 주문
- 기대: 경고 없음
- 경고 유무: 없음
- 예상 대비: 일치
- 경고 영역 hidden: true
- 경고 영역 textContent 전문: (빈 문자열)
- 수량 입력 직후 경고 textContent: (빈 문자열)
- 유연호스 제외 checked: false
- AM016MN1PBH2 수량: 1
- 화면 행 수: 1

가로챈 제거 내역:
- 없음 (정상 실응답 그대로 전달)

콘솔 에러: `Failed to load resource: the server responded with a status of 404 (Not Found)`; `Failed to load resource: the server responded with a status of 400 (Bad Request)`
페이지 에러: (없음)
요청 실패: (없음)
4xx/5xx: `GET http://localhost:8080/app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F29-1 404`; `PATCH http://localhost:8080/api/v1/auth/partner-tutorial 400`

## 2. 저장 파일

- [qa-01-unused-pump-no-warning.png](./qa-01-unused-pump-no-warning.png)
- [qa-02-missing-hose-warning.png](./qa-02-missing-hose-warning.png)
- [qa-03-normal-no-warning.png](./qa-03-normal-no-warning.png)
- `REPORT.md`

## 3. 예상과 달랐던 점

- 각 시나리오의 실제 결과를 위 표에 그대로 기록했다. 별도 억지 우회나 합성 증거는 사용하지 않았다.

## 4. 초기 R2 단일 제거 관측 — 최종 판정에서 폐기

- 이번 R2도 실서버 bootstrap 응답을 Playwright에서 받은 뒤 지정 모델 행만 제거했다. 응답 전체를 합성하지 않았다.
- 중간 결과: **B처럼 보였으나 최종 판정으로 대체**
- 사유: `FH-LFHLF`만 제거한 상태에서는 남은 `FH-LFHIF`가 `pickHoseModel('1way')`의 fallback 후보로 선택되었다. 따라서 이 실행은 필요한 호스가 완전히 없는 상태가 아니었다.

### 4.1 정상 실응답에서 읽은 값

- window.SHOW_I_HOSE: `false` (raw=false)
- pickHoseModel('1way'): `FH-LFHLF`
- AM016MN1PBH2 원문 name: `실내기 1WAY(소형) 미내장 4평형`
- AM016MN1PBH2 앱 분류: isCommIndoorRow=`true`, commIndoorKind=`1way`
- 수량 1 입력 후 n1w: `1`

### 4.2 실제 선택 호스 제거 재현

- 제거한 실제 호스 모델: `FH-LFHLF`
- 제거 범위: homemulti 120→119, commercialMulti 408→407
- 제거 후 pickHoseModel('1way'): `FH-LFHIF`
- 제거 후 SHOW_I_HOSE: `false`
- 제거 후 n1w: `1`
- 유연호스 제외: `false`
- 재현 경고 hidden: `true`
- 재현 경고 textContent 전문: `(빈 문자열)`

### 4.3 want 관련 런타임 Map 계측

아래는 수량 입력 직후 `Map.prototype.set`을 계측해 호스/대상 모델에 관련된 Map만 덤프한 값이다. `want`에 해당하는 Map은 AM016MN1PBH2가 아닌 호스 모델을 값 1로 보유하는 Map이다.

```json
{
  "baseline": [
    {
      "id": 3,
      "size": 127,
      "relevantEntries": [
        [
          "FH-LFHLF",
          1
        ],
        [
          "FH-LFHLN",
          0
        ],
        [
          "FH-LFHIF",
          0
        ],
        [
          "AM016MN1PBH2",
          1
        ]
      ],
      "relevantSetEvents": [
        {
          "key": "AM016MN1PBH2",
          "value": 1,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at HTMLInputElement.<anonymous> (http://localhost:5202/:3041:15)"
          ]
        },
        {
          "key": "FH-LFHLF",
          "value": 1,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at http://localhost:5202/:5861:13",
            "    at Map.forEach (<anonymous>)",
            "    at recomputeCommDerived (http://localhost:5202/:5856:8)"
          ]
        },
        {
          "key": "FH-LFHLN",
          "value": 0,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at http://localhost:5202/:5861:13",
            "    at Map.forEach (<anonymous>)",
            "    at recomputeCommDerived (http://localhost:5202/:5856:8)"
          ]
        },
        {
          "key": "FH-LFHIF",
          "value": 0,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at http://localhost:5202/:5861:13",
            "    at Map.forEach (<anonymous>)",
            "    at recomputeCommDerived (http://localhost:5202/:5856:8)"
          ]
        }
      ]
    },
    {
      "id": 4,
      "size": 126,
      "relevantEntries": [
        [
          "FH-LFHLF",
          1
        ],
        [
          "FH-LFHLN",
          0
        ],
        [
          "FH-LFHIF",
          0
        ]
      ],
      "relevantSetEvents": [
        {
          "key": "FH-LFHLF",
          "value": 0,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at http://localhost:5202/:5699:99",
            "    at Array.forEach (<anonymous>)",
            "    at recomputeCommDerived (http://localhost:5202/:5699:12)"
          ]
        },
        {
          "key": "FH-LFHLN",
          "value": 0,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at http://localhost:5202/:5699:99",
            "    at Array.forEach (<anonymous>)",
            "    at recomputeCommDerived (http://localhost:5202/:5699:12)"
          ]
        },
        {
          "key": "FH-LFHIF",
          "value": 0,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at http://localhost:5202/:5699:99",
            "    at Array.forEach (<anonymous>)",
            "    at recomputeCommDerived (http://localhost:5202/:5699:12)"
          ]
        },
        {
          "key": "FH-LFHLF",
          "value": 1,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at recomputeCommDerived (http://localhost:5202/:5725:20)",
            "    at HTMLInputElement.<anonymous> (http://localhost:5202/:3093:9)"
          ]
        },
        {
          "key": "FH-LFHLN",
          "value": 0,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at recomputeCommDerived (http://localhost:5202/:5726:20)",
            "    at HTMLInputElement.<anonymous> (http://localhost:5202/:3093:9)"
          ]
        }
      ]
    }
  ],
  "missing": [
    {
      "id": 3,
      "size": 126,
      "relevantEntries": [
        [
          "FH-LFHIF",
          1
        ],
        [
          "AM016MN1PBH2",
          1
        ]
      ],
      "relevantSetEvents": [
        {
          "key": "AM016MN1PBH2",
          "value": 1,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at HTMLInputElement.<anonymous> (http://localhost:5202/:3041:15)"
          ]
        },
        {
          "key": "FH-LFHIF",
          "value": 1,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at http://localhost:5202/:5861:13",
            "    at Map.forEach (<anonymous>)",
            "    at recomputeCommDerived (http://localhost:5202/:5856:8)"
          ]
        }
      ]
    },
    {
      "id": 4,
      "size": 125,
      "relevantEntries": [
        [
          "FH-LFHIF",
          1
        ]
      ],
      "relevantSetEvents": [
        {
          "key": "FH-LFHIF",
          "value": 0,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at http://localhost:5202/:5699:99",
            "    at Array.forEach (<anonymous>)",
            "    at recomputeCommDerived (http://localhost:5202/:5699:12)"
          ]
        },
        {
          "key": "FH-LFHIF",
          "value": 1,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at recomputeCommDerived (http://localhost:5202/:5725:20)",
            "    at HTMLInputElement.<anonymous> (http://localhost:5202/:3093:9)"
          ]
        }
      ]
    }
  ]
}
```

### 4.4 HTTP/콘솔 부수 관측

- `PATCH /auth/partner-tutorial 400`은 요청대로 PR #992 범위 밖으로 판정에서 제외했다.
- missing console errors: `Failed to load resource: the server responded with a status of 404 (Not Found)`; `Failed to load resource: the server responded with a status of 400 (Bad Request)`
- missing 4xx/5xx: `GET http://localhost:8080/app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F29-1 404`; `PATCH http://localhost:8080/api/v1/auth/partner-tutorial 400`

### 4.5 갱신 파일

- [qa-02-missing-hose-warning.png](./qa-02-missing-hose-warning.png) — R2 실제 선택 호스 기준 fresh 캡처
- [qa-02-missing-hose-warning-r2.png](./qa-02-missing-hose-warning-r2.png) — 동일 캡처 원본
- REPORT.md — 본 R2 계측/판정 추가


## 5. 최종 R3 원인 판별 — 실제 호스 설정/1WAY 계측

- 이번 R3도 실서버 bootstrap 응답을 Playwright에서 받은 뒤 실제 1WAY 후보 모델 행만 제거했다. 응답 전체를 합성하지 않았다.
- 최종 판정: **A — QA 설정 불일치**

### 5.1 정상 실응답에서 읽은 값

- window.SHOW_I_HOSE: `false` (raw=false)
- pickHoseModel('1way'): `FH-LFHLF`
- AM016MN1PBH2 원문 name: `실내기 1WAY(소형) 미내장 4평형`
- AM016MN1PBH2 앱 분류: isCommIndoorRow=`true`, commIndoorKind=`1way`
- 수량 1 입력 후 n1w: `1`

### 5.2 실제 선택 호스 제거 재현

- 제거한 실제 1WAY 호스 모델: `FH-LFHLF`, `FH-LFHIF`
- 제거 범위: homemulti FH-LFHLF 120→119; commercialMulti FH-LFHLF 408→407; homemulti FH-LFHIF 119→118; commercialMulti FH-LFHIF 407→406
- 제거 후 pickHoseModel('1way'): ``
- 제거 후 SHOW_I_HOSE: `false`
- 제거 후 n1w: `1`
- 유연호스 제외: `false`
- 재현 경고 hidden: `false`
- 재현 경고 textContent 전문: `상업멀티 파생 품목이 카탈로그에 없습니다: FH-LFHLF (파생 품목 반영). 누락된 품목은 주문 금액에 반영되지 않았습니다. 카탈로그를 확인해주세요.`

### 5.3 want 관련 런타임 Map 계측

아래는 수량 입력 직후 `Map.prototype.set`을 계측해 호스/대상 모델에 관련된 Map만 덤프한 값이다. `want`에 해당하는 Map은 AM016MN1PBH2가 아닌 호스 모델을 값 1로 보유하는 Map이다.

```json
{
  "baseline": [
    {
      "id": 3,
      "size": 127,
      "relevantEntries": [
        [
          "FH-LFHLF",
          1
        ],
        [
          "FH-LFHLN",
          0
        ],
        [
          "FH-LFHIF",
          0
        ],
        [
          "AM016MN1PBH2",
          1
        ]
      ],
      "relevantSetEvents": [
        {
          "key": "AM016MN1PBH2",
          "value": 1,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at HTMLInputElement.<anonymous> (http://localhost:5202/:3041:15)"
          ]
        },
        {
          "key": "FH-LFHLF",
          "value": 1,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at http://localhost:5202/:5861:13",
            "    at Map.forEach (<anonymous>)",
            "    at recomputeCommDerived (http://localhost:5202/:5856:8)"
          ]
        },
        {
          "key": "FH-LFHLN",
          "value": 0,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at http://localhost:5202/:5861:13",
            "    at Map.forEach (<anonymous>)",
            "    at recomputeCommDerived (http://localhost:5202/:5856:8)"
          ]
        },
        {
          "key": "FH-LFHIF",
          "value": 0,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at http://localhost:5202/:5861:13",
            "    at Map.forEach (<anonymous>)",
            "    at recomputeCommDerived (http://localhost:5202/:5856:8)"
          ]
        }
      ]
    },
    {
      "id": 4,
      "size": 126,
      "relevantEntries": [
        [
          "FH-LFHLF",
          1
        ],
        [
          "FH-LFHLN",
          0
        ],
        [
          "FH-LFHIF",
          0
        ]
      ],
      "relevantSetEvents": [
        {
          "key": "FH-LFHLF",
          "value": 0,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at http://localhost:5202/:5699:99",
            "    at Array.forEach (<anonymous>)",
            "    at recomputeCommDerived (http://localhost:5202/:5699:12)"
          ]
        },
        {
          "key": "FH-LFHLN",
          "value": 0,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at http://localhost:5202/:5699:99",
            "    at Array.forEach (<anonymous>)",
            "    at recomputeCommDerived (http://localhost:5202/:5699:12)"
          ]
        },
        {
          "key": "FH-LFHIF",
          "value": 0,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at http://localhost:5202/:5699:99",
            "    at Array.forEach (<anonymous>)",
            "    at recomputeCommDerived (http://localhost:5202/:5699:12)"
          ]
        },
        {
          "key": "FH-LFHLF",
          "value": 1,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at recomputeCommDerived (http://localhost:5202/:5725:20)",
            "    at HTMLInputElement.<anonymous> (http://localhost:5202/:3093:9)"
          ]
        },
        {
          "key": "FH-LFHLN",
          "value": 0,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at recomputeCommDerived (http://localhost:5202/:5726:20)",
            "    at HTMLInputElement.<anonymous> (http://localhost:5202/:3093:9)"
          ]
        }
      ]
    }
  ],
  "missing": [
    {
      "id": 3,
      "size": 125,
      "relevantEntries": [
        [
          "AM016MN1PBH2",
          1
        ]
      ],
      "relevantSetEvents": [
        {
          "key": "AM016MN1PBH2",
          "value": 1,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at HTMLInputElement.<anonymous> (http://localhost:5202/:3041:15)"
          ]
        }
      ]
    },
    {
      "id": 4,
      "size": 125,
      "relevantEntries": [
        [
          "FH-LFHLF",
          1
        ]
      ],
      "relevantSetEvents": [
        {
          "key": "FH-LFHLF",
          "value": 1,
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at recomputeCommDerived (http://localhost:5202/:5725:20)",
            "    at HTMLInputElement.<anonymous> (http://localhost:5202/:3093:9)"
          ]
        }
      ]
    },
    {
      "id": 5,
      "size": 1,
      "relevantEntries": [
        [
          "FH-LFHLF",
          {}
        ]
      ],
      "relevantSetEvents": [
        {
          "key": "FH-LFHLF",
          "value": {},
          "stack": [
            "    at Map.qa987Set (eval at evaluate (:302:30), <anonymous>:17:65)",
            "    at noteCommCatalogMissing_ (http://localhost:5202/:5684:19)",
            "    at requireCommCatalogRow_ (http://localhost:5202/:5691:7)",
            "    at http://localhost:5202/:5857:17"
          ]
        }
      ]
    }
  ]
}
```

### 5.4 HTTP/콘솔 부수 관측

- `PATCH /auth/partner-tutorial 400`은 요청대로 PR #992 범위 밖으로 판정에서 제외했다.
- missing console errors: `Failed to load resource: the server responded with a status of 404 (Not Found)`; `Failed to load resource: the server responded with a status of 400 (Bad Request)`
- missing 4xx/5xx: `GET http://localhost:8080/app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F29-1 404`; `PATCH http://localhost:8080/api/v1/auth/partner-tutorial 400`

### 5.5 갱신 파일

- [qa-02-missing-hose-warning.png](./qa-02-missing-hose-warning.png) — R3 실제 1WAY 후보 전체 제거 fresh 캡처
- [qa-02-missing-hose-warning-r3.png](./qa-02-missing-hose-warning-r3.png) — 동일 캡처 원본
- REPORT.md — 본 R3 계측/최종 판정 추가
