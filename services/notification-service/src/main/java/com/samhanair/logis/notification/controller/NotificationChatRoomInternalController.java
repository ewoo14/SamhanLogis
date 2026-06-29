package com.samhanair.logis.notification.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.notification.dto.ChatRoomMappingResponse;
import com.samhanair.logis.notification.service.ChatRoomMappingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * notification-service 내부용 채팅방 매핑 조회 endpoint.
 *
 * <p>인증은 {@code /internal/**} 경로의 {@code X-Internal-Token} 전용 필터가 처리하며,
 * 컨트롤러는 {@code ROLE_MASTER} 내부 주체만 허용한다. 사용자 gateway 신원 헤더와
 * {@code @RequirePermission} 은 사용하지 않는다.
 */
@RestController
@RequestMapping("/internal/notification/admin/chat-rooms")
@RequiredArgsConstructor
public class NotificationChatRoomInternalController {

    private final ChatRoomMappingService mappingService;

    /**
     * public admin 목록 endpoint 와 같은 응답 DTO shape 로 채팅방 매핑을 조회한다.
     *
     * @param partnerCode 거래처 코드 필터
     * @param partnerBusinessName legacy 거래처명 snapshot 필터
     * @param chatRoomName 채팅방명 필터
     * @return 200 + {@code ApiResponse<List<ChatRoomMappingResponse>>}
     */
    @Operation(summary = "채팅방 매핑 목록 조회 (internal)",
            description = "slip-service next-day image 생성용. X-Internal-Token 필수.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "내부 토큰 누락 또는 불일치")
    })
    @GetMapping
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<List<ChatRoomMappingResponse>> list(
            @RequestParam(required = false) String partnerCode,
            @RequestParam(required = false) String partnerBusinessName,
            @RequestParam(required = false) String chatRoomName) {
        return ApiResponse.ok(mappingService.listMappings(partnerCode, partnerBusinessName, chatRoomName)
                .stream()
                .map(ChatRoomMappingResponse::from)
                .toList());
    }
}
