package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/** 저장 입구가 BUNDLE 판정을 복제하거나 우회하지 않는다는 소스 계약 게이트. */
class BundleStoragePolicyContractTest {

    private static final Pattern LINE_PRODUCTION_CALL = Pattern.compile(
            "(?:SlipLine\\.create(?:From[A-Za-z]+)?|slip\\.addLine)\\s*\\(");

    @Test
    void 매출과_매입_전체수정은_공통정책을_호출한다() throws Exception {
        assertThat(source("SalesSlipUpdateService.java"))
                .containsAnyOf("BundleModePolicy.shouldExpand", "BundleModePolicy::shouldExpand");
        assertThat(source("SlipUpdateService.java"))
                .containsAnyOf("BundleModePolicy.shouldExpand", "BundleModePolicy::shouldExpand");
    }

    @Test
    void 제품요약으로_새_전표라인을_만드는_모든_생산파일은_정책을_호출한다() throws Exception {
        Path root = Path.of("src/main/java");
        List<Path> offenders = Files.walk(root)
                .filter(Files::isRegularFile)
                .filter(path -> path.toString().endsWith(".java"))
                .filter(path -> {
                    try {
                        String text = Files.readString(path);
                        return LINE_PRODUCTION_CALL.matcher(text).find()
                                && !text.contains("BundleModePolicy.shouldExpand")
                                && !text.contains("BundleModePolicy::shouldExpand")
                                && !Set.of("BundleModePolicy.java", "SlipLine.java", "Slip.java", "SlipSeeder.java")
                                        .contains(path.getFileName().toString());
                    } catch (Exception e) {
                        throw new AssertionError("저장 경로 계약 파일을 읽지 못했습니다: " + path, e);
                    }
                })
                .toList();
        assertThat(offenders).as("제품 요약을 사용하는 저장 입구는 BundleModePolicy를 거쳐야 합니다")
                .isEmpty();
    }

    private static String source(String fileName) throws Exception {
        return Files.readString(Path.of("src/main/java/com/samhanair/logis/slip/service", fileName));
    }
}
