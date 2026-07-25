(function () {
  'use strict';

  var config = window.__SAMHAN_VERSION_GATE_CONFIG__;
  if (!config) return;

  function buildUrl() {
    var base = String(config.apiBaseUrl || '').replace(/\/+$/, '');
    var params = new URLSearchParams({ clientType: config.clientType, currentVersion: config.currentVersion });
    return base + '/app/version?' + params.toString();
  }

  function storageMap(storage) {
    var values = new Map();
    try {
      for (var index = 0; index < storage.length; index += 1) {
        var key = storage.key(index);
        if (key) values.set(key, storage.getItem(key) || '');
      }
    } catch (error) {
      return values;
    }
    return values;
  }

  function resolveState(versionInfo) {
    var local = readStorageMap('localStorage');
    var session = readStorageMap('sessionStorage');
    if (versionInfo.forceLevel === 'CRITICAL') return { kind: 'blocking', info: versionInfo };
    if (versionInfo.forceLevel === 'MAJOR') {
      var majorKey = 'samhan.app-version.session-dismissed.' + config.clientType + '.' + versionInfo.latestVersion;
      return session.get(majorKey) === 'true' ? { kind: 'none' } : { kind: 'recommend', info: versionInfo, key: majorKey };
    }
    if (versionInfo.forceLevel === 'MINOR') {
      var minorKey = 'samhan.app-version.dismissed.' + config.clientType + '.' + versionInfo.latestVersion;
      return local.get(minorKey) === 'true' ? { kind: 'none' } : { kind: 'minor', info: versionInfo, key: minorKey };
    }
    return { kind: 'none' };
  }

  function readStorageMap(storageName) {
    try {
      return storageMap(window[storageName]);
    } catch (error) {
      return new Map();
    }
  }

  function isDraftDirty() {
    var roots = document.querySelectorAll('#cardHome, #cardSingle, #cardComm, #cardOld, #cardOrderInfo');
    var controls = [];
    roots.forEach(function (root) {
      root.querySelectorAll('input, select, textarea').forEach(function (element) {
        if (element.closest('.filter-bar')) return;
        controls.push(element);
      });
    });
    return controls.some(function (element) {
      if (element.type === 'checkbox' || element.type === 'radio') return element.checked !== element.defaultChecked;
      return String(element.value || '') !== String(element.defaultValue || '');
    });
  }

  function reloadWithUserChoice() {
    if (!isDraftDirty()) {
      window.location.reload();
      return;
    }
    if (window.confirm('작성 중인 견적서가 있습니다. 저장하지 않은 입력이 사라질 수 있습니다. 그래도 새로고침할까요?')) {
      window.location.reload();
    }
  }

  function render(state) {
    if (state.kind === 'none') return;
    var notice = document.createElement('aside');
    notice.id = 'samhan-estimate-version-notice';
    notice.setAttribute('data-testid', 'web-version-notice');
    notice.setAttribute('role', state.kind === 'blocking' ? 'alertdialog' : 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.style.cssText = 'position:fixed;inset-inline:16px;inset-block-end:16px;z-index:300000;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:1px solid #2563eb;border-radius:10px;background:#fff;color:#111827;box-shadow:0 12px 30px rgba(15,23,42,.2);font-family:system-ui,sans-serif;';

    var message = document.createElement('span');
    message.textContent = state.kind === 'blocking'
      ? '현재 견적 웹 버전은 지원이 종료되었습니다. 최신 버전으로 새로고침해 주세요.'
      : '새 견적 웹 버전 ' + state.info.latestVersion + '을 사용할 수 있습니다. 작성 중인 내용이 있으면 먼저 저장해 주세요.';
    notice.appendChild(message);

    var actions = document.createElement('div');
    var reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = '페이지 새로고침';
    reload.setAttribute('data-testid', 'web-version-reload');
    reload.addEventListener('click', reloadWithUserChoice);
    actions.appendChild(reload);
    if (state.kind !== 'blocking') {
      var dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.textContent = '나중에';
      dismiss.setAttribute('data-testid', 'web-version-dismiss');
      dismiss.addEventListener('click', function () {
        try {
          (state.kind === 'minor' ? window.localStorage : window.sessionStorage).setItem(state.key, 'true');
        } catch (error) { /* 저장소 차단은 무시 */ }
        notice.remove();
      });
      actions.appendChild(dismiss);
    }
    notice.appendChild(actions);
    document.body.appendChild(notice);
  }

  function run() {
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, 5000);
    fetch(buildUrl(), { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (payload) {
        var info = payload && payload.data ? payload.data : payload;
        if (!info || !['NONE', 'MINOR', 'MAJOR', 'CRITICAL'].includes(info.forceLevel)) return;
        render(resolveState(info));
      })
      .catch(function () { /* 버전 확인 실패는 견적서 사용을 막지 않는다. */ })
      .finally(function () { window.clearTimeout(timer); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}());
