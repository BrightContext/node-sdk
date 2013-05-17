/*globals require, exports */

(function () {
  'use strict';

  var util = require('util');

  exports.isT = function(t,o) { return (t === typeof(o)); };
  exports.isFn = function(f) { return this.isT('function', f); };
  exports.isStr = function(s) { return this.isT('string', s); };
  exports.isNum = function(n) { return (typeof(n) === 'number') && !isNaN(n) && isFinite(n); };

  exports.pretty = function(o) {
    JSON.stringify(o, ' ', 2);
  };

  exports.inspect = function(o) {
    util.log(util.inspect(o, true, 10, true));
  };
}());
