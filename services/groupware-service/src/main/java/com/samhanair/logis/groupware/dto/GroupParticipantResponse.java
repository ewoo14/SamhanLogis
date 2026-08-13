package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.client.UserClient;

/** 그룹방 참여자 표시 계약. 내부 사용자 UUID는 포함하지 않는다. */
public record GroupParticipantResponse(String name, String departmentName, String employeeCode) {
    public static GroupParticipantResponse from(UserClient.UserProfile profile) {
        return profile == null ? new GroupParticipantResponse("알 수 없는 사용자", null, null)
                : new GroupParticipantResponse(profile.name(), profile.department(), profile.employeeCode());
    }
}
