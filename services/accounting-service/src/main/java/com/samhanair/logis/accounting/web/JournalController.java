package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.client.DynamicPermissionClient;
import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.service.JournalExcelExportService;
import com.samhanair.logis.accounting.service.JournalService;
import com.samhanair.logis.accounting.web.dto.CreateJournalRequest;
import com.samhanair.logis.accounting.web.dto.JournalDetailResponse;
import com.samhanair.logis.accounting.web.dto.JournalResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 분개장 endpoint (Plan §4).
 *
 * <p>권한 매트릭스 (Q9 결정 — ACCOUNTANT/MASTER, MANAGER 제외):
 * <ul>
 *   <li>POST   /accounting/journals               — ACCOUNTANT, MASTER (수동 분개 입력 DRAFT)</li>
 *   <li>GET    /accounting/journals               — ACCOUNTANT, MASTER (페이지 조회)</li>
 *   <li>GET    /accounting/journals/{id}          — ACCOUNTANT, MASTER (단건)</li>
 *   <li>POST   /accounting/journals/{id}/post     — ACCOUNTANT, MASTER (DRAFT → POSTED)</li>
 *   <li>POST   /accounting/journals/{id}/reverse  — ACCOUNTANT, MASTER (POSTED → REVERSED)</li>
 * </ul>
 *
 * <p>모든 응답은 ApiResponse 래핑. UUID(분개 id) 는 mutation path 로만 사용,
 * 사용자 화면 표시는 journalNo / journalDate / accountCode (memory 의무).
 *
 * <p>SP-D2 동적 권한: {@code accounting.journals} 페이지 코드로 분개장 EDIT 가드.
 * (V8 seed: ACCOUNTANT canEdit=true — 분개 생성/게시/역분개 편집 허용)
 */
@Slf4j
@RestController
@RequestMapping("/accounting/journals")
@RequiredArgsConstructor
public class JournalController {

    /** SP-D2 — 분개장 전용 페이지 코드 (accounting.journals). */
    private static final String JOURNAL_PAGE_CODE = "accounting.journals";

    private static final String CALLER_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";

    private final JournalService journalService;
    private final JournalExcelExportService journalExcelExportService;
    private final DynamicPermissionClient dynamicPermissionClient;

    /** 분개 신규 생성 — DRAFT 상태. */
    @Operation(summary = "분개 생성", description = "DRAFT 상태로 생성. 라인 1개 이상 필수, accountCode leaf 검증")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "라인/입력 검증 실패 또는 통제 계정"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "accountCode 미존재")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")
    public ApiResponse<JournalDetailResponse> create(
            @Valid @RequestBody CreateJournalRequest request,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        return ApiResponse.ok(journalService.create(request));
    }

    /**
     * 페이지 조회 — from/to 일자 범위 + status 필터.
     *
     * @param from 시작 일자 (필수)
     * @param to 종료 일자 (필수, inclusive)
     * @param status 상태 필터 (null 이면 전체)
     */
    @Operation(summary = "분개 페이지 조회", description = "from/to 일자 범위 + status 필터 페이지")
    @GetMapping
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")
    public ApiResponse<Page<JournalResponse>> list(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) JournalStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(journalService.list(from, to, status, pageable));
    }

    /** 단건 조회 (라인 포함). */
    @Operation(summary = "분개 단건 조회", description = "라인 포함 상세")
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")
    public ApiResponse<JournalDetailResponse> getOne(@PathVariable UUID id) {
        return ApiResponse.ok(journalService.getOne(id));
    }

    /** 게시 — DRAFT → POSTED. 차/대 합계 일치 검증 (도메인). */
    @Operation(summary = "게시", description = "DRAFT → POSTED. 차/대 합계 일치 검증")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "게시 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "DRAFT 가 아니거나 합계 mismatch")
    })
    @PostMapping("/{id}/post")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")
    public ApiResponse<JournalDetailResponse> post(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        return ApiResponse.ok(journalService.post(id, callerOrSystem(callerHeader)));
    }

    /** 역분개 — POSTED → REVERSED. 차/대 swap 한 신규 Journal 자동 생성 + POST. */
    @Operation(summary = "역분개", description = "POSTED → REVERSED. 차/대 swap 한 신규 Journal 자동 생성 + POST")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "역분개 성공 (응답은 신규 역분개)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "POSTED 가 아닐 때")
    })
    @PostMapping("/{id}/reverse")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")
    public ApiResponse<JournalDetailResponse> reverse(
            @PathVariable UUID id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        return ApiResponse.ok(journalService.reverse(id, callerOrSystem(callerHeader)));
    }

    /**
     * P1-6 — 분개 목록 Excel(.xlsx) 다운로드.
     *
     * <p>from/to 기간 + status 필터로 조회한 분개 목록을 .xlsx 파일로 반환.
     * UUID 비공개 가드 — journalNo / journalDate 등 비즈니스 식별자만 출력.
     * 최대 10,000 행.
     *
     * @param from   분개일자 시작 (필수)
     * @param to     분개일자 종료 (필수)
     * @param status 상태 필터 (null 이면 전체)
     * @return 200 + xlsx binary
     */
    @Operation(summary = "분개 목록 Excel 다운로드 (P1-6)",
            description = "from/to 기간 + status 복합 필터. ACCOUNTANT / MASTER 권한. 최대 10,000 행.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "xlsx binary"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "권한 없음")
    })
    @GetMapping("/export.xlsx")
    @PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")
    public ResponseEntity<byte[]> exportXlsx(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) JournalStatus status) {
        byte[] xlsx = journalExcelExportService.export(from, to, status);
        String filename = "journals-" + from + "-" + to + ".xlsx";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(xlsx);
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }

    // =========================================================================
    // SP-D2 동적 권한 헬퍼
    // =========================================================================

    /**
     * SP-D2 동적 EDIT 권한 검증 — 분개장 페이지 코드 ({@code accounting.journals}).
     *
     * <p>actorRole null/blank 이면 건너뜀.
     * canEdit=false + canView=true 이면 명시적 deny → 403.
     * canEdit=false + canView=false 이면 override row 없음(fallback) → 통과.
     *
     * @param actorRole 요청자 role
     */
    private void checkEditPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canEdit = dynamicPermissionClient.canEdit(actorRole, JOURNAL_PAGE_CODE);
        if (!canEdit) {
            boolean canView = dynamicPermissionClient.canView(actorRole, JOURNAL_PAGE_CODE);
            if (canView) {
                log.warn("[SP-D2] 동적 권한 차단 (view-only override) — roleCode={} pageCode={}", actorRole, JOURNAL_PAGE_CODE);
                throw new BusinessException(ErrorCode.FORBIDDEN,
                        "동적 권한 설정에 의해 분개 편집 권한이 차단되었습니다.");
            }
            log.debug("[SP-D2] 동적 권한 override 없음 (fallback) — roleCode={} pageCode={}", actorRole, JOURNAL_PAGE_CODE);
        }
    }
}
