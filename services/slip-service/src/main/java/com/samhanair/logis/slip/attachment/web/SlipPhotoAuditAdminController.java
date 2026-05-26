package com.samhanair.logis.slip.attachment.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import com.samhanair.logis.slip.attachment.service.SlipAttachmentService;
import com.samhanair.logis.slip.attachment.web.dto.SlipPhotoAuditResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 관리자 사진 감사 endpoint.
 *
 * <p>기존 {@code slip_attachments} 와 {@code slips} 를 조회해 사진 업로드 이력을 보여준다.
 * 신규 DB/Flyway 없이 감사 화면용 read model 만 제공한다.
 *
 * <p>UUID 비공개 가드: 내부 {@code attachmentId} 와 {@code slipId} 는 응답에 포함하지 않는다.
 */
@RestController
@RequestMapping("/slips/admin/photo-audit")
@RequiredArgsConstructor
public class SlipPhotoAuditAdminController {

    static final int DEFAULT_PAGE_SIZE = 50;
    static final int MAX_PAGE_SIZE = 100;

    private final SlipAttachmentService attachmentService;

    /**
     * 관리자 사진 감사 목록 조회.
     *
     * @param type 첨부 유형 필터(DELIVERY/INSPECTION/ESTIMATE), null 이면 전체
     * @param from 전표일자 시작, null 이면 하한 없음
     * @param to 전표일자 종료, null 이면 상한 없음
     * @param slipNo 전표번호 부분 검색어, blank 면 전체
     * @param page 0 기반 페이지 번호, 음수면 0
     * @param size 페이지 크기, 기본 50, 최대 100
     * @return ApiResponse 로 감싼 관리자 사진 감사 페이지
     */
    @Operation(summary = "관리자 사진 감사 목록",
            description = "type/from/to/slipNo 필터. uploadedAt desc 정렬. 내부 attachmentId/slipId 는 응답 미포함.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "권한 없음")
    })
    @GetMapping
    @RequirePermission(page = "slip.photo-audit", action = "VIEW")
    public ApiResponse<Page<SlipPhotoAuditResponse>> list(
            @RequestParam(required = false) SlipAttachmentType type,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String slipNo,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        Pageable pageable = PageRequest.of(safePage(page), safeSize(size),
                Sort.by(Sort.Direction.DESC, "uploadedAt"));
        return ApiResponse.ok(attachmentService.listPhotoAudit(type, from, to, slipNo, pageable));
    }

    private int safePage(int page) {
        return Math.max(0, page);
    }

    private int safeSize(int size) {
        if (size <= 0) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(size, MAX_PAGE_SIZE);
    }
}
