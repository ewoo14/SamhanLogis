package com.samhanair.logis.auth.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 결재라인 표시·서명용 단계 추가 요청. */
public record AddApprovalLineStepRequest(
        @NotBlank @Size(max = 70, message = "전표 종류(documentType)는 70자 이하여야 합니다") String documentType,
        @NotBlank @Size(max = 50) String label) {}
