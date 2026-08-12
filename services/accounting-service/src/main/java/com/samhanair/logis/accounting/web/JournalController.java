package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.RequirePermission;
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
import java.time.YearMonth;
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

    /** 기간 미지정(개방 구간) 조회 시 하한 일자. */
    private static final LocalDate OPEN_RANGE_MIN = LocalDate.of(1900, 1, 1);
    /** 기간 미지정(개방 구간) 조회 시 상한 일자. */
    private static final LocalDate OPEN_RANGE_MAX = LocalDate.of(9999, 12, 31);

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
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ApiResponse<JournalDetailResponse> create(
            @Valid @RequestBody CreateJournalRequest request,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        return ApiResponse.ok(journalService.create(request));
    }

    /**
     * 페이지 조회 — 기간 + status 필터.
     *
     * <p>FE(`listJournals`) 계약 우선: {@code period}(YYYYMM) / {@code status} /
     * {@code page} / {@code size} 만으로도 진입 시 500 이 나지 않도록 한다.
     * 기간은 다음 우선순위로 해석한다.
     * <ol>
     *   <li>{@code from}/{@code to} 가 명시되면 그대로 사용</li>
     *   <li>{@code period}(YYYYMM) 가 명시되면 해당 월 1일~말일로 환산</li>
     *   <li>아무것도 없으면 전체 범위(개방 구간)로 조회</li>
     * </ol>
     *
     * @param period 회계 월 (YYYYMM, 선택) — FE 기본 필터
     * @param from 시작 일자 (선택)
     * @param to 종료 일자 (선택, inclusive)
     * @param status 상태 필터 (null 이면 전체)
     */
    @Operation(summary = "분개 페이지 조회",
            description = "period(YYYYMM) 또는 from/to 일자 범위 + status 필터 페이지. "
                    + "기간 미지정 시 전체 조회.")
    @GetMapping
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<Page<JournalResponse>> list(
            @RequestParam(required = false) String period,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) JournalStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        LocalDate resolvedFrom = from;
        LocalDate resolvedTo = to;
        if (resolvedFrom == null && resolvedTo == null && period != null && !period.isBlank()) {
            YearMonth ym = parsePeriod(period);
            resolvedFrom = ym.atDay(1);
            resolvedTo = ym.atEndOfMonth();
        }
        if (resolvedFrom == null) {
            resolvedFrom = OPEN_RANGE_MIN;
        }
        if (resolvedTo == null) {
            resolvedTo = OPEN_RANGE_MAX;
        }
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.ok(journalService.list(resolvedFrom, resolvedTo, status, pageable));
    }

    /** YYYYMM(또는 YYYY-MM) 문자열을 {@link YearMonth} 로 파싱. 형식 오류 시 400. */
    private static YearMonth parsePeriod(String period) {
        String normalized = period.trim().replace("-", "");
        if (normalized.length() != 6) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "period 는 YYYYMM 형식이어야 합니다: " + period);
        }
        try {
            int year = Integer.parseInt(normalized.substring(0, 4));
            int month = Integer.parseInt(normalized.substring(4, 6));
            return YearMonth.of(year, month);
        } catch (NumberFormatException | java.time.DateTimeException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "period 는 YYYYMM 형식이어야 합니다: " + period);
        }
    }

    /** 단건 조회 (라인 포함). */
    @Operation(summary = "분개 단건 조회", description = "라인 포함 상세")
    @GetMapping("/{id}")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<JournalDetailResponse> getOne(@PathVariable String id) {
        return ApiResponse.ok(journalService.getOne(
                com.samhanair.logis.accounting.web.dto.OpaqueUuidDeserializer.decode(id)));
    }

    /** 게시 — DRAFT → POSTED. 차/대 합계 일치 검증 (도메인). */
    @Operation(summary = "게시", description = "DRAFT → POSTED. 차/대 합계 일치 검증")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "게시 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "DRAFT 가 아니거나 합계 mismatch")
    })
    @PostMapping("/{id}/post")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<JournalDetailResponse> post(
            @PathVariable String id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        return ApiResponse.ok(journalService.post(
                com.samhanair.logis.accounting.web.dto.OpaqueUuidDeserializer.decode(id),
                callerOrSystem(callerHeader)));
    }

    /** 역분개 — POSTED → REVERSED. 차/대 swap 한 신규 Journal 자동 생성 + POST. */
    @Operation(summary = "역분개",
            description = "POSTED → REVERSED. 차/대 swap 한 신규 Journal 자동 생성 + POST. "
                    + "원분개 일자가 마감된 회계 기간이면 409, 입금보고서 자동 분개(CASH_RECEIPT)는 원천 문서 경유가 강제되어 409")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "역분개 성공 (응답은 신규 역분개)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
                    description = "POSTED 가 아니거나, 원분개 일자가 마감된 회계 기간이거나, "
                            + "입금보고서 자동 분개(원천에서만 취소) 인 경우")
    })
    @PostMapping("/{id}/reverse")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<JournalDetailResponse> reverse(
            @PathVariable String id,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader,
            @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
        checkEditPermission(roleHeader);
        return ApiResponse.ok(journalService.reverse(
                com.samhanair.logis.accounting.web.dto.OpaqueUuidDeserializer.decode(id),
                callerOrSystem(callerHeader)));
    }

    /**
     * P1-6 — 분개 목록 Excel(.xlsx) 다운로드.
     *
     * <p>from/to 기간 + status 필터로 조회한 분개 목록을 .xlsx 파일로 반환.
     * UUID 비공개 가드 — journalNo / journalDate 등 비즈니스 식별자만 출력.
     * 최대 10,000 행.
     *
     * <p>#907 재수렴 R — from/to 를 필수에서 선택으로 완화. 분개장 화면(JournalListPage)
     * 자체에 기간 필터 UI 가 없어(상태 필터만 존재) 항상 전체 기간을 조회하는데, export 는
     * from/to 가 필수라 FE 가 매번 "당월"을 임의로 계산해 보냈다 — 화면에 없는 조건을 파일이
     * 만든 것(P-2 위반, 화면 115건 중 당월 export 는 그 일부만 포함). {@link #list} 가 이미
     * from/to 미지정 시 적용하는 개방구간 기본값({@link #OPEN_RANGE_MIN}~{@link #OPEN_RANGE_MAX},
     * "기간 미지정 시 전체 조회")과 동일하게 적용해 화면·파일의 기본 범위를 맞춘다.
     *
     * @param from   분개일자 시작 (선택 — 미지정 시 개방구간 하한)
     * @param to     분개일자 종료 (선택 — 미지정 시 개방구간 상한)
     * @param status 상태 필터 (null 이면 전체)
     * @return 200 + xlsx binary
     */
    @Operation(summary = "분개 목록 Excel 다운로드 (P1-6)",
            description = "from/to 기간(선택, 미지정 시 전체) + status 복합 필터. "
                    + "ACCOUNTANT / MASTER 권한. 최대 10,000 행.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "xlsx binary"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
                    description = "권한 없음")
    })
    @GetMapping("/export.xlsx")
    @RequirePermission(page = JOURNAL_PAGE_CODE, action = com.samhanair.logis.security.permission.PermissionAction.DOWNLOAD)
    public ResponseEntity<byte[]> exportXlsx(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) JournalStatus status) {
        LocalDate resolvedFrom = from != null ? from : OPEN_RANGE_MIN;
        LocalDate resolvedTo = to != null ? to : OPEN_RANGE_MAX;
        byte[] xlsx = journalExcelExportService.export(resolvedFrom, resolvedTo, status);
        String filename = "journals-" + resolvedFrom + "-" + resolvedTo + ".xlsx";
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
