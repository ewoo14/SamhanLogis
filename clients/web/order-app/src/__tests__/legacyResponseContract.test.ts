import { describe, expect, it, vi } from 'vitest';
import indexHtml from '../../index.html?raw';

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('matching brace not found');
}

function loadInlineSuccessHandler(
  rpcName: string,
  dependencies: Record<string, unknown> = {},
): (...args: unknown[]) => void {
  const rpcMarker = `.${rpcName}(`;
  const rpcIndex = indexHtml.indexOf(rpcMarker);
  if (rpcIndex < 0) throw new Error(`RPC not found: ${rpcName}`);

  const handlerMarker = '.withSuccessHandler(';
  const handlerIndex = indexHtml.lastIndexOf(handlerMarker, rpcIndex);
  const expressionStart = handlerIndex + handlerMarker.length;
  const arrowIndex = indexHtml.indexOf('=>', expressionStart);
  const bodyStart = indexHtml.indexOf('{', arrowIndex);
  const bodyEnd = findMatchingBrace(indexHtml, bodyStart);
  const source = indexHtml.slice(expressionStart, bodyEnd + 1);
  const names = Object.keys(dependencies);
  return new Function(...names, `return (${source})`)(
    ...names.map((name) => dependencies[name]),
  ) as (...args: unknown[]) => void;
}

function loadInlineFailureHandler(
  rpcName: string,
  dependencies: Record<string, unknown> = {},
): (...args: unknown[]) => void {
  const rpcMarker = `.${rpcName}(`;
  const rpcIndex = indexHtml.indexOf(rpcMarker);
  if (rpcIndex < 0) throw new Error(`RPC not found: ${rpcName}`);

  const handlerMarker = '.withFailureHandler('; 
  const handlerIndex = indexHtml.lastIndexOf(handlerMarker, rpcIndex);
  const chainStart = indexHtml.lastIndexOf('google.script.run', rpcIndex);
  if (handlerIndex < chainStart) return () => {};
  const expressionStart = handlerIndex + handlerMarker.length;
  const arrowIndex = indexHtml.indexOf('=>', expressionStart);
  const bodyStart = indexHtml.indexOf('{', arrowIndex);
  const bodyEnd = findMatchingBrace(indexHtml, bodyStart);
  const source = indexHtml.slice(expressionStart, bodyEnd + 1);
  const names = Object.keys(dependencies);
  return new Function(...names, `return (${source})`)(
    ...names.map((name) => dependencies[name]),
  ) as (...args: unknown[]) => void;
}

function loadNamedHandler(
  name: string,
  dependencies: Record<string, unknown> = {},
): (...args: unknown[]) => void {
  const functionMarker = `function ${name}(`;
  const functionIndex = indexHtml.indexOf(functionMarker);
  const bodyStart = indexHtml.indexOf('{', functionIndex);
  const bodyEnd = findMatchingBrace(indexHtml, bodyStart);
  const source = indexHtml.slice(functionIndex, bodyEnd + 1);
  const names = Object.keys(dependencies);
  return new Function(...names, `${source}; return ${name};`)(
    ...names.map((dependency) => dependencies[dependency]),
  ) as (...args: unknown[]) => void;
}

describe('legacy order-app response contracts', () => {
  // ubuntu-latest 불변: Vite raw import와 순수 JS 콜백 실행만 사용하며 OS 경로 문자열을 가정하지 않는다.
  it('승인요청 PENDING 응답은 접수 완료 모달을 표시한다', () => {
    const showAuthModal = vi.fn();
    const alert = vi.fn();
    const handler = loadInlineSuccessHandler('requestAuthApproval', {
      showLoadingGate: vi.fn(),
      showAuthModal,
      alert,
    });

    handler({ bizNo: '1068689215', status: 'PENDING', message: '가입 신청이 접수되었습니다' });

    expect(showAuthModal).toHaveBeenCalledWith({
      icon: '✅',
      title: '완료',
      msg: '승인요청이 전송되었습니다.\n승인 후 이용 가능합니다.',
      btn: null,
    });
    expect(alert).not.toHaveBeenCalled();
  });

  // ubuntu-latest 불변: 순수 콜백 실행과 문자열 assertion만 사용하며 OS API에 의존하지 않는다.
  it('승인요청 실패 응답은 서버 message를 사용자에게 보여준다', () => {
    const alert = vi.fn();
    const handler = loadInlineSuccessHandler('requestAuthApproval', { showLoadingGate: vi.fn(), alert });

    handler({ status: 'CONFLICT', message: '이미 승인요청 중입니다' });

    expect(alert).toHaveBeenCalledWith('이미 승인요청 중입니다');
  });

  // ubuntu-latest 불변: 순수 콜백 실행과 Axios error response 모양만 사용하며 OS API에 의존하지 않는다.
  it('승인요청 HTTP 409는 서버 message를 보여주고 로딩을 해제한다', () => {
    const alert = vi.fn();
    const showLoadingGate = vi.fn();
    const getRpcFailureMessage = loadNamedHandler('getRpcFailureMessage');
    const handler = loadInlineFailureHandler('requestAuthApproval', {
      showLoadingGate,
      alert,
      getRpcFailureMessage,
    });

    handler({
      response: {
        status: 409,
        data: { success: false, code: 'CONFLICT', message: '이미 가입 신청된 거래처입니다' },
      },
    });

    expect(showLoadingGate).toHaveBeenCalledWith(false);
    expect(alert).toHaveBeenCalledWith('이미 가입 신청된 거래처입니다');
  });

  // ubuntu-latest 불변: 순수 Error 객체와 콜백 assertion만 사용하며 OS API에 의존하지 않는다.
  it('승인요청 네트워크 실패는 한국어 재시도 안내를 보여준다', () => {
    const alert = vi.fn();
    const showLoadingGate = vi.fn();
    const handler = loadInlineFailureHandler('requestAuthApproval', {
      showLoadingGate,
      alert,
      getRpcFailureMessage: loadNamedHandler('getRpcFailureMessage'),
    });

    handler(new Error('Network Error'));

    expect(showLoadingGate).toHaveBeenCalledWith(false);
    expect(alert).toHaveBeenCalledWith(
      '네트워크 연결이 원활하지 않습니다. 인터넷 연결을 확인한 후 다시 시도해주세요.',
    );
  });

  // ubuntu-latest 불변: 순수 콜백 실행과 서버 DTO 필드 assertion만 사용하며 OS API에 의존하지 않는다.
  it('인증 상태의 알 수 없는 상태는 서버 message를 사용자에게 보여준다', () => {
    const alert = vi.fn();
    const handler = loadNamedHandler('onAuthStatus', { showLoadingGate: vi.fn(), showAuthModal: vi.fn(), alert });

    handler({ status: 'UNKNOWN', message: '인증 상태를 확인할 수 없습니다' });

    expect(alert).toHaveBeenCalledWith('인증 상태를 확인할 수 없습니다');
  });

  // ubuntu-latest 불변: 순수 콜백 실행과 result/message assertion만 사용하며 OS API에 의존하지 않는다.
  it('비밀번호 설정 성공 응답은 서버 result를 기준으로 로그인 완료 처리한다', () => {
    const completeLogin = vi.fn();
    const alert = vi.fn();
    const element = { value: '', focus: vi.fn() };
    const handler = loadInlineSuccessHandler('setAuthPassword', {
      showLoadingGate: vi.fn(),
      completeLogin,
      showAuthModal: vi.fn(),
      alert,
      el: () => element,
      AUTH_BIZ: '1068689215',
    });

    handler({ result: 'OK', message: '비밀번호가 설정되었습니다' });

    expect(completeLogin).toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  // ubuntu-latest 불변: 순수 콜백 실행과 Axios error response 모양만 사용하며 OS API에 의존하지 않는다.
  it('비밀번호 설정 HTTP 실패는 서버 message를 보여주고 로딩을 해제한다', () => {
    const alert = vi.fn();
    const showLoadingGate = vi.fn();
    const getRpcFailureMessage = loadNamedHandler('getRpcFailureMessage');
    const handler = loadInlineFailureHandler('setAuthPassword', {
      showLoadingGate,
      alert,
      getRpcFailureMessage,
    });

    handler({
      response: {
        status: 400,
        data: { success: false, code: 'INVALID_INPUT', message: '비밀번호 설정에 실패했습니다' },
      },
    });

    expect(showLoadingGate).toHaveBeenCalledWith(false);
    expect(alert).toHaveBeenCalledWith('비밀번호 설정에 실패했습니다');
  });

  // ubuntu-latest 불변: 순수 Error 객체와 콜백 assertion만 사용하며 OS API에 의존하지 않는다.
  it('비밀번호 설정 네트워크 실패는 한국어 재시도 안내를 보여준다', () => {
    const alert = vi.fn();
    const showLoadingGate = vi.fn();
    const handler = loadInlineFailureHandler('setAuthPassword', {
      showLoadingGate,
      alert,
      getRpcFailureMessage: loadNamedHandler('getRpcFailureMessage'),
    });

    handler(new Error('Network Error'));

    expect(showLoadingGate).toHaveBeenCalledWith(false);
    expect(alert).toHaveBeenCalledWith(
      '네트워크 연결이 원활하지 않습니다. 인터넷 연결을 확인한 후 다시 시도해주세요.',
    );
  });

  // ubuntu-latest 불변: 순수 콜백 실행과 status/message assertion만 사용하며 OS에 의존하지 않는다.
  it('로그인 실패 응답은 서버가 반환한 message를 사용자에게 보여준다', () => {
    const alert = vi.fn();
    const element = { value: '', focus: vi.fn() };
    const handler = loadInlineSuccessHandler('tryLogin', {
      showLoadingGate: vi.fn(),
      completeLogin: vi.fn(),
      showAuthModal: vi.fn(),
      alert,
      el: () => element,
    });

    handler({ status: 'NEED_PW_INPUT', message: '비밀번호가 올바르지 않습니다 (실패 1회)' });

    expect(alert).toHaveBeenCalledWith('비밀번호가 올바르지 않습니다 (실패 1회)');
  });

  // ubuntu-latest 불변: 순수 콜백 실행과 Axios error response 모양만 사용하며 OS API에 의존하지 않는다.
  it('로그인 HTTP 실패는 서버 message를 보여주고 로딩을 해제한다', () => {
    const alert = vi.fn();
    const showLoadingGate = vi.fn();
    const element = { value: '1234', focus: vi.fn() };
    const getRpcFailureMessage = loadNamedHandler('getRpcFailureMessage');
    const handler = loadInlineFailureHandler('tryLogin', {
      showLoadingGate,
      alert,
      el: () => element,
      getRpcFailureMessage,
    });

    handler({
      response: {
        status: 401,
        data: { success: false, code: 'UNAUTHORIZED', message: '로그인에 실패했습니다' },
      },
    });

    expect(showLoadingGate).toHaveBeenCalledWith(false);
    expect(alert).toHaveBeenCalledWith('로그인에 실패했습니다');
    expect(element.value).toBe('');
    expect(element.focus).toHaveBeenCalled();
  });

  // ubuntu-latest 불변: 순수 Error 객체와 콜백 assertion만 사용하며 OS API에 의존하지 않는다.
  it('로그인 네트워크 실패는 한국어 재시도 안내를 보여준다', () => {
    const alert = vi.fn();
    const showLoadingGate = vi.fn();
    const element = { value: '1234', focus: vi.fn() };
    const handler = loadInlineFailureHandler('tryLogin', {
      showLoadingGate,
      alert,
      el: () => element,
      getRpcFailureMessage: loadNamedHandler('getRpcFailureMessage'),
    });

    handler(new Error('Network Error'));

    expect(showLoadingGate).toHaveBeenCalledWith(false);
    expect(alert).toHaveBeenCalledWith(
      '네트워크 연결이 원활하지 않습니다. 인터넷 연결을 확인한 후 다시 시도해주세요.',
    );
  });

  // ubuntu-latest 불변: document 대역 객체와 ISO 문자열만 사용하며 경로·대소문자·OS API에 의존하지 않는다.
  it('사용기한 응답은 서버 expiresAt를 화면에 표시한다', () => {
    const timer = { style: { display: 'none' } };
    const text = { textContent: '' };
    const document = {
      getElementById: (id: string) => (id === 'accessLimitTimer' ? timer : text),
    };
    const handler = loadInlineSuccessHandler('getAccessExpiration', { document });

    handler({ expiresAt: '2026-08-28T12:30:00', expiredAlready: false, remainingDays: 30 });

    expect(timer.style.display).toBe('block');
    expect(text.textContent).toBe('2026-08-28T12:30:00');
  });

  // ubuntu-latest 불변: 서버 DTO의 세 필드 존재 여부만 검증하며 경로·대소문자·OS API에 의존하지 않는다.
  it('튜토리얼 성공 응답은 서버 DTO를 성공으로 처리하고 undefined 오류를 표시하지 않는다', () => {
    const alert = vi.fn();
    const handler = loadInlineSuccessHandler('saveTutorialState', { alert });

    handler({ bizNo: '1068689215', tutorialPcDone: false, tutorialMobileDone: true });

    expect(alert).not.toHaveBeenCalled();
  });
});
