'use strict';

// 2026-08-10 회사 PC product_db 읽기 결과: ACTIVE + HOME_MULTI 노출 119행.
// R23 RED는 이 snapshot 전체를 VM의 HOMEMULTI로 주입한다. DB write는 수행하지 않았다.
const r23HomeMultiCatalog = [
  {
    "name": "인체감시센서 KIT (360용)",
    "unit": "EA",
    "model": "ACR-SKE"
  },
  {
    "name": "인체감시센서 KIT (4way용)",
    "unit": "EA",
    "model": "ACR-SMA"
  },
  {
    "name": "유선리모컨 키트",
    "unit": "EA",
    "model": "AIM-A01N"
  },
  {
    "name": "멀티Wifi KIT",
    "unit": "EA",
    "model": "AIM-H04N"
  },
  {
    "name": "실내기(1-Way) 무풍 소형 WIFI 내장 3평형",
    "unit": "EA",
    "model": "AJ012BN1PBC2"
  },
  {
    "name": "실내기(1-Way) 무풍 소형 미내장 3평형",
    "unit": "EA",
    "model": "AJ012MB1PBC2"
  },
  {
    "name": "실내기(1-Way) 무풍 소형 WIFI 내장 4평형",
    "unit": "EA",
    "model": "AJ016BN1PBC2"
  },
  {
    "name": "실내기(1-Way) 무풍 소형 미내장 4평형",
    "unit": "EA",
    "model": "AJ016MB1PBC2"
  },
  {
    "name": "실내기(1-Way) 무풍 중형 WIFI 내장 5평형",
    "unit": "EA",
    "model": "AJ020BN1PBC1"
  },
  {
    "name": "실내기(1-Way) 무풍 소형 WIFI 내장 5평형",
    "unit": "EA",
    "model": "AJ020BN1PBC2"
  },
  {
    "name": "실내기(1-Way) 인피니트 무풍 중형 5평형",
    "unit": "EA",
    "model": "AJ020CN1FBC1"
  },
  {
    "name": "실내기(1-Way) 인피니트 무풍 중형(UV) 5평형",
    "unit": "EA",
    "model": "AJ020CN1UBC1"
  },
  {
    "name": "비스포크 AI 에어콤보 토출 우측",
    "unit": "EA",
    "model": "AJ020FERPBC1"
  },
  {
    "name": "비스포크 AI 에어콤보 토출 좌측",
    "unit": "EA",
    "model": "AJ020FERPBC2"
  },
  {
    "name": "실내기(1-Way) 무풍 중형 미내장 5평형",
    "unit": "EA",
    "model": "AJ020MB1PBC1"
  },
  {
    "name": "실내기(1-Way) 무풍 소형 미내장 5평형",
    "unit": "EA",
    "model": "AJ020MB1PBC2"
  },
  {
    "name": "실내기(1-Way) 무풍 중형 WIFI 내장 6평형",
    "unit": "EA",
    "model": "AJ023BN1PBC1"
  },
  {
    "name": "실내기(1-Way) 인피니트 무풍 중형 6평형",
    "unit": "EA",
    "model": "AJ023CN1FBC1"
  },
  {
    "name": "실내기(1-Way) 인피니트 무풍 중형(UV) 6평형",
    "unit": "EA",
    "model": "AJ023CN1UBC1"
  },
  {
    "name": "실내기(1-Way) 무풍 중형 미내장 6평형",
    "unit": "EA",
    "model": "AJ023MB1PBC1"
  },
  {
    "name": "실외기_2.5HP 단배관",
    "unit": "EA",
    "model": "AJ025MXHNBC1"
  },
  {
    "name": "실외기_2.5HP 다배관",
    "unit": "EA",
    "model": "AJ025RXH3BC1"
  },
  {
    "name": "실외기_3HP 단배관",
    "unit": "EA",
    "model": "AJ030MXHNBC1"
  },
  {
    "name": "실외기_3HP 다배관",
    "unit": "EA",
    "model": "AJ030RXH4BC1"
  },
  {
    "name": "실내기(1-Way) 무풍 중형 WIFI 내장 8평형",
    "unit": "EA",
    "model": "AJ032BN1PBC1"
  },
  {
    "name": "실내기(1-Way) 인피니트 무풍 중형 8평형",
    "unit": "EA",
    "model": "AJ032CN1FBC1"
  },
  {
    "name": "실내기(1-Way) 인피니트 무풍 중형(UV) 8평형",
    "unit": "EA",
    "model": "AJ032CN1UBC1"
  },
  {
    "name": "실내기(1-Way) 무풍 중형 미내장 8평형",
    "unit": "EA",
    "model": "AJ032MB1PBC1"
  },
  {
    "name": "실내기(1-Way) 무풍 중형 WIFI 내장 10평형",
    "unit": "EA",
    "model": "AJ040BN1PBC1"
  },
  {
    "name": "실내기(1-Way) 인피니트 무풍 중형 10평형",
    "unit": "EA",
    "model": "AJ040CN1FBC1"
  },
  {
    "name": "실내기(1-Way) 인피니트 무풍 중형(UV) 10평형",
    "unit": "EA",
    "model": "AJ040CN1UBC1"
  },
  {
    "name": "실내기(1-Way) 무풍 중형 미내장 10평형",
    "unit": "EA",
    "model": "AJ040MB1PBC1"
  },
  {
    "name": "실외기_4HP 단배관",
    "unit": "EA",
    "model": "AJ040MXHNBC1"
  },
  {
    "name": "실외기_4HP 다배관",
    "unit": "EA",
    "model": "AJ040RXH4BC1"
  },
  {
    "name": "실외기_5HP 단배관",
    "unit": "EA",
    "model": "AJ050MXHNBC1"
  },
  {
    "name": "실외기_5HP 다배관",
    "unit": "EA",
    "model": "AJ050RXH5BC1"
  },
  {
    "name": "실내기(1-Way) 무풍 대형 WIFI 내장 13평형",
    "unit": "EA",
    "model": "AJ052BN1PBC1"
  },
  {
    "name": "실내기(1-Way) 인피니트 무풍 대형 13평형",
    "unit": "EA",
    "model": "AJ052CN1FBC1"
  },
  {
    "name": "실내기(1-Way) 인피니트 무풍 대형(UV) 13평형",
    "unit": "EA",
    "model": "AJ052CN1UBC1"
  },
  {
    "name": "실내기(1-Way) 무풍 대형 미내장 13평형",
    "unit": "EA",
    "model": "AJ052MB1PBC1"
  },
  {
    "name": "실내기(1-Way) 무풍 대형 WIFI 내장 15평형",
    "unit": "EA",
    "model": "AJ060BN1PBC1"
  },
  {
    "name": "실내기(1-Way) 인피니트 무풍 대형 15평형",
    "unit": "EA",
    "model": "AJ060CN1FBC1"
  },
  {
    "name": "실내기(1-Way) 인피니트 무풍 대형(UV) 15평형",
    "unit": "EA",
    "model": "AJ060CN1UBC1"
  },
  {
    "name": "실내기(1-Way) 무풍 대형 미내장 15평형",
    "unit": "EA",
    "model": "AJ060MB1PBC1"
  },
  {
    "name": "실외기_6HP 단배관",
    "unit": "EA",
    "model": "AJ060MXHNBC1"
  },
  {
    "name": "실내기(1-Way) 무풍 대형 WIFI 내장 18평형",
    "unit": "EA",
    "model": "AJ072BN1PBC1"
  },
  {
    "name": "실내기(1-Way) 인피니트 무풍 대형 18평형",
    "unit": "EA",
    "model": "AJ072CN1FBC1"
  },
  {
    "name": "실내기(1-Way) 인피니트 무풍 대형(UV) 18평형",
    "unit": "EA",
    "model": "AJ072CN1UBC1"
  },
  {
    "name": "실내기(1-Way) 무풍 대형 미내장 18평형",
    "unit": "EA",
    "model": "AJ072MB1PBC1"
  },
  {
    "name": "실내기 벽걸이 6평형",
    "unit": "EA",
    "model": "AM023TNVDBH1"
  },
  {
    "name": "실내기 벽걸이 8평형",
    "unit": "EA",
    "model": "AM032TNVDBH1"
  },
  {
    "name": "실내기 벽걸이 10평형",
    "unit": "EA",
    "model": "AM040TNVDBH1"
  },
  {
    "name": "실내기(4-Way)_DVM_S 무풍 WIFI내장 13평형",
    "unit": "EA",
    "model": "AM052BN4DBH1"
  },
  {
    "name": "실내기 360CST WIFI내장 13평형",
    "unit": "EA",
    "model": "AM052BN6PBH1"
  },
  {
    "name": "실내기 360CST 미내장 13평형",
    "unit": "EA",
    "model": "AM052KN4PBH1"
  },
  {
    "name": "실내기 4WAY 미내장 13평형",
    "unit": "EA",
    "model": "AM052NN4DBH1"
  },
  {
    "name": "실내기 벽걸이 13평형",
    "unit": "EA",
    "model": "AM052TNVDBH1"
  },
  {
    "name": "실내기(4-Way)_DVM_S 무풍 WIFI내장 15평형",
    "unit": "EA",
    "model": "AM060BN4DBH1"
  },
  {
    "name": "실내기 360CST WIFI내장 15평형",
    "unit": "EA",
    "model": "AM060BN6PBH1"
  },
  {
    "name": "실내기 360CST 미내장 15평형",
    "unit": "EA",
    "model": "AM060KN4PBH1"
  },
  {
    "name": "실내기 4WAY 미내장 15평형",
    "unit": "EA",
    "model": "AM060NN4DBH1"
  },
  {
    "name": "실내기 벽걸이 15평형",
    "unit": "EA",
    "model": "AM060TNVDBH1"
  },
  {
    "name": "실내기(4-Way)_DVM_S 무풍 WIFI내장 18평형",
    "unit": "EA",
    "model": "AM072BN4DBH1"
  },
  {
    "name": "실내기 360CST WIFI내장 18평형",
    "unit": "EA",
    "model": "AM072BN6PBH1"
  },
  {
    "name": "실내기 360CST 미내장 18평형",
    "unit": "EA",
    "model": "AM072KN4PBH1"
  },
  {
    "name": "실내기 4WAY 미내장 18평형",
    "unit": "EA",
    "model": "AM072NN4DBH1"
  },
  {
    "name": "실내기(4-Way)_DVM_S 무풍 WIFI내장 23평형",
    "unit": "EA",
    "model": "AM083BN4DBH1"
  },
  {
    "name": "실내기 360CST WIFI내장 23평형",
    "unit": "EA",
    "model": "AM083BN6PBH1"
  },
  {
    "name": "실내기 360CST 미내장 23평형",
    "unit": "EA",
    "model": "AM083KN4PBH1"
  },
  {
    "name": "실내기 4WAY 미내장 23평형",
    "unit": "EA",
    "model": "AM083NN4DBH1"
  },
  {
    "name": "실내기 벽걸이 23평형",
    "unit": "EA",
    "model": "AM083TNVDBH1"
  },
  {
    "name": "무선리모컨 인피니트(솔라셀)",
    "unit": "EA",
    "model": "AR-CH01"
  },
  {
    "name": "무선리모컨(냉방전용)",
    "unit": "EA",
    "model": "AR-EC05"
  },
  {
    "name": "무선리모컨(360cst용)",
    "unit": "EA",
    "model": "AR-KH05"
  },
  {
    "name": "유선리모컨(통합)",
    "unit": "EA",
    "model": "AWR-WE13N"
  },
  {
    "name": "유선리모컨(컬러)",
    "unit": "EA",
    "model": "AWR-WG00N"
  },
  {
    "name": "유선리모컨(컬러) 에어콤보용",
    "unit": "EA",
    "model": "AWR-WV00N"
  },
  {
    "name": "Y형 실내기 분기관",
    "unit": "EA",
    "model": "AXJ-YA1509N"
  },
  {
    "name": "Y형 실내기 분기관",
    "unit": "EA",
    "model": "AXJ-YA2512N"
  },
  {
    "name": "시스템제습기 본체",
    "unit": "EA",
    "model": "AY047BA1SBA"
  },
  {
    "name": "유연호스 I형",
    "unit": "EA",
    "model": "FH-LFHIF"
  },
  {
    "name": "유연호스 L형 1WAY",
    "unit": "EA",
    "model": "FH-LFHLF"
  },
  {
    "name": "유연호스 L형 4WAY",
    "unit": "EA",
    "model": "FH-LFHLN"
  },
  {
    "name": "판넬 1way 무풍+공기청정 대형 미내장",
    "unit": "EA",
    "model": "PC1BWCK3N"
  },
  {
    "name": "판넬 1way 무풍+공기청정 대형 WIFI",
    "unit": "EA",
    "model": "PC1BWCK3NW"
  },
  {
    "name": "인테리어핏 대형",
    "unit": "EA",
    "model": "PC1BWSK1NRR"
  },
  {
    "name": "판넬 1way 무풍대형 미내장",
    "unit": "EA",
    "model": "PC1BWSK3N"
  },
  {
    "name": "판넬 1way 무풍대형 WIFI 내장",
    "unit": "EA",
    "model": "PC1BWSK3NW"
  },
  {
    "name": "시스템제습기 판넬",
    "unit": "EA",
    "model": "PC1DWSK1"
  },
  {
    "name": "판넬 1way 무풍+공기청정 소형 미내장",
    "unit": "EA",
    "model": "PC1MWCK3N"
  },
  {
    "name": "판넬 1way 무풍+공기청정 소형 WIFI",
    "unit": "EA",
    "model": "PC1MWCK3NW"
  },
  {
    "name": "인테리어핏 소형",
    "unit": "EA",
    "model": "PC1MWSK1NRR"
  },
  {
    "name": "판넬 1way 무풍소형 미내장",
    "unit": "EA",
    "model": "PC1MWSK3N"
  },
  {
    "name": "판넬 1way 무풍소형 WIFI 내장",
    "unit": "EA",
    "model": "PC1MWSK3NW"
  },
  {
    "name": "판넬 1way 무풍+공기청정 중형 미내장",
    "unit": "EA",
    "model": "PC1NWCK3N"
  },
  {
    "name": "판넬 1way 무풍+공기청정 중형 WIFI",
    "unit": "EA",
    "model": "PC1NWCK3NW"
  },
  {
    "name": "인테리어핏 중형",
    "unit": "EA",
    "model": "PC1NWSK1NRR"
  },
  {
    "name": "판넬 1way 무풍중형 미내장",
    "unit": "EA",
    "model": "PC1NWSK3N"
  },
  {
    "name": "판넬 1way 무풍중형 WIFI 내장",
    "unit": "EA",
    "model": "PC1NWSK3NW"
  },
  {
    "name": "판넬 1way 무풍중형 인피니트 / 공청",
    "unit": "EA",
    "model": "PC1YNCK1NW"
  },
  {
    "name": "판넬 1way 무풍중형 인피니트 / 공청+동작감지",
    "unit": "EA",
    "model": "PC1YNRK1NW"
  },
  {
    "name": "판넬 1way 무풍중형 인피니트",
    "unit": "EA",
    "model": "PC1YNSK1NW"
  },
  {
    "name": "판넬 1way 무풍중형 인피니트 25년형",
    "unit": "EA",
    "model": "PC1YNWK1NW"
  },
  {
    "name": "판넬 1way 무풍대형 인피니트 / 공청",
    "unit": "EA",
    "model": "PC1ZNCK1NW"
  },
  {
    "name": "판넬 1way 무풍대형 인피니트 / 공청+동작감지",
    "unit": "EA",
    "model": "PC1ZNRK1NW"
  },
  {
    "name": "판넬 1way 무풍대형 인피니트",
    "unit": "EA",
    "model": "PC1ZNSK1NW"
  },
  {
    "name": "판넬 1way 무풍대형 인피니트 25년형",
    "unit": "EA",
    "model": "PC1ZNWK1NW"
  },
  {
    "name": "판넬 무풍4Way(공기청정) 미내장",
    "unit": "EA",
    "model": "PC4NUCK1N"
  },
  {
    "name": "판넬 4way 무풍+공기청정 WIFI",
    "unit": "EA",
    "model": "PC4NUCK4NW"
  },
  {
    "name": "판넬 무풍4Way(일반) 미내장",
    "unit": "EA",
    "model": "PC4NUFK1N"
  },
  {
    "name": "판넬 4way 무풍 WIFI 내장",
    "unit": "EA",
    "model": "PC4NUFK1NW"
  },
  {
    "name": "판넬 (360CST / 사각 / 공기청정) 미내장",
    "unit": "EA",
    "model": "PC6NUCK1N"
  },
  {
    "name": "판넬 360CST 사각 + 공기청정 WIFI",
    "unit": "EA",
    "model": "PC6NUCK1NW"
  },
  {
    "name": "판넬 (360CST / 사각) 미내장",
    "unit": "EA",
    "model": "PC6NUDK1N"
  },
  {
    "name": "판넬 360CST 사각  WIFI",
    "unit": "EA",
    "model": "PC6NUDK1NW"
  },
  {
    "name": "실외기 일자발",
    "unit": "EA",
    "model": "SI-AL600A"
  },
  {
    "name": "원형발통 세트",
    "unit": "EA",
    "model": "발통세트"
  },
  {
    "name": "운임",
    "unit": "EA",
    "model": "운임"
  },
  {
    "name": "절삭",
    "unit": "EA",
    "model": "절삭"
  }
];

module.exports = { r23HomeMultiCatalog };

