package com.samhanair.logis.user.web.dto;

import java.util.UUID;

/** groupware 내부 employeeCode→UUID 해석 응답. 외부 사용자 경계로 전달하지 않는다. */
public record InternalEmployeeCodeResponse(UUID userId, String employeeCode) {}
