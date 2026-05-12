package com.samhanair.logis.partnerauth.dto;

import jakarta.validation.constraints.NotNull;

/** PATCH /api/v1/partner-approvals/{partnerCode}/status body. */
public record UpdatePartnerApprovalStatusRequest(@NotNull PartnerApprovalStatus status) {
}
