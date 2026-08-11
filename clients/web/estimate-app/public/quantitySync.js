(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SamhanQuantitySync = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  function text(value) {
    return typeof value === 'string' ? value.trim() : String(value == null ? '' : value).trim();
  }

  function rowsByCode(catalog, code) {
    var needle = text(code).toUpperCase();
    return catalog.filter(function (row) {
      return text(row && (row.modelCode == null ? row.model : row.modelCode)).toUpperCase() === needle;
    });
  }

  function numberOrNull(value) {
    var number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function evaluateRule(rule, catalog, quantities) {
    if (!rule || rule.enabled !== true || text(rule.estimateCategory) !== 'HOME_MULTI') return null;
    if (text(rule.aggregation) !== 'SUM' || text(rule.inactiveBehavior) !== 'ZERO') return null;
    var sources = Array.isArray(rule.sources) ? rule.sources : [];
    var targets = Array.isArray(rule.targets) ? rule.targets : [];
    if (!sources.length || !targets.length) return null;

    var sourceTotal = 0;
    for (var i = 0; i < sources.length; i += 1) {
      var source = sources[i] || {};
      var code = text(source.productCode);
      var factor = numberOrNull(source.factor);
      var rows = rowsByCode(catalog, code);
      if (!code || factor == null || !rows.length) return null;
      for (var j = 0; j < rows.length; j += 1) {
        sourceTotal += (Number(quantities.get(text(rows[j].id == null ? (rows[j].modelCode == null ? rows[j].model : rows[j].modelCode) : rows[j].id))) || 0) * factor;
      }
    }

    var result = [];
    for (var k = 0; k < targets.length; k += 1) {
      var target = targets[k] || {};
      var targetCode = text(target.productCode);
      var multiplier = numberOrNull(target.multiplier);
      var targetRows = rowsByCode(catalog, targetCode);
      if (!targetCode || multiplier == null || !targetRows.length) return null;
      var value = sourceTotal * multiplier;
      if (text(target.roundingMode || 'NONE') === 'FLOOR') value = Math.floor(value);
      result.push({ code: targetCode, quantity: value, conflictPolicy: text(rule.conflictPolicy || 'ADD') });
    }
    return result;
  }

  function evaluateQuantitySyncRules(rules, catalog, quantities) {
    if (!Array.isArray(rules) || !Array.isArray(catalog) || !(quantities instanceof Map)) return null;
    var result = new Map();
    for (var i = 0; i < rules.length; i += 1) {
      var evaluated = evaluateRule(rules[i], catalog, quantities);
      if (evaluated == null) return null;
      evaluated.forEach(function (item) {
        var rows = rowsByCode(catalog, item.code);
        var row = rows[0];
        var id = text(row.id == null ? (row.modelCode == null ? row.model : row.modelCode) : row.id);
        if (item.conflictPolicy === 'REPLACE' || !result.has(id)) result.set(id, item.quantity);
        else result.set(id, (result.get(id) || 0) + item.quantity);
      });
    }
    return result;
  }

  return { evaluateQuantitySyncRules: evaluateQuantitySyncRules };
});
