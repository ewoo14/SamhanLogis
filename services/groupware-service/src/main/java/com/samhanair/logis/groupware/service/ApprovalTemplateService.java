package com.samhanair.logis.groupware.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.domain.ApprovalFieldType;
import com.samhanair.logis.groupware.domain.ApprovalTemplate;
import com.samhanair.logis.groupware.domain.ApprovalTemplateField;
import com.samhanair.logis.groupware.dto.ApprovalTemplateRequest;
import com.samhanair.logis.groupware.dto.ApprovalTemplateResponse;
import com.samhanair.logis.groupware.repository.ApprovalTemplateFieldRepository;
import com.samhanair.logis.groupware.repository.ApprovalTemplateRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 결재유형 템플릿 관리와 동적 필드 스키마 검증 서비스.
 *
 * <p>템플릿 fields 는 replace-set 으로 갱신하되 기존 행은 soft-delete 하고 신규 스키마 행을 추가한다.
 * 결재 생성과 collab field overlay 는 모두 본 서비스의 검증 헬퍼를 공유한다.
 */
@Service
@RequiredArgsConstructor
public class ApprovalTemplateService {

    private static final TypeReference<Map<String, String>> STRING_MAP_TYPE = new TypeReference<>() { };

    private final ApprovalTemplateRepository templateRepository;
    private final ApprovalTemplateFieldRepository fieldRepository;
    private final ObjectMapper objectMapper;

    /** 관리자 템플릿 목록 조회. */
    @Transactional(readOnly = true)
    public List<ApprovalTemplateResponse> findAll() {
        return templateRepository.findAllByOrderByDisplayOrderAscNameAsc().stream()
                .map(this::toResponse)
                .toList();
    }

    /** 사용자 작성용 활성 템플릿 목록 조회. */
    @Transactional(readOnly = true)
    public List<ApprovalTemplateResponse> findActive() {
        return templateRepository.findAllByActiveTrueOrderByDisplayOrderAscNameAsc().stream()
                .map(this::toResponse)
                .toList();
    }

    /** 템플릿 단건 조회. */
    @Transactional(readOnly = true)
    public ApprovalTemplateResponse findResponse(UUID templateId) {
        return toResponse(loadTemplate(templateId));
    }

    /** 템플릿 생성. */
    @Transactional
    public ApprovalTemplateResponse create(ApprovalTemplateRequest request) {
        if (templateRepository.findByCode(request.code()).isPresent()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 존재하는 결재유형 code 입니다: " + request.code());
        }
        ApprovalTemplate template = templateRepository.save(ApprovalTemplate.create(
                request.code(), request.name(), request.description(), request.active(), request.displayOrder()));
        replaceFields(template, request.fields(), "system");
        return toResponse(template);
    }

    /** 템플릿 + fields 전체 교체. */
    @Transactional
    public ApprovalTemplateResponse update(UUID templateId, ApprovalTemplateRequest request) {
        ApprovalTemplate template = loadTemplate(templateId);
        if (!template.getCode().equals(request.code())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "결재유형 code 는 수정할 수 없습니다: " + template.getCode());
        }
        template.rename(request.name())
                .updateDescription(request.description())
                .reorder(request.displayOrder());
        if (request.active()) {
            template.activate();
        } else {
            template.deactivate();
        }
        replaceFields(template, request.fields(), "system");
        return toResponse(template);
    }

    /** 템플릿 soft-delete. */
    @Transactional
    public void delete(UUID templateId, String actor) {
        ApprovalTemplate template = loadTemplate(templateId);
        fieldRepository.findAllByTemplateIdOrderByDisplayOrderAscFieldKeyAsc(templateId)
                .forEach(field -> field.softDelete(actor));
        fieldRepository.flush();
        template.deactivate().softDelete(actor);
    }

    /**
     * 템플릿 fieldValues 를 검증하고 정규화된 map 을 반환한다.
     *
     * @param templateId 활성 템플릿 UUID
     * @param values 입력값
     * @return 정의된 key 만 포함한 정규화 map
     */
    @Transactional(readOnly = true)
    public Map<String, String> validateFieldValues(UUID templateId, Map<String, String> values) {
        ApprovalTemplate template = loadTemplate(templateId);
        if (!template.isActive()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "비활성 결재유형은 사용할 수 없습니다: " + templateId);
        }
        return validateAgainstFields(loadFields(templateId), values == null ? Map.of() : values);
    }

    /** 단일 collab field overlay 값을 검증한다. */
    @Transactional(readOnly = true)
    public void validateSingleFieldValue(UUID templateId, String fieldKey, String value) {
        ApprovalTemplate template = loadTemplate(templateId);
        if (!template.isActive()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "비활성 결재유형은 수정할 수 없습니다: " + templateId);
        }
        ApprovalTemplateField field = loadFields(templateId).stream()
                .filter(candidate -> candidate.getFieldKey().equals(fieldKey))
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT,
                        "템플릿에 정의되지 않은 fieldKey 입니다: " + fieldKey));
        validateValue(field, value);
    }

    /** 템플릿에 fieldKey 가 정의되어 있는지 검증한다. */
    @Transactional(readOnly = true)
    public void validateFieldKey(UUID templateId, String fieldKey) {
        loadTemplate(templateId);
        boolean exists = loadFields(templateId).stream()
                .anyMatch(field -> field.getFieldKey().equals(fieldKey));
        if (!exists) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "템플릿에 정의되지 않은 fieldKey 입니다: " + fieldKey);
        }
    }

    /** fieldValues JSON 을 map 으로 역직렬화한다. */
    public Map<String, String> readFieldValues(String fieldValuesJson) {
        if (fieldValuesJson == null || fieldValuesJson.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return new LinkedHashMap<>(objectMapper.readValue(fieldValuesJson, STRING_MAP_TYPE));
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "결재 fieldValues 역직렬화 실패");
        }
    }

    /** fieldValues map 을 JSON 으로 직렬화한다. */
    public String writeFieldValues(Map<String, String> fieldValues) {
        try {
            return objectMapper.writeValueAsString(fieldValues == null ? Map.of() : fieldValues);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "결재 fieldValues 직렬화 실패");
        }
    }

    /** 템플릿 이름을 조회한다. */
    @Transactional(readOnly = true)
    public String findTemplateNameOrNull(UUID templateId) {
        if (templateId == null) {
            return null;
        }
        return templateRepository.findById(templateId)
                .map(ApprovalTemplate::getName)
                .orElse(null);
    }

    /** 템플릿 code 를 조회한다. 중앙 결재라인 documentType 파생에 사용한다. */
    @Transactional(readOnly = true)
    public String findTemplateCodeOrNull(UUID templateId) {
        if (templateId == null) {
            return null;
        }
        return templateRepository.findById(templateId)
                .map(ApprovalTemplate::getCode)
                .orElse(null);
    }

    private ApprovalTemplateResponse toResponse(ApprovalTemplate template) {
        return ApprovalTemplateResponse.from(template, loadFields(template.getId()));
    }

    private ApprovalTemplate loadTemplate(UUID templateId) {
        if (templateId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결재유형 templateId 는 필수입니다");
        }
        return templateRepository.findById(templateId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "결재유형 템플릿을 찾을 수 없습니다: " + templateId));
    }

    private List<ApprovalTemplateField> loadFields(UUID templateId) {
        return fieldRepository.findAllByTemplateIdOrderByDisplayOrderAscFieldKeyAsc(templateId);
    }

    private void replaceFields(ApprovalTemplate template, List<ApprovalTemplateRequest.Field> fields, String actor) {
        fieldRepository.findAllByTemplateIdOrderByDisplayOrderAscFieldKeyAsc(template.getId())
                .forEach(field -> field.softDelete(actor));
        fieldRepository.flush();
        validateFieldDefinitions(fields == null ? List.of() : fields);
        if (fields == null || fields.isEmpty()) {
            return;
        }
        List<ApprovalTemplateField> newFields = fields.stream()
                .map(field -> ApprovalTemplateField.create(template, field.fieldKey(), field.label(),
                        field.fieldType(), field.required(), field.displayOrder(),
                        normalizeOptions(field), field.placeholder()))
                .toList();
        fieldRepository.saveAll(newFields);
    }

    private void validateFieldDefinitions(List<ApprovalTemplateRequest.Field> fields) {
        Set<String> keys = new HashSet<>();
        for (ApprovalTemplateRequest.Field field : fields) {
            if (!keys.add(field.fieldKey())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "중복 fieldKey 입니다: " + field.fieldKey());
            }
            if (field.fieldType() == ApprovalFieldType.SELECT) {
                parseOptions(field.optionsJson(), field.fieldKey());
            }
        }
    }

    private String normalizeOptions(ApprovalTemplateRequest.Field field) {
        if (field.fieldType() != ApprovalFieldType.SELECT) {
            return null;
        }
        List<String> options = parseOptions(field.optionsJson(), field.fieldKey());
        try {
            return objectMapper.writeValueAsString(options);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "SELECT optionsJson 을 저장할 수 없습니다: " + field.fieldKey());
        }
    }

    private Map<String, String> validateAgainstFields(List<ApprovalTemplateField> fields, Map<String, String> values) {
        Map<String, ApprovalTemplateField> schema = new LinkedHashMap<>();
        fields.forEach(field -> schema.put(field.getFieldKey(), field));
        for (String key : values.keySet()) {
            if (!schema.containsKey(key)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "템플릿에 정의되지 않은 fieldKey 입니다: " + key);
            }
        }
        Map<String, String> normalized = new LinkedHashMap<>();
        for (ApprovalTemplateField field : fields) {
            String value = values.get(field.getFieldKey());
            validateValue(field, value);
            if (value != null && !value.isBlank()) {
                normalized.put(field.getFieldKey(), value.trim());
            }
        }
        return normalized;
    }

    private void validateValue(ApprovalTemplateField field, String value) {
        if (value == null || value.isBlank()) {
            if (field.isRequired()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "필수 결재 필드가 누락되었습니다: " + field.getFieldKey());
            }
            return;
        }
        String trimmed = value.trim();
        if (field.getFieldType() == ApprovalFieldType.NUMBER) {
            try {
                new BigDecimal(trimmed);
            } catch (NumberFormatException ex) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "숫자 필드 값이 올바르지 않습니다: " + field.getFieldKey());
            }
        } else if (field.getFieldType() == ApprovalFieldType.DATE) {
            try {
                LocalDate.parse(trimmed);
            } catch (DateTimeParseException ex) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "날짜 필드는 yyyy-MM-dd 형식이어야 합니다: " + field.getFieldKey());
            }
        } else if (field.getFieldType() == ApprovalFieldType.SELECT) {
            List<String> options = parseOptions(field.getOptionsJson(), field.getFieldKey());
            if (!options.contains(trimmed)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "SELECT 옵션에 없는 값입니다: " + field.getFieldKey());
            }
        }
    }

    private List<String> parseOptions(String optionsJson, String fieldKey) {
        if (optionsJson == null || optionsJson.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "SELECT 필드는 optionsJson 이 필요합니다: " + fieldKey);
        }
        try {
            JsonNode node = objectMapper.readTree(optionsJson);
            if (!node.isArray() || node.isEmpty()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "SELECT optionsJson 은 비어 있지 않은 JSON 배열이어야 합니다: " + fieldKey);
            }
            java.util.ArrayList<String> options = new java.util.ArrayList<>();
            for (JsonNode item : node) {
                if (!item.isTextual() || item.asText().isBlank()) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT,
                            "SELECT optionsJson 항목은 문자열이어야 합니다: " + fieldKey);
                }
                options.add(item.asText());
            }
            return options;
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "SELECT optionsJson 형식이 올바르지 않습니다: " + fieldKey);
        }
    }
}
