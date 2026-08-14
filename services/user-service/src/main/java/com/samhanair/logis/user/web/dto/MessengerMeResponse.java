package com.samhanair.logis.user.web.dto;

/** 메신저의 내 정보 표시 계약. UUID는 사용자 경계로 내보내지 않는다. */
public record MessengerMeResponse(
        String employeeCode,
        String name,
        String jobTitle,
        String departmentName,
        String employmentStatus,
        String presenceStatus) {}
