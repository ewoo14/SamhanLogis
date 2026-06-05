package com.samhanair.logis.auth.web.dto;

import com.samhanair.logis.auth.service.AccountPermissionService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** 권한그룹 관리 API 요청/응답 DTO 모음. */
public final class PermissionGroupDtos {

    private PermissionGroupDtos() {
    }

    /** 권한그룹 생성 요청. */
    public record CreateGroupRequest(
            @NotBlank @Size(max = 100) String name,
            @Size(max = 255) String description) {
    }

    /** 권한그룹 이름/설명 변경 요청. */
    public record RenameGroupRequest(
            @NotBlank @Size(max = 100) String name,
            @Size(max = 255) String description) {
    }

    /** 권한그룹 매트릭스 갱신 요청. */
    public record UpdateGroupMatrixRequest(
            @NotNull List<AccountPermissionService.AccountPermissionUpdate> rows) {
    }

    /** 계정 권한그룹 배속 요청. */
    public record AssignAccountGroupRequest(
            @NotNull UUID groupId) {
    }
}
