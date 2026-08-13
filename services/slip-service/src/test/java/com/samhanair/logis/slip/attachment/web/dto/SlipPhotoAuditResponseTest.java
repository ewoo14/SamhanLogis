package com.samhanair.logis.slip.attachment.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

class SlipPhotoAuditResponseTest {

    @Test
    void constructor_hidesUnicodeUuidUploaderAndLocalizesSystem() {
        SlipPhotoAuditResponse uuidRow = new SlipPhotoAuditResponse(
                "2026/08/12-1", LocalDate.of(2026, 8, 12), "거래처",
                SlipAttachmentType.DELIVERY, "photo.jpg", 1L, "image/jpeg", false,
                null, "\u2063cafebabe-cafe-babe-cafe-babecafebabe\u2063", LocalDateTime.now());
        SlipPhotoAuditResponse systemRow = new SlipPhotoAuditResponse(
                "2026/08/12-2", LocalDate.of(2026, 8, 12), "거래처",
                SlipAttachmentType.DELIVERY, "photo.jpg", 1L, "image/jpeg", false,
                null, "system", LocalDateTime.now());

        assertThat(uuidRow.uploadedBy()).isEqualTo("업로더 확인 필요");
        assertThat(systemRow.uploadedBy()).isEqualTo("시스템");
    }
}
