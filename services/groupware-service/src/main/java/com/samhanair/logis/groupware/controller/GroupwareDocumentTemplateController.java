package com.samhanair.logis.groupware.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.groupware.dto.DocumentTemplateCreateRequest;
import com.samhanair.logis.groupware.dto.DocumentTemplateResponse;
import com.samhanair.logis.groupware.dto.DocumentTemplateUpdateRequest;
import com.samhanair.logis.groupware.dto.DocumentTemplateRevisionResponse;
import com.samhanair.logis.groupware.service.DocumentTemplateService;
import com.samhanair.logis.groupware.service.DocumentTemplateRevisionService;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 그룹웨어 문서 레이아웃 템플릿 관리자/렌더러 endpoint. */
@RestController
@RequiredArgsConstructor
public class GroupwareDocumentTemplateController {

    private static final String PAGE_CODE = "groupware.approval-templates";
    private final DocumentTemplateService service;
    private final DocumentTemplateRevisionService revisionService;

    /** 관리자 문서 양식 목록. */
    @Operation(summary = "그룹웨어 문서 양식 목록 조회")
    @GetMapping("/admin/groupware/document-templates")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<DocumentTemplateResponse>> list() {
        return ApiResponse.ok(service.findAll());
    }

    /** 관리자 문서 양식 단건. */
    @Operation(summary = "그룹웨어 문서 양식 단건 조회")
    @GetMapping("/admin/groupware/document-templates/{id}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<DocumentTemplateResponse> get(@PathVariable UUID id) {
        return ApiResponse.ok(service.findResponse(id));
    }

    /** DRAFT 문서 양식 생성. */
    @Operation(summary = "그룹웨어 문서 양식 생성")
    @PostMapping("/admin/groupware/document-templates")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ResponseEntity<ApiResponse<DocumentTemplateResponse>> create(
            @Valid @RequestBody DocumentTemplateCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(service.create(request)));
    }

    /** DRAFT 문서 양식 수정. */
    @Operation(summary = "그룹웨어 문서 양식 수정")
    @PutMapping("/admin/groupware/document-templates/{id}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<DocumentTemplateResponse> update(@PathVariable UUID id,
                                                        @Valid @RequestBody DocumentTemplateUpdateRequest request) {
        return ApiResponse.ok(service.update(id, request));
    }

    /** 문서 양식 soft-delete. */
    @Operation(summary = "그룹웨어 문서 양식 삭제")
    @DeleteMapping("/admin/groupware/document-templates/{id}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<Void> delete(@PathVariable UUID id, Principal principal) {
        service.delete(id, actor(principal));
        return ApiResponse.ok(null);
    }

    /** docType의 문서 양식을 활성화한다. */
    @Operation(summary = "그룹웨어 문서 양식 활성화")
    @PostMapping("/admin/groupware/document-templates/{id}/activate")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<DocumentTemplateResponse> activate(@PathVariable UUID id, Principal principal) {
        return ApiResponse.ok(service.activate(id, actor(principal)));
    }

    /** 문서 양식을 DRAFT로 비활성화한다. */
    @Operation(summary = "그룹웨어 문서 양식 비활성화")
    @PostMapping("/admin/groupware/document-templates/{id}/deactivate")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<DocumentTemplateResponse> deactivate(@PathVariable UUID id) {
        return ApiResponse.ok(service.deactivate(id));
    }

    /** 인증 사용자용 docType active 문서 양식. */
    @Operation(summary = "활성 문서 양식 조회")
    @GetMapping("/groupware/document-templates/active")
    public ApiResponse<DocumentTemplateResponse> active(@RequestParam String docType) {
        return ApiResponse.ok(service.findActiveByDocType(docType));
    }

    /** 승인 완료 문서 재인쇄용 각인 revision. 기존 page-code 권한 검사를 재사용하지 않고 인증만 요구한다. */
    @Operation(summary = "승인 당시 문서 양식 revision 조회")
    @GetMapping("/groupware/document-templates/{templateId}/revisions/{revision}")
    public ApiResponse<DocumentTemplateRevisionResponse> revision(@PathVariable UUID templateId,
                                                                   @PathVariable int revision) {
        return ApiResponse.ok(revisionService.findResponse(templateId, revision));
    }

    private static String actor(Principal principal) {
        return principal == null || principal.getName() == null ? "system" : principal.getName();
    }
}
