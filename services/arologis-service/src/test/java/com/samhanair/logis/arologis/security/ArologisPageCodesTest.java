package com.samhanair.logis.arologis.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.arologis.web.ReceivedDispatchGroupController;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.RestController;

/**
 * 아로로지스 page-code 상수와 컨트롤러 권한 가드의 정합성 테스트.
 *
 * <p>auth-service PageCode enum 에 의존하지 않고도 {@code @RequirePermission.page()} 오타와
 * 상수 누락을 arologis-service 단위에서 차단한다.
 */
class ArologisPageCodesTest {

    private static final Pattern PAGE_CODE_PATTERN = Pattern.compile("^arologis\\.[a-z0-9.-]+$");
    private static final Path AUTH_SERVICE_PAGE_CODE_ENUM_PATH =
            Path.of("../auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java");
    private static final Pattern AUTH_SERVICE_PAGE_CODE_ENUM_PATTERN =
            Pattern.compile("^\\s*[A-Z0-9_]+\\s*\\(\\s*\"([a-z0-9.-]+)\"\\s*,", Pattern.MULTILINE);
    private static final Pattern REQUIRE_PERMISSION_LITERAL_PATTERN =
            Pattern.compile("^\\s*@RequirePermission\\s*\\([\\s\\S]*?page\\s*=\\s*\"", Pattern.MULTILINE);

    @Test
    void constants_match_arologis_page_code_format() {
        assertThat(pageCodeConstants())
                .allSatisfy(pageCode -> assertThat(pageCode).matches(PAGE_CODE_PATTERN));
    }

    @Test
    void constants_are_unique() {
        List<String> values = pageCodeConstantValues();
        Set<String> constants = Set.copyOf(values);

        assertThat(constants).hasSameSizeAs(values);
    }

    @Test
    void controller_require_permission_pages_match_constants() {
        assertThat(controllerRequirePermissionPages())
                .isEqualTo(pageCodeConstants());
    }

    @Test
    void constants_exist_in_auth_service_page_code_enum() {
        Set<String> authServicePageCodes = authServicePageCodes();
        Set<String> arologisPageCodes = pageCodeConstants();

        assertThat(authServicePageCodes)
                .as("auth-service PageCode.java에서 page-code를 0건 추출했습니다. enum 생성자 포맷 변경 여부를 확인하세요: %s",
                        AUTH_SERVICE_PAGE_CODE_ENUM_PATH.toAbsolutePath().normalize())
                .isNotEmpty();
        assertThat(arologisPageCodes)
                .as("ArologisPageCodes 상수값이 비어 있습니다.")
                .isNotEmpty();
        assertThat(authServicePageCodes)
                .as("ArologisPageCodes 상수값은 모두 auth-service PageCode enum에 등록되어야 합니다.")
                .containsAll(arologisPageCodes);
    }

    @Test
    void controllers_do_not_use_inline_require_permission_page_literals() throws IOException {
        try (Stream<Path> files = Files.walk(Path.of("src/main/java/com/samhanair/logis/arologis"))) {
            assertThat(files
                    .filter(path -> path.toString().endsWith(".java"))
                    .filter(ArologisPageCodesTest::containsInlineRequirePermissionPageLiteral)
                    .map(Path::toString)
                    .toList())
                    .isEmpty();
        }
    }

    @Test
    void received_dispatch_group_list_requires_dispatch_ops_view() throws NoSuchMethodException {
        RequirePermission permission = ReceivedDispatchGroupController.class
                .getDeclaredMethod("list", java.time.LocalDate.class)
                .getAnnotation(RequirePermission.class);

        assertThat(permission).isNotNull();
        assertThat(permission.page()).isEqualTo(ArologisPageCodes.DISPATCH_OPS);
        assertThat(permission.action()).isEqualTo(com.samhanair.logis.security.permission.PermissionAction.VIEW);
    }

    private static boolean containsInlineRequirePermissionPageLiteral(Path path) {
        try {
            return REQUIRE_PERMISSION_LITERAL_PATTERN.matcher(Files.readString(path)).find();
        } catch (IOException ex) {
            throw new IllegalStateException("아로로지스 컨트롤러 소스 읽기 실패: " + path, ex);
        }
    }

    private static Set<String> pageCodeConstants() {
        return pageCodeConstantValues().stream().collect(Collectors.toUnmodifiableSet());
    }

    private static List<String> pageCodeConstantValues() {
        return Arrays.stream(ArologisPageCodes.class.getFields())
                .filter(ArologisPageCodesTest::isPublicStaticFinalString)
                .map(ArologisPageCodesTest::getStringValue)
                .toList();
    }

    private static boolean isPublicStaticFinalString(Field field) {
        int modifiers = field.getModifiers();
        return field.getType().equals(String.class)
                && Modifier.isPublic(modifiers)
                && Modifier.isStatic(modifiers)
                && Modifier.isFinal(modifiers);
    }

    private static String getStringValue(Field field) {
        try {
            return (String) field.get(null);
        } catch (IllegalAccessException ex) {
            throw new IllegalStateException("아로로지스 page-code 상수 읽기 실패: " + field.getName(), ex);
        }
    }

    private static Set<String> authServicePageCodes() {
        Path path = AUTH_SERVICE_PAGE_CODE_ENUM_PATH.toAbsolutePath().normalize();
        if (!Files.exists(path)) {
            throw new IllegalStateException("auth-service PageCode enum 파일을 찾을 수 없습니다: " + path
                    + " (services/arologis-service 기준 ../auth-service sibling 경로를 확인하세요)");
        }

        try {
            String source = Files.readString(path);
            return AUTH_SERVICE_PAGE_CODE_ENUM_PATTERN.matcher(source).results()
                    .map(match -> match.group(1))
                    .collect(Collectors.toUnmodifiableSet());
        } catch (IOException ex) {
            throw new IllegalStateException("auth-service PageCode enum 파일 읽기 실패: " + path, ex);
        }
    }

    private static Set<String> controllerRequirePermissionPages() {
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));

        return scanner.findCandidateComponents("com.samhanair.logis.arologis").stream()
                .map(beanDefinition -> beanDefinition.getBeanClassName())
                .map(ArologisPageCodesTest::loadClass)
                .flatMap(controller -> Arrays.stream(controller.getDeclaredMethods()))
                .map(ArologisPageCodesTest::findRequirePermission)
                .filter(java.util.Optional::isPresent)
                .map(java.util.Optional::get)
                .map(RequirePermission::page)
                .collect(Collectors.toUnmodifiableSet());
    }

    private static Class<?> loadClass(String className) {
        try {
            return Class.forName(className);
        } catch (ClassNotFoundException ex) {
            throw new IllegalStateException("아로로지스 컨트롤러 로드 실패: " + className, ex);
        }
    }

    private static java.util.Optional<RequirePermission> findRequirePermission(Method method) {
        return java.util.Optional.ofNullable(method.getAnnotation(RequirePermission.class));
    }
}
