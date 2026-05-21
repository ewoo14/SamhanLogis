package com.samhanair.logis.arologis.parser;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * KakaoDispatchParser 단위 테스트 — Phase 10 W10-1.
 *
 * <p>사용자 제공 카톡 예시 (13 차량 / 약 50 정차) 파싱 정확성 검증. 8 case.
 *
 * <p>case 1: 헤더 추출 (8일착 야상 → DispatchType.NIGHT)
 * <p>case 2: 차량 그룹 분리 (13 차량)
 * <p>case 3: 정차 라인 정규표현식 (전체 정차 추출)
 * <p>case 4: 톤수 인식 (1톤 12 + legacy 1.4톤 1 → active 1톤)
 * <p>case 5: 미해석 라인 ("상일상차" / "초월상차") group label 보존
 * <p>case 6: notes 다양 패턴 ("9시하차" / "오전일찍" / "아침7시" / "9시까지배송요망")
 * <p>case 7: edge case (헤더 누락 → IllegalArgumentException)
 * <p>case 8: 정확도 80% 회귀 검증
 */
class KakaoDispatchParserTest {

    private final KakaoDispatchParser parser = new KakaoDispatchParser();
    private static final LocalDate REFERENCE = LocalDate.of(2026, 5, 1);

    /** 사용자 제공 카톡 예시 (13 차량 — 1톤 12 + 1.4톤 1). */
    private static final String SAMPLE_KAKAO = """
            8일착 야상입니다
            1. 상일+초월
            상일상차
            -인천남동구논현동755-1(하늘시스템-218)9시하차
            초월상차
            -인천 남동구 구월동(에스엠하나공조-214)아침8시
            -인천 서구 봉수대로(대한공조-170)아침9시반
            -경기 부천시 원미구(제이시스템-76)오전일찍
            1톤

            2. -경기 김포시 고촌읍(삼공주에어컨-17)오전일찍
            -경기 김포시 걸포1로(윌리-2)아침
            -인천 동구 화수로(영에어시스템-140)
            -인천 남동구 논현동(하늘시스템-62)아침9시
            1톤

            3. -서울 강남구 삼성동(강남공조-31)8시까지
            -서울 송파구 잠실(잠실시스템-44)9시
            1톤

            4. -서울 영등포구(영등포공조-55)오전일찍
            -서울 구로구(구로에어-66)아침
            1톤

            5. -서울 강서구(강서시스템-77)아침7시
            -경기 부천시(부천공조-88)9시
            1톤

            6. -경기 성남시(성남에어-99)9시까지배송요망
            -경기 수원시(수원공조-100)오전
            1톤

            7. -경기 안양시(안양시스템-111)아침8시
            -경기 군포시(군포공조-122)9시
            1.4톤

            8. -서울 노원구(노원에어-133)아침
            -서울 도봉구(도봉공조-144)9시반
            1톤

            9. -서울 강북구(강북시스템-155)오전일찍
            -서울 성북구(성북공조-166)9시
            1톤

            10. -서울 종로구(종로에어-177)아침7시
            -서울 중구(중구공조-188)8시반
            1톤

            11. -서울 용산구(용산시스템-199)9시
            -서울 마포구(마포공조-200)오전
            1톤

            12. -서울 서대문구(서대문에어-211)아침
            -서울 은평구(은평공조-222)8시
            1톤

            13. -서울 양천구(양천시스템-233)9시
            -서울 강서구(강서공조-244)오전일찍
            1톤
            """;

    @Test
    @DisplayName("case 1 — 헤더 추출 (8일착 야상 → NIGHT + day=8)")
    void parseHeader() {
        ParsedDispatch parsed = parser.parse(SAMPLE_KAKAO, REFERENCE);
        assertThat(parsed.dispatchType()).isEqualTo(DispatchType.NIGHT);
        assertThat(parsed.dispatchDate()).isEqualTo(LocalDate.of(2026, 5, 8));
    }

    @Test
    @DisplayName("case 2 — 차량 그룹 분리 (정확히 13 차량)")
    void splitVehicles() {
        ParsedDispatch parsed = parser.parse(SAMPLE_KAKAO, REFERENCE);
        assertThat(parsed.vehicles()).hasSize(13);
        for (int i = 0; i < 13; i++) {
            assertThat(parsed.vehicles().get(i).sequence()).isEqualTo(i + 1);
        }
    }

    @Test
    @DisplayName("case 3 — 정차 라인 정규표현식 (전체 정차 추출 + kakaoSeq)")
    void parseStops() {
        ParsedDispatch parsed = parser.parse(SAMPLE_KAKAO, REFERENCE);
        // 첫 차량 — 상일상차/초월상차 group label 2 + 정차 4 = 6 element
        ParsedDispatch.ParsedVehicle v1 = parsed.vehicles().get(0);
        assertThat(v1.stops()).hasSize(6);
        // 정차 중 첫 정차 — "(하늘시스템-218)" → kakaoSeq=218 (PR-E 진입 전 선행 R2 — partnerCode → kakaoSeq rename)
        ParsedDispatch.ParsedStop firstStop = v1.stops().stream()
                .filter(s -> !s.unparsed())
                .findFirst()
                .orElseThrow();
        assertThat(firstStop.parsedKakaoSeq()).isEqualTo(218L);
        assertThat(firstStop.parsedPartnerName()).isEqualTo("하늘시스템");
        assertThat(firstStop.parsedAddress()).contains("인천남동구논현동");
        assertThat(firstStop.notes()).contains("9시하차");
    }

    @Test
    @DisplayName("case 4 — 톤수 인식 (legacy 1.4톤은 active 1톤으로 보정)")
    void parseTonnage() {
        ParsedDispatch parsed = parser.parse(SAMPLE_KAKAO, REFERENCE);
        long tonnage1 = parsed.vehicles().stream()
                .filter(v -> v.tonnage() == VehicleTonnage.TONNAGE_1)
                .count();
        assertThat(tonnage1).isEqualTo(13);
        assertThat(parsed.vehicles().get(6).tonnage()).isEqualTo(VehicleTonnage.TONNAGE_1);
    }

    @Test
    @DisplayName("case 5 — 미해석 라인 (상일상차 / 초월상차) unparsed group label 보존")
    void preserveUnparsedLines() {
        ParsedDispatch parsed = parser.parse(SAMPLE_KAKAO, REFERENCE);
        ParsedDispatch.ParsedVehicle v1 = parsed.vehicles().get(0);
        long unparsedCount = v1.stops().stream().filter(ParsedDispatch.ParsedStop::unparsed).count();
        assertThat(unparsedCount).isEqualTo(2L); // 상일상차 + 초월상차
        assertThat(v1.stops().stream().anyMatch(s -> "상일상차".equals(s.rawText()) && s.unparsed())).isTrue();
        assertThat(v1.stops().stream().anyMatch(s -> "초월상차".equals(s.rawText()) && s.unparsed())).isTrue();
    }

    @Test
    @DisplayName("case 6 — notes 다양 패턴 (9시하차/오전일찍/아침7시/9시까지배송요망)")
    void parseDiverseNotes() {
        ParsedDispatch parsed = parser.parse(SAMPLE_KAKAO, REFERENCE);
        // 다양한 notes 가 보존되는지 검증
        boolean has9hHachal = parsed.vehicles().stream()
                .flatMap(v -> v.stops().stream())
                .anyMatch(s -> s.notes() != null && s.notes().contains("9시하차"));
        boolean hasOhjeon = parsed.vehicles().stream()
                .flatMap(v -> v.stops().stream())
                .anyMatch(s -> s.notes() != null && s.notes().contains("오전일찍"));
        boolean hasAchim7 = parsed.vehicles().stream()
                .flatMap(v -> v.stops().stream())
                .anyMatch(s -> s.notes() != null && s.notes().contains("아침7시"));
        boolean has9hRequired = parsed.vehicles().stream()
                .flatMap(v -> v.stops().stream())
                .anyMatch(s -> s.notes() != null && s.notes().contains("9시까지배송요망"));
        assertThat(has9hHachal).isTrue();
        assertThat(hasOhjeon).isTrue();
        assertThat(hasAchim7).isTrue();
        assertThat(has9hRequired).isTrue();
    }

    @Test
    @DisplayName("case 7 — edge case (헤더 누락 시 IllegalArgumentException)")
    void edgeCaseMissingHeader() {
        String malformed = "1. -서울 강남구(강남공조-1)\n1톤";
        assertThatThrownBy(() -> parser.parse(malformed, REFERENCE))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("헤더");
    }

    @Test
    @DisplayName("case 8 — 정확도 80% 회귀 검증")
    void accuracyAtLeast80Percent() {
        ParsedDispatch parsed = parser.parse(SAMPLE_KAKAO, REFERENCE);
        double accuracy = parsed.accuracy();
        assertThat(accuracy).isGreaterThanOrEqualTo(0.80);
        // 정상 정차 라인 합 (unparsed 제외) 약 26+ 개 (2*13 = 26 per vehicle 평균)
        long totalParsedStops = parsed.vehicles().stream()
                .flatMap(v -> v.stops().stream())
                .filter(s -> !s.unparsed() && s.parsedKakaoSeq() != null)
                .count();
        assertThat(totalParsedStops).isGreaterThanOrEqualTo(20L);
    }
}
