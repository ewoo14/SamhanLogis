package com.samhanair.logis.groupware.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 그룹방 편집 요청 — 작성자 제외 참여자는 담당자코드로 교체한다. */
public record ChatGroupRoomEditRequest(@NotEmpty @Size(max = 49) List<String> employeeCodes,
                                       @jakarta.validation.constraints.NotBlank @Size(max = 120) String roomName) {}
