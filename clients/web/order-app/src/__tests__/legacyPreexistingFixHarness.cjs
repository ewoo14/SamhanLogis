'use strict';

/*
 * #967 적대검증 선재 결함 ① 전용 harness.
 * renderCommOptions() 정본을 그대로 추출하고, 최소 DOM에서 사용자가 바꾼
 * 5개 컨트롤이 다시 호출될 때 보존되는지 검사한다.
 */

const fs = require('fs');
const vm = require('vm');
const {
  SOURCE_PATH,
  extractFunctionSource,
} = require('../../../legacy-quantity-golden/legacyQuantityBoundary');

function bundle(source, names) {
  return names.map((name) => extractFunctionSource(source, name)).join('\n');
}

function runCommOptionsRerenderScenario() {
  const source = fs.readFileSync(SOURCE_PATH.order, 'utf8');
  const functions = bundle(source, ['sel', 'chk', 'renderCommOptions']);
  const script = `
    const nodes = new Map();
    const makeNode = (tag) => {
      const node = {
        tagName: String(tag).toUpperCase(),
        children: [],
        listeners: {},
        value: '',
        checked: false,
        className: '',
        appendChild(child) {
          this.children.push(child);
          if (child && child.id) nodes.set(child.id, child);
          if (child && child.children) child.children.forEach((nested) => {
            if (nested && nested.id) nodes.set(nested.id, nested);
          });
          return child;
        },
        addEventListener(type, handler) {
          this.listeners[type] = (this.listeners[type] || 0) + 1;
          this._handler = handler;
        },
      };
      let currentId = '';
      Object.defineProperty(node, 'id', {
        get: () => currentId,
        set: (value) => { currentId = String(value || ''); if (currentId) nodes.set(currentId, node); },
      });
      return node;
    };
    const box = makeNode('div');
    box.id = 'commOpts';
    Object.defineProperty(box, 'innerHTML', {
      get: () => '',
      set: () => {
        box.children = [];
        for (const id of ['comm_panel', 'comm_p360', 'comm_remote', 'comm_ex_hose', 'comm_ex_base']) nodes.delete(id);
      },
    });
    const document = {
      createElement: (tag) => makeNode(tag),
      createTextNode: (text) => ({ textContent: String(text) }),
      getElementById: (id) => nodes.get(id) || null,
      querySelector: (selector) => selector === '#commOpts' ? box : nodes.get(String(selector).replace(/^#/, '')) || null,
    };
    const el = (selector) => document.querySelector(selector);
    ${functions}

    renderCommOptions();
    document.getElementById('comm_panel').value = '블랙판넬';
    document.getElementById('comm_p360').value = '사각';
    document.getElementById('comm_remote').value = '컬러유선';
    document.getElementById('comm_ex_hose').checked = true;
    document.getElementById('comm_ex_base').checked = true;

    // 검색·필터·복원 경로가 부르는 동일한 옵션 렌더를 흉내낸다.
    renderCommOptions();

    globalThis.__result = {
      panel: document.getElementById('comm_panel').value,
      p360: document.getElementById('comm_p360').value,
      remote: document.getElementById('comm_remote').value,
      exHose: document.getElementById('comm_ex_hose').checked,
      exBase: document.getElementById('comm_ex_base').checked,
    };
  `;
  const context = { console: { log: () => {} } };
  vm.runInNewContext(script, context, { filename: SOURCE_PATH.order });
  return context.__result;
}

module.exports = { runCommOptionsRerenderScenario };
