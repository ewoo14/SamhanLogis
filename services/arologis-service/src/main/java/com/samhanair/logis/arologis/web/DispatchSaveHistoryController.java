package com.samhanair.logis.arologis.web;

import com.samhanair.logis.arologis.domain.DispatchProgramType;
import com.samhanair.logis.arologis.domain.DispatchSaveMode;
import com.samhanair.logis.arologis.service.DispatchSaveHistoryService;
import com.samhanair.logis.arologis.web.dto.DispatchSaveHistoryDetailResponse;
import com.samhanair.logis.arologis.web.dto.DispatchSaveHistoryListRow;
import com.samhanair.logis.arologis.web.dto.DispatchSaveHistoryRequest;
import com.samhanair.logis.arologis.web.dto.DispatchSaveHistorySaveResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.RequirePermission;
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
 * 아로로지스 배차 저장내역 API controller.
 *
 * <p>legacy GAS 배차 4개 화면의 저장내역 탭을 arologis-service DB/API 로 대체한다.
 */
@RestController
@RequestMapping("/admin/arologis/dispatches/history")
@RequiredArgsConstructor
public class DispatchSaveHistoryController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final DispatchSaveHistoryService service;

    /**
     * 배차 결과 저장.
     *
     * @param request 저장 요청
     * @param callerHeader gateway 전파 사용자 ID
     * @param authentication Spring Security 인증
     * @return 저장된 ID 와 저장시각
     */
    @Operation(summary = "아로로지스 배차 저장내역 저장",
            description = "배차 4개 화면 결과를 AUTO_LATEST 또는 MANUAL_NAMED 저장내역으로 기록한다.")
    @PostMapping
    @RequirePermission(page = "arologis.dispatch.ops", action = "EDIT")
    public ApiResponse<DispatchSaveHistorySaveResponse> save(
            @Valid @RequestBody DispatchSaveHistoryRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            Authentication authentication) {
        return ApiResponse.ok(
                service.save(request, currentUser(callerHeader, authentication)),
                "아로로지스 배차 저장내역 저장 완료");
    }

    /**
     * 배차 저장내역 목록 조회.
     *
     * @param programTypeValue PRE_CLASSIFY / REGIONAL / UNASSIGNED / RECONCILE / ALL
     * @param from 조회 시작일
     * @param to 조회 종료일
     * @param modeValue AUTO_LATEST / MANUAL_NAMED / ALL
     * @param page page 번호
     * @param size page 크기
     * @param callerHeader gateway 전파 사용자 ID
     * @param authentication Spring Security 인증
     * @return payload 를 제외한 목록 page
     */
    @Operation(summary = "아로로지스 배차 저장내역 목록 조회",
            description = "기간, 프로그램, 저장 방식으로 현재 사용자의 배차 저장내역을 조회한다.")
    @GetMapping
    @RequirePermission(page = "arologis.dispatch.ops", action = "VIEW")
    public ApiResponse<Page<DispatchSaveHistoryListRow>> list(
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
        Page<DispatchSaveHistoryListRow> rows = service.list(
                parseProgramType(programTypeValue),
                parseSaveMode(modeValue),
                from,
                to,
                currentUser(callerHeader, authentication),
                pageable);
        return ApiResponse.ok(rows, "아로로지스 배차 저장내역 목록 조회 완료");
    }

    /**
     * 배차 저장내역 상세 조회.
     *
     * @param id 저장내역 ID
     * @param callerHeader gateway 전파 사용자 ID
     * @param authentication Spring Security 인증
     * @return 복원용 상세 payload
     */
    @Operation(summary = "아로로지스 배차 저장내역 상세 조회",
            description = "선택한 저장내역의 requestParams 와 responsePayload 를 조회해 실행 탭에 복원한다.")
    @GetMapping("/{id}")
    @RequirePermission(page = "arologis.dispatch.ops", action = "VIEW")
    public ApiResponse<DispatchSaveHistoryDetailResponse> detail(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            Authentication authentication) {
        return ApiResponse.ok(
                service.findDetail(id, currentUser(callerHeader, authentication)),
                "아로로지스 배차 저장내역 상세 조회 완료");
    }

    /**
     * 최신 자동저장 조회.
     *
     * @param programType 프로그램 구분
     * @param callerHeader gateway 전파 사용자 ID
     * @param authentication Spring Security 인증
     * @return 최신 AUTO_LATEST 상세 payload
     */
    @Operation(summary = "아로로지스 배차 최신 자동저장 조회",
            description = "현재 사용자의 프로그램별 최신 AUTO_LATEST 저장내역을 조회한다.")
    @GetMapping("/latest")
    @RequirePermission(page = "arologis.dispatch.ops", action = "VIEW")
    public ApiResponse<DispatchSaveHistoryDetailResponse> latest(
            @RequestParam("programType") DispatchProgramType programType,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            Authentication authentication) {
        return ApiResponse.ok(
                service.findLatestAutoLatest(programType, currentUser(callerHeader, authentication)),
                "아로로지스 배차 최신 자동저장 조회 완료");
    }

    private DispatchProgramType parseProgramType(String value) {
        if (value == null || value.isBlank() || "ALL".equalsIgnoreCase(value)) {
            return null;
        }
        try {
            return DispatchProgramType.valueOf(value);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "programType 은 PRE_CLASSIFY, REGIONAL, UNASSIGNED, RECONCILE, ALL 중 하나여야 합니다.");
        }
    }

    private DispatchSaveMode parseSaveMode(String value) {
        if (value == null || value.isBlank() || "ALL".equalsIgnoreCase(value)) {
            return null;
        }
        try {
            return DispatchSaveMode.valueOf(value);
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
