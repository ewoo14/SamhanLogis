package com.samhanair.logis.notification.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.notification.dto.ChatRoomImportResult;
import com.samhanair.logis.notification.dto.ChatRoomMappingCreateRequest;
import com.samhanair.logis.notification.dto.ChatRoomMappingResponse;
import com.samhanair.logis.notification.service.ChatRoomImportService;
import com.samhanair.logis.notification.service.ChatRoomMappingService;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.io.IOException;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 단톡방 매핑 admin endpoint (PR-D Part 2-3 — Samhan Public native 이식).
 *
 * <p>경로: {@code /api/v1/notification/admin/chat-rooms}.
 * 인증 = X-User-* 헤더 (gateway 경유) + {@code @RequirePermission} 동적 권한 가드.
 *
 * <p>UUID 비공개 가드 — 응답 / path variable 은 partner_code + chat_room_name 위주, id (UUID) 는
 * DELETE path variable 한정 (admin 화면 내부).
 *
 * <p>Endpoint 4개:
 * <ul>
 *   <li>GET /chat-rooms — 전체 목록 (옵션: partnerCode, partnerBusinessName 또는 chatRoomName 필터)</li>
 *   <li>POST /chat-rooms — 단건 등록 (partner_code 직접 입력)</li>
 *   <li>POST /chat-rooms/import — multipart CSV 일괄 import</li>
 *   <li>DELETE /chat-rooms/{id} — soft-delete</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/notification/admin/chat-rooms")
@RequiredArgsConstructor
public class ChatRoomMappingAdminController {

    private final ChatRoomMappingService mappingService;
    private final ChatRoomImportService importService;

    /**
     * 단톡방 매핑 전체 목록.
     *
     * @param partnerCode (선택) 거래처별 필터
     * @param partnerBusinessName (선택) legacy 이름 alias 필터
     * @param chatRoomName (선택) 단톡방별 필터
     */
    @Operation(summary = "단톡방 매핑 목록 (Admin)",
            description = "MASTER / MANAGER 권한 필요. partnerCode / chatRoomName 필터 지원.")
    @GetMapping
    @RequirePermission(page = "messenger.admin", action = PermissionAction.VIEW)
    public ApiResponse<List<ChatRoomMappingResponse>> list(
            @RequestParam(required = false) String partnerCode,
            @RequestParam(required = false) String partnerBusinessName,
            @RequestParam(required = false) String chatRoomName) {
        List<ChatRoomMappingResponse> result = mappingService
                .listMappings(partnerCode, partnerBusinessName, chatRoomName).stream()
                .map(ChatRoomMappingResponse::from)
                .toList();
        return ApiResponse.ok(result);
    }

    /**
     * 단건 매핑 등록 (admin 직접 — source=MANUAL).
     *
     * <p>사용자 명시: partner_code 직접 입력 (사업자명 lookup 우회). business_name 은 snapshot only.
     */
    @Operation(summary = "단톡방 매핑 단건 등록 (Admin)",
            description = "partner_code 직접 입력. 활성 (partner_code, chat_room_name) 중복 시 409 CONFLICT.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "등록 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "중복 매핑")
    })
    @PostMapping
    @RequirePermission(page = "messenger.admin", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<ChatRoomMappingResponse>> create(
            @Valid @RequestBody ChatRoomMappingCreateRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(ChatRoomMappingResponse.from(mappingService.create(req))));
    }

    /**
     * CSV 일괄 import (Notion DB "단톡방리스트" export).
     *
     * <p>요청 = multipart/form-data, field = "file". UTF-8 BOM 허용.
     * 응답 = inserted / updated / rejected 종합. reject 가 있어도 정상 row 는 commit.
     */
    @Operation(summary = "단톡방 매핑 CSV 일괄 import (Admin)",
            description = "Notion export CSV. field=file. inserted/updated/rejected 응답.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "import 완료"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "파일 누락 또는 파싱 실패")
    })
    @PostMapping("/import")
    @RequirePermission(page = "messenger.admin", action = PermissionAction.CREATE)
    public ApiResponse<ChatRoomImportResult> importCsv(@RequestPart("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일이 비어있습니다");
        }
        try {
            return ApiResponse.ok(importService.importCsv(file.getInputStream()));
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파싱 실패: " + e.getMessage());
        }
    }

    /**
     * 단톡방 매핑 soft-delete (id 직접 — admin 화면 내부 한정).
     */
    @Operation(summary = "단톡방 매핑 soft-delete (Admin)")
    @DeleteMapping("/{id}")
    @RequirePermission(page = "messenger.admin", action = PermissionAction.DELETE)
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable UUID id, Principal principal) {
        String actor = principal != null ? principal.getName() : "system";
        mappingService.delete(id, actor);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }
}
