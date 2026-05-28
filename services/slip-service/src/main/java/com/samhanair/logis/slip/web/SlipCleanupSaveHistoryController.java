package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.domain.SlipCleanupProgramType;
import com.samhanair.logis.slip.domain.SlipCleanupSaveMode;
import com.samhanair.logis.slip.service.SlipCleanupSaveHistoryService;
import com.samhanair.logis.slip.web.dto.SlipCleanupSaveHistoryDetailResponse;
import com.samhanair.logis.slip.web.dto.SlipCleanupSaveHistoryListRow;
import com.samhanair.logis.slip.web.dto.SlipCleanupSaveHistoryRequest;
import com.samhanair.logis.slip.web.dto.SlipCleanupSaveHistorySaveResponse;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 전표정리 저장내역 API controller.
 *
 * <p>legacy GAS 전표정리리스트의 저장내역 탭을 slip-service DB/API 로 대체한다.
 */
@RestController
@RequestMapping("/slips/cleanup/history")
@RequiredArgsConstructor
public class SlipCleanupSaveHistoryController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final SlipCleanupSaveHistoryService service;

    /**
     * 전표정리 결과 저장.
     *
     * @param request 저장 요청
     * @param callerHeader gateway 전파 사용자 ID
     * @param authentication Spring Security 인증
     * @return 저장된 ID 와 저장시각
     */
    @Operation(summary = "전표정리 저장내역 저장",
            description = "전표정리 결과를 AUTO_LATEST 또는 MANUAL_NAMED 저장내역으로 기록한다.")
    @PostMapping
    @RequirePermission(page = "slip.cleanup-history", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<SlipCleanupSaveHistorySaveResponse> save(
            @Valid @RequestBody SlipCleanupSaveHistoryRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            Authentication authentication) {
        return ApiResponse.ok(
                service.save(request, currentUser(callerHeader, authentication)),
                "전표정리 저장내역 저장 완료");
    }

    /**
     * 전표정리 저장내역 목록 조회.
     *
     * @param programTypeValue SLIP_CLEANUP / ALL
     * @param from 조회 시작일
     * @param to 조회 종료일
     * @param modeValue AUTO_LATEST / MANUAL_NAMED / ALL
     * @param page page 번호
     * @param size page 크기
     * @param callerHeader gateway 전파 사용자 ID
     * @param authentication Spring Security 인증
     * @return payload 를 제외한 목록 page
     */
    @Operation(summary = "전표정리 저장내역 목록 조회",
            description = "기간, 프로그램, 저장 방식으로 현재 사용자의 전표정리 저장내역을 조회한다.")
    @GetMapping
    @RequirePermission(page = "slip.cleanup-history", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<Page<SlipCleanupSaveHistoryListRow>> list(
            @RequestParam(value = "programType", defaultValue = "ALL") String programTypeValue,
            @RequestParam(value = "from", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(value = "to", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(value = "mode", defaultValue = "MANUAL_NAMED") String modeValue,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "50") int size,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            Authentication authentication) {
        int safeSize = Math.max(1, Math.min(size, 200));
        PageRequest pageable = PageRequest.of(
                Math.max(page, 0),
                safeSize,
                Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<SlipCleanupSaveHistoryListRow> rows = service.list(
                parseProgramType(programTypeValue),
                parseSaveMode(modeValue),
                from,
                to,
                currentUser(callerHeader, authentication),
                pageable);
        return ApiResponse.ok(rows, "전표정리 저장내역 목록 조회 완료");
    }

    /**
     * 전표정리 저장내역 상세 조회.
     *
     * @param id 저장내역 ID
     * @param callerHeader gateway 전파 사용자 ID
     * @param authentication Spring Security 인증
     * @return 복원용 상세 payload
     */
    @Operation(summary = "전표정리 저장내역 상세 조회",
            description = "선택한 저장내역의 requestParams 와 responsePayload 를 조회해 실행 탭에 복원한다.")
    @GetMapping("/{id}")
    @RequirePermission(page = "slip.cleanup-history", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<SlipCleanupSaveHistoryDetailResponse> detail(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            Authentication authentication) {
        return ApiResponse.ok(
                service.findDetail(id, currentUser(callerHeader, authentication)),
                "전표정리 저장내역 상세 조회 완료");
    }

    /**
     * 최신 자동저장 조회.
     *
     * @param programType 프로그램 구분
     * @param callerHeader gateway 전파 사용자 ID
     * @param authentication Spring Security 인증
     * @return 최신 AUTO_LATEST 상세 payload
     */
    @Operation(summary = "전표정리 최신 자동저장 조회",
            description = "현재 사용자의 최신 SLIP_CLEANUP AUTO_LATEST 저장내역을 조회한다.")
    @GetMapping("/latest")
    @RequirePermission(page = "slip.cleanup-history", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<SlipCleanupSaveHistoryDetailResponse> latest(
            @RequestParam("programType") SlipCleanupProgramType programType,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            Authentication authentication) {
        return ApiResponse.ok(
                service.findLatestAutoLatest(programType, currentUser(callerHeader, authentication)),
                "전표정리 최신 자동저장 조회 완료");
    }

    private SlipCleanupProgramType parseProgramType(String value) {
        if (value == null || value.isBlank() || "ALL".equalsIgnoreCase(value)) {
            return null;
        }
        try {
            return SlipCleanupProgramType.valueOf(value);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "programType 은 SLIP_CLEANUP, ALL 중 하나여야 합니다.");
        }
    }

    private SlipCleanupSaveMode parseSaveMode(String value) {
        if (value == null || value.isBlank() || "ALL".equalsIgnoreCase(value)) {
            return null;
        }
        try {
            return SlipCleanupSaveMode.valueOf(value);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "mode 는 AUTO_LATEST, MANUAL_NAMED, ALL 중 하나여야 합니다.");
        }
    }

    private String currentUser(String callerHeader, Authentication authentication) {
        if (callerHeader != null && !callerHeader.isBlank()) {
            return callerHeader.trim();
        }
        if (authentication != null && authentication.getName() != null
                && !authentication.getName().isBlank()) {
            return authentication.getName();
        }
        return "system";
    }
}
