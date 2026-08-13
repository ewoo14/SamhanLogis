package com.samhanair.logis.groupware.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 그룹방 생성 요청 — 사용자 경계에는 employeeCode만 사용한다. */
public record ChatGroupRoomRequest(@NotEmpty @Size(max = 49) List<String> employeeCodes,
                                   @Size(max = 120) String roomName) {}
