package com.samhanair.logis.slip.attachment.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.samhanair.logis.common.audit.JpaAuditingConfig;
import com.samhanair.logis.slip.attachment.domain.SlipAttachment;
import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import com.samhanair.logis.slip.attachment.web.dto.SlipPhotoAuditResponse;
import com.samhanair.logis.slip.domain.Slip;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 사진 감사 JPQL projection 회귀 테스트.
 *
 * <p>실제 {@code slips} / {@code slip_attachments} row 를 저장한 뒤 type/date/slipNo/soft-delete
 * 필터와 UUID-free 응답 계약을 함께 검증한다.
 */
@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import(JpaAuditingConfig.class)
class SlipAttachmentRepositoryTest {

    @Autowired
    private SlipAttachmentRepository repository;

    @Autowired
    private org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager entityManager;

    @Test
    void findPhotoAudit_filtersRowsAndProjectsWithoutInternalIds() throws Exception {
        LocalDate slipDate = LocalDate.of(2026, 5, 16);
        Slip activeSlip = persistSlip("2026/05/16-001", slipDate, 1, false);
        Slip deletedSlip = persistSlip("2026/05/16-002", slipDate, 2, true);

        persistAttachment(
                activeSlip,
                SlipAttachmentType.DELIVERY,
                "delivery-active.jpg",
                1024L,
                true,
                LocalDateTime.of(2026, 5, 16, 9, 10),
                "11111111-1111-7111-a111-111111111111",
                LocalDateTime.of(2026, 5, 16, 9, 20),
                false);
        persistAttachment(
                activeSlip,
                SlipAttachmentType.INSPECTION,
                "inspection-excluded.jpg",
                2048L,
                false,
                null,
                "홍길동",
                LocalDateTime.of(2026, 5, 16, 9, 30),
                false);
        persistAttachment(
                activeSlip,
                SlipAttachmentType.DELIVERY,
                "delivery-deleted.jpg",
                512L,
                false,
                null,
                "김삭제",
                LocalDateTime.of(2026, 5, 16, 9, 40),
                true);
        persistAttachment(
                deletedSlip,
                SlipAttachmentType.DELIVERY,
                "deleted-slip.jpg",
                512L,
                false,
                null,
                "김전표",
                LocalDateTime.of(2026, 5, 16, 9, 50),
                false);
        entityManager.clear();

        Page<SlipPhotoAuditResponse> result = repository.findPhotoAudit(
                SlipAttachmentType.DELIVERY,
                slipDate,
                slipDate,
                "2026/05/16",
                PageRequest.of(0, 10));

        assertThat(result.getContent()).hasSize(1);
        SlipPhotoAuditResponse row = result.getContent().get(0);
        assertThat(row.slipNo()).isEqualTo("2026/05/16-001");
        assertThat(row.slipDate()).isEqualTo(slipDate);
        assertThat(row.partnerName()).isEqualTo("삼한상사");
        assertThat(row.attachmentType()).isEqualTo(SlipAttachmentType.DELIVERY);
        assertThat(row.fileName()).isEqualTo("delivery-active.jpg");
        assertThat(row.hasGps()).isTrue();
        assertThat(row.uploadedBy()).isEqualTo("업로더 확인 필요");

        String json = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .writeValueAsString(row);
        assertThat(json).doesNotContain("attachmentId");
        assertThat(json).doesNotContain("slipId");
        assertThat(json).doesNotContain("downloadUrl");
        assertThat(json).doesNotContain("storage.example");
        assertThat(json).doesNotContain("11111111-1111-7111-a111-111111111111");
    }

    private Slip persistSlip(String slipNo, LocalDate slipDate, int seqNo, boolean deleted) {
        Slip slip = Slip.createOutbound(
                slipNo,
                slipDate,
                seqNo,
                UUID.randomUUID(),
                null,
                UUID.randomUUID(),
                "삼한상사",
                null,
                "사진 감사 테스트",
                "tester");
        if (deleted) {
            slip.markDeleted("tester");
        }
        return entityManager.persistAndFlush(slip);
    }

    private void persistAttachment(
            Slip slip,
            SlipAttachmentType type,
            String fileName,
            long fileSize,
            boolean hasGps,
            LocalDateTime capturedAt,
            String uploadedBy,
            LocalDateTime uploadedAt,
            boolean deleted) {
        BigDecimal lat = hasGps ? new BigDecimal("37.5665000") : null;
        BigDecimal lng = hasGps ? new BigDecimal("126.9780000") : null;
        SlipAttachment attachment = SlipAttachment.register(
                slip.getId(),
                type,
                fileName,
                fileSize,
                "image/jpeg",
                "slip-attachments/" + fileName,
                lat,
                lng,
                capturedAt,
                uploadedBy);
        attachment.refreshStorageUrl("https://storage.example/" + fileName + "?X-Amz-Signature=secret");
        ReflectionTestUtils.setField(attachment, "uploadedAt", uploadedAt);
        if (deleted) {
            attachment.softDelete("tester");
        }
        entityManager.persistAndFlush(attachment);
    }
}
