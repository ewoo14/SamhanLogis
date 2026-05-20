package com.samhanair.logis.user.web.dto;

import java.util.UUID;

/** 형제 service internal Employee name lookup 응답. 사용자 화면 직접 노출 금지. */
public record InternalEmployeeLookupResponse(UUID employeeId, String fullName) {
}
