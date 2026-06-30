package com.samhanair.logis.slip.estimate.web.collab.dto;

import java.util.List;

/** 신규 접속자가 Y.Doc 상태를 재구성하기 위한 누적 Yjs update 목록. */
public record EstimateCoeditUpdatesResponse(List<String> updates) {
}
