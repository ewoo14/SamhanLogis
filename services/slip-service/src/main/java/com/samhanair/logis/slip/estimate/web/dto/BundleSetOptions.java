package com.samhanair.logis.slip.estimate.web.dto;

/**
 * 세트 라인 전개 옵션 — 견적/전표 생성 요청 라인에 동반(BUNDLE 품목일 때만 의미).
 * legacy 종합견적서 ss_remote/ss_remote_ex/ss_panel/ss_p360/ss_mat 대응. null 이면 기본 옵션.
 */
public record BundleSetOptions(
        String remoteOption,
        Boolean remoteExcluded,
        String panelOption,
        String panelShape360,
        Boolean materialIncluded) {
}
