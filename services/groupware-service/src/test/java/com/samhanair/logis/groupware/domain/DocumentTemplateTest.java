package com.samhanair.logis.groupware.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 문서 양식 aggregate의 lifecycle chain 단위 테스트. */
class DocumentTemplateTest {

    private static final DocumentPayload PAYLOAD = new DocumentPayload("A4_PORTRAIT", List.of(
            new DocumentPayload.Band("header", "HEADER", List.of(
                    new DocumentPayload.Element("title", "TITLE"),
                    new DocumentPayload.Element("approval", "APPROVAL_GRID"))),
            new DocumentPayload.Band("footer", "FOOTER", List.of(
                    new DocumentPayload.Element("closing", "CLOSING")))));

    @Test
    void create_accepts_70자_docType_and_rejects_71자_withUpdatedMessage() {
        String atLimit = "D".repeat(70);
        DocumentTemplate template = DocumentTemplate.create(atLimit, "70자 양식", (short) 1, PAYLOAD);

        assertThat(template.getDocType()).hasSize(70);
        assertThatThrownBy(() -> DocumentTemplate.create("D".repeat(71), "71자 양식", (short) 1, PAYLOAD))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("70");
    }

    @Test
    void create_startsAsDraftRevisionOne() {
        DocumentTemplate template = DocumentTemplate.create("GROUPWARE_EXPENSE", "지출 양식", (short) 1, PAYLOAD);

        assertThat(template.getStatus()).isEqualTo(DocumentTemplateStatus.DRAFT);
        assertThat(template.getRevision()).isEqualTo(1);
        assertThat(template.getLockVersion()).isZero();
    }

    @Test
    void draftDocumentUpdate_incrementsRevisionAndActiveUpdateIsRejected() {
        DocumentTemplate template = DocumentTemplate.create("GROUPWARE_EXPENSE", "지출 양식", (short) 1, PAYLOAD);
        template.updateDocument(PAYLOAD);
        assertThat(template.getRevision()).isEqualTo(2);

        template.activate();
        assertThatThrownBy(() -> template.updateDocument(PAYLOAD))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("DRAFT");
    }

    @Test
    void excelDraftUpdate_withoutMode_inheritsExistingModeAndSucceeds() {
        DocumentPayload excelPayload = new DocumentPayload("A4_PORTRAIT", PAYLOAD.bands(), DocumentPayload.EXCEL_MODE);
        DocumentTemplate template = DocumentTemplate.create("GROUPWARE_EXPENSE", "지출 양식", (short) 1, excelPayload);
        DocumentPayload ordinaryUpdate = new DocumentPayload("A4_LANDSCAPE", PAYLOAD.bands());

        template.updateDocument(ordinaryUpdate);

        assertThat(template.getRevision()).isEqualTo(2);
        assertThat(template.getDocument().paper()).isEqualTo("A4_LANDSCAPE");
        assertThat(template.getDocument().mode()).isEqualTo(DocumentPayload.EXCEL_MODE);
    }

    @Test
    void lifecycleMethods_areChainableAndSoftDelete() {
        DocumentTemplate template = DocumentTemplate.create("GROUPWARE_EXPENSE", "지출 양식", (short) 1, PAYLOAD)
                .rename("지출 양식 v2").activate().deactivate().softDelete("tester");

        assertThat(template.getName()).isEqualTo("지출 양식 v2");
        assertThat(template.getStatus()).isEqualTo(DocumentTemplateStatus.DRAFT);
        assertThat(template.getIsDeleted()).isTrue();
    }

    @Test
    void activeRename_isRejectedByTheAggregateGuard() {
        DocumentTemplate template = DocumentTemplate.create("GROUPWARE_EXPENSE", "지출 양식", (short) 1, PAYLOAD)
                .activate();

        assertThatThrownBy(() -> template.rename("활성 양식 변경"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("DRAFT");
    }
}
