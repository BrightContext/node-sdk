/*global require, console, exports, setTimeout */

var bcc = require('../bcc_core');

bcc.environment.debug = true;
bcc.environment.host = 'pub.bcclabs.com';

exports.testData = function (test) {

  'use strict';

  try {

    var ctx,
        p,
        data_result = false,
        data_error = false
    ;

    ctx = bcc.init('09b30994-0c69-413b-b5f6-97b6071be247');
    p = ctx.project('test');

    p.data({
      name: 'customAggregates',
      params: {
        queryName: 'messageTypeCount',
        queryParams: {
          msgtype : 'alert'
        }
      },
      ondata: function (data) {
        console.dir(data);
        data_result = true;
      },
      onerror: function (error) {
        console.dir(error);
        data_error = true;
      }
    });

    setTimeout(function () {

      test.ok(data_result, 'result');
      test.ok(false === data_error, 'error');

      ctx.shutdown(function () {
        test.done();
      });
    }, 2000);

  } catch(ex) {
    console.log(ex);
  }

};