package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.groupware.domain.DocumentPayload;
import com.samhanair.logis.groupware.domain.DocumentTemplate;
import com.samhanair.logis.groupware.repository.DocumentTemplateRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** 자동 업데이트 선행 전 DETAIL/IMAGE 활성화 게이트 단위 테스트. */
class DocumentTemplateServiceTest {

    @Test
    void activate_advancedTemplate_isBlockedByBackendGate() {
        DocumentTemplateRepository repository = mock(DocumentTemplateRepository.class);
        DocumentTemplateRevisionService revisionService = mock(DocumentTemplateRevisionService.class);
        DocumentPayloadValidator validator = mock(DocumentPayloadValidator.class);
        ObjectMapper objectMapper = new ObjectMapper();
        UUID id = UUID.randomUUID();
        DocumentTemplate template = DocumentTemplate.create(
                "GROUPWARE_EXPENSE_REPORT", "DETAIL 양식", (short) 2, advancedPayload());
        when(repository.findById(id)).thenReturn(Optional.of(template));
        when(validator.validate(any(Short.class), any(com.fasterxml.jackson.databind.JsonNode.class))).thenReturn(advancedPayload());
        when(validator.containsActivationBlockedElements(any(DocumentPayload.class))).thenReturn(true);

        DocumentTemplateService service = new DocumentTemplateService(repository, revisionService, validator, objectMapper);

        assertThatThrownBy(() -> service.activate(id, "qa"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("자동 업데이트")
                .hasMessageContaining("DETAIL/IMAGE");
        verify(repository).findById(id);
    }

    @Test
    void activate_legacyTemplate_isNotBlockedByAdvancedGate() {
        DocumentTemplateRepository repository = mock(DocumentTemplateRepository.class);
        DocumentTemplateRevisionService revisionService = mock(DocumentTemplateRevisionService.class);
        DocumentPayloadValidator validator = mock(DocumentPayloadValidator.class);
        ObjectMapper objectMapper = new ObjectMapper();
        UUID id = UUID.randomUUID();
        DocumentTemplate template = DocumentTemplate.create(
                "GROUPWARE_EXPENSE_REPORT", "기존 양식", (short) 1, legacyPayload());
        when(repository.findById(id)).thenReturn(Optional.of(template), Optional.of(template));
        when(validator.validate(any(Short.class), any(com.fasterxml.jackson.databind.JsonNode.class))).thenReturn(legacyPayload());
        when(validator.containsActivationBlockedElements(any(DocumentPayload.class))).thenReturn(false);

        DocumentTemplateService service = new DocumentTemplateService(repository, revisionService, validator, objectMapper);

        service.activate(id, "qa");

        verify(repository).demoteOtherActive(eq("GROUPWARE_EXPENSE_REPORT"), eq(id), any(), any());
    }

    private static DocumentPayload advancedPayload() {
        return new DocumentPayload("A4_PORTRAIT", List.of(
                new DocumentPayload.Band("header", "HEADER", List.of(
                        new DocumentPayload.Element("title", "TITLE"),
                        new DocumentPayload.Element("approval", "APPROVAL_GRID"))),
                new DocumentPayload.Band("body", "BODY", List.of(
                        new DocumentPayload.Element("detail", "DETAIL", null, null, null, null,
                                "body.lineItems", List.of("productName"), null, null))),
                new DocumentPayload.Band("footer", "FOOTER", List.of(
                        new DocumentPayload.Element("closing", "CLOSING")))));
    }

    private static DocumentPayload legacyPayload() {
        return new DocumentPayload("A4_PORTRAIT", List.of(
                new DocumentPayload.Band("header", "HEADER", List.of(
                        new DocumentPayload.Element("title", "TITLE"),
                        new DocumentPayload.Element("approval", "APPROVAL_GRID"))),
                new DocumentPayload.Band("body", "BODY", List.of()),
                new DocumentPayload.Band("footer", "FOOTER", List.of(
                        new DocumentPayload.Element("closing", "CLOSING")))));
    }
}
