package com.samhanair.logis.slip.attachment.repository;

import com.samhanair.logis.slip.attachment.domain.SlipAttachment;
import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import com.samhanair.logis.slip.attachment.web.dto.SlipPhotoAuditResponse;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 슬립 첨부 파일 — slipId 또는 slipId+type 조합 조회. soft-delete 자동 제외. */
public interface SlipAttachmentRepository extends JpaRepository<SlipAttachment, UUID> {

    /** 슬립별 첨부 목록 — 업로드 순(uploadedAt asc). */
    List<SlipAttachment> findBySlipIdAndIsDeletedFalseOrderByUploadedAtAsc(UUID slipId);

    /** 슬립 + 유형 조합 첨부 목록. */
    List<SlipAttachment> findBySlipIdAndAttachmentTypeAndIsDeletedFalseOrderByUploadedAtAsc(
            UUID slipId, SlipAttachmentType attachmentType);

    /**
     * 관리자 사진 감사 목록.
     *
     * <p>{@code slip_attachments.slip_id} 와 {@code slips.id} 를 조인해 전표번호/전표일자/거래처명을
     * 함께 조회한다. 내부 {@code attachmentId}, {@code slipId} 는 응답에 노출하지 않는다.
     *
     * @param type 첨부 유형 필터, null 이면 전체
     * @param from 전표일자 시작, null 이면 하한 없음
     * @param to 전표일자 종료, null 이면 상한 없음
     * @param slipNo 전표번호 부분 검색어, null 이면 전체
     * @param pageable 페이지 요청. 기본 정렬은 uploadedAt desc
     * @return 관리자 사진 감사 응답 페이지
     */
    @Query(
            value = """
                    select new com.samhanair.logis.slip.attachment.web.dto.SlipPhotoAuditResponse(
                        s.slipNo,
                        s.slipDate,
                        s.partnerName,
                        a.attachmentType,
                        a.fileName,
                        a.fileSize,
                        a.contentType,
                        case when a.exifGpsLat is not null and a.exifGpsLng is not null
                             then true else false end,
                        a.capturedAt,
                        a.uploadedBy,
                        a.uploadedAt
                    )
                    from SlipAttachment a
                    join Slip s on a.slipId = s.id
                    where a.isDeleted = false
                      and s.isDeleted = false
                      and (:type is null or a.attachmentType = :type)
                      and (:from is null or s.slipDate >= :from)
                      and (:to is null or s.slipDate <= :to)
                      and (:slipNo is null or lower(s.slipNo) like lower(concat('%', :slipNo, '%')) ESCAPE '\\')
                    order by a.uploadedAt desc
                    """,
            countQuery = """
                    select count(a)
                    from SlipAttachment a
                    join Slip s on a.slipId = s.id
                    where a.isDeleted = false
                      and s.isDeleted = false
                      and (:type is null or a.attachmentType = :type)
                      and (:from is null or s.slipDate >= :from)
                      and (:to is null or s.slipDate <= :to)
                      and (:slipNo is null or lower(s.slipNo) like lower(concat('%', :slipNo, '%')) ESCAPE '\\')
                    """)
    Page<SlipPhotoAuditResponse> findPhotoAudit(
            @Param("type") SlipAttachmentType type,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to,
            @Param("slipNo") String slipNo,
            Pageable pageable);
}
