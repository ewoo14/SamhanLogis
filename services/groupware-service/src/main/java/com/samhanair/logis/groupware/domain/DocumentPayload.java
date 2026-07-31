package com.samhanair.logis.groupware.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** 영속 문서 레이아웃 JSONB payload. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DocumentPayload(
        String paper,
        List<Band> bands,
        /** 생성 후 변경하지 않는 문서 양식 저작 방식. 누락된 legacy payload는 WORD로 해석한다. */
        String mode
) {

    public static final String WORD_MODE = "WORD";
    public static final String EXCEL_MODE = "EXCEL";

    /** 기존 mode 없는 호출부와 legacy fixture의 생성 시그니처를 보존한다. */
    public DocumentPayload(String paper, List<Band> bands) {
        this(paper, bands, null);
    }

    /** 정확한 두 mode 외의 값은 안전한 legacy 방식으로 수렴한다. */
    public static String normalizeMode(String value) {
        return EXCEL_MODE.equals(value) ? EXCEL_MODE : WORD_MODE;
    }

    /** 저장 payload가 mode를 생략해도 런타임 판정은 항상 명시적인 방식으로 반환한다. */
    public String normalizedMode() {
        return normalizeMode(mode);
    }

    /** 문서의 band 구조. */
    public record Band(
            String key,
            String kind,
            List<Element> elements
    ) {
    }

    /** band 안에 배치되는 renderer element. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Element(
            String key,
            String type,
            Geometry geometry,
            Style style,
            String binding,
            String text,
            String repeatBinding,
            List<String> columns,
            String src,
            String alt
    ) {
        /** v1 레거시 요소를 생성하는 호환 생성자. */
        public Element(String key, String type) {
            this(key, type, null, null, null, null, null, null, null, null);
        }

        /** 기존 v2 FIELD/TEXT 테스트와 호출부를 보존하는 호환 생성자. */
        public Element(String key, String type, Geometry geometry, Style style, String binding, String text) {
            this(key, type, geometry, style, binding, text, null, null, null, null);
        }
    }

    /**
     * v2 편집 요소의 밴드 상대 백분율 geometry.
     *
     * <p>🔴 BLOCKING-1: 이 record에 {@code @JsonInclude(NON_NULL)}이 없으면, 부분 지정된 값(예:
     * {@code style}의 fontSize만 지정)이 Java 객체를 거쳐 재직렬화될 때(JSONB 저장·activate 재검증·API
     * 응답) 나머지 필드가 명시적 {@code null}로 채워진다. FE parser({@code value.foo !== undefined})와
     * BE {@link DocumentPayloadValidator}({@code node.has(key)}) 는 둘 다 "값이 있는데 null"과 "값이
     * 없음"을 구분하지 못해 존재하지만 유효하지 않은 값으로 거부한다 — 저장은 201로 성공하지만 재열람(GET)과
     * activate() 재검증이 동일 payload를 거부하는 모순이 발생했다.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Geometry(
            Double x,
            Double y,
            Double w,
            Double h
    ) {
    }

    /** 자유 CSS를 허용하지 않는 v2 style 화이트리스트. 부분 지정 null 소거는 {@link Geometry} 문서 참고. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Style(
            Double fontSize,
            Boolean bold,
            String align,
            Boolean border
    ) {
    }
}
