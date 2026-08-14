package com.samhanair.logis.inventory.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/** 전표 귀속 QR 스캔 요청 — UUID 없이 slipNo와 (serialKey, productCode)만 받는다. */
public record QrScanRequest(
        @NotBlank(message = "slipNo는 필수입니다") String slipNo,
        @NotEmpty(message = "스캔 목록은 비어 있을 수 없습니다")
        List<@Valid QrScanItem> items) {

    /** QR 한 건의 사용자 입력. */
    public record QrScanItem(
            @NotBlank(message = "serialKey는 필수입니다") String serialKey,
            @NotBlank(message = "productCode는 필수입니다") String productCode) {
    }
}
