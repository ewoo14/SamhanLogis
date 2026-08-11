package com.samhanair.logis.groupware.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.groupware.domain.ApprovalReferenceDocType;
import com.samhanair.logis.groupware.dto.ApprovalReferenceLookupResponse;
import com.samhanair.logis.groupware.service.ApprovalAttachmentService;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 업무문서 번호에서 그룹웨어 연결 결재를 역방향 조회하는 endpoint. */
@RestController
@RequestMapping("/admin/groupware/approval-references")
@RequiredArgsConstructor
public class GroupwareApprovalReferenceController {

    private final ApprovalAttachmentService approvalAttachmentService;

    /** 참조 문서번호에 연결된 결재번호·제목·상태를 조회한다. */
    @Operation(summary = "업무문서 연결 결재 역방향 조회")
    @GetMapping
    @RequirePermission(page = "groupware.approvals", action = PermissionAction.VIEW)
    public ApiResponse<List<ApprovalReferenceLookupResponse>> list(
            @RequestParam ApprovalReferenceDocType refDocType,
            @RequestParam String refDocNo) {
        return ApiResponse.ok(approvalAttachmentService.listByReference(refDocType, refDocNo));
    }
}
