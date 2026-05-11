package com.samhanair.logis.inventory.attachment.repository;

import com.samhanair.logis.inventory.attachment.domain.InspectionAttachment;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 검수 사진 첨부 JPA 레포지토리 — P1 (검수 사진 첨부).
 *
 * <p>{@code @SQLRestriction("is_deleted = false")} 적용으로 soft-deleted row 자동 제외.
 */
public interface InspectionAttachmentRepository extends JpaRepository<InspectionAttachment, UUID> {

    /**
     * 검수 ID 기준 활성 첨부 목록 — 업로드 시각 오름차순.
     *
     * @param inspectionId InboundInspection UUID
     * @return is_deleted=false 인 첨부 목록 (업로드 시각 ASC)
     */
    List<InspectionAttachment> findByInspectionIdOrderByUploadedAtAsc(UUID inspectionId);

    /**
     * 슬립번호 기준 활성 첨부 목록 — slipNo 가 같은 모든 첨부 (UUID 비공개 우회용).
     *
     * @param slipNo 슬립번호 snapshot
     * @return is_deleted=false 인 첨부 목록
     */
    List<InspectionAttachment> findBySlipNoOrderByUploadedAtAsc(String slipNo);
}
