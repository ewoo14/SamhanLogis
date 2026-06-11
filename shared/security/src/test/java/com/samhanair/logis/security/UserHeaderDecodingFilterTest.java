package com.samhanair.logis.security;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.FilterChain;
import java.util.Collections;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * X-User-Name inbound 헤더 중앙 디코딩 필터 회귀 테스트.
 *
 * <p>X-User-Department 는 기존 소비처 디코딩과의 이중 디코딩을 피하기 위해 건드리지 않는다.
 */
class UserHeaderDecodingFilterTest {

    @Test
    void encodedUserNameHeader_isDecodedForDownstreamConsumers() throws Exception {
        UserHeaderDecodingFilter filter = new UserHeaderDecodingFilter();
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/slips");
        req.addHeader("X-User-Name", "%ED%99%8D%EA%B8%B8%EB%8F%99");
        MockHttpServletResponse res = new MockHttpServletResponse();
        CapturingChain chain = new CapturingChain();

        filter.doFilter(req, res, chain);

        assertThat(chain.userName()).isEqualTo("홍길동");
        assertThat(Collections.list(chain.request.getHeaders("X-User-Name"))).containsExactly("홍길동");
    }

    @Test
    void plainUserNameHeaderWithoutEncodedMarkers_preservesOriginalValue() throws Exception {
        UserHeaderDecodingFilter filter = new UserHeaderDecodingFilter();
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/slips");
        req.addHeader("X-User-Name", "Hong Gil Dong");
        MockHttpServletResponse res = new MockHttpServletResponse();
        CapturingChain chain = new CapturingChain();

        filter.doFilter(req, res, chain);

        assertThat(chain.userName()).isEqualTo("Hong Gil Dong");
    }

    @Test
    void invalidEncodedUserNameHeader_preservesOriginalValue() throws Exception {
        UserHeaderDecodingFilter filter = new UserHeaderDecodingFilter();
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/slips");
        req.addHeader("X-User-Name", "%ED%");
        MockHttpServletResponse res = new MockHttpServletResponse();
        CapturingChain chain = new CapturingChain();

        filter.doFilter(req, res, chain);

        assertThat(chain.userName()).isEqualTo("%ED%");
    }

    @Test
    void departmentHeader_isNotDecodedToAvoidDoubleDecode() throws Exception {
        UserHeaderDecodingFilter filter = new UserHeaderDecodingFilter();
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/slips");
        req.addHeader("X-User-Name", "%ED%99%8D%EA%B8%B8%EB%8F%99");
        req.addHeader("X-User-Department", "%EB%8C%80%ED%91%9C%EC%8B%A4");
        MockHttpServletResponse res = new MockHttpServletResponse();
        CapturingChain chain = new CapturingChain();

        filter.doFilter(req, res, chain);

        assertThat(chain.request.getHeader("X-User-Name")).isEqualTo("홍길동");
        assertThat(chain.request.getHeader("X-User-Department")).isEqualTo("%EB%8C%80%ED%91%9C%EC%8B%A4");
    }

    private static final class CapturingChain extends MockFilterChain {
        private jakarta.servlet.http.HttpServletRequest request;

        @Override
        public void doFilter(jakarta.servlet.ServletRequest request,
                             jakarta.servlet.ServletResponse response) {
            this.request = (jakarta.servlet.http.HttpServletRequest) request;
        }

        private String userName() {
            return request.getHeader("X-User-Name");
        }
    }
}
