package com.samhanair.logis.accounting.web.collab.dto;

import java.util.List;

/** 신규 접속자가 입금보고서 헤더 Y.Doc 상태를 재구성하기 위한 누적 Yjs update 목록. */
public record CashReceiptCoeditUpdatesResponse(List<String> updates) {
}
