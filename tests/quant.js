/*globals require, exports, console, setTimeout */

var bcc = require('../bcc_core');

exports.testQuant = function (test) {

  'use strict';

  test.expect(6);

  var ctx,
      p,
      input_opened, input_sent_data, input_closed,
      output_opened, output_received_data, output_closed
  ;

  ctx = bcc.init('08dff800-4de3-4f5c-aa1d-6391f91c1b54');
  p = ctx.project('t');

  p

  .feed({
    channel: 'q',
    name: 'i',
    onopen: function (f) {
      input_opened = true;

      f.send({
        s: 'string',
        d: new Date().getTime(),
        n: 10
      });
    },
    onmsgsent: function (f, m) {
      input_sent_data = true;
      console.log(m);
    },
    onclose: function (/*f*/) {
      input_closed = true;
    }
  })

  .feed({
    channel: 'q',
    name: 'o',
    onopen: function (/*f*/) {
      output_opened = true;
    },
    onmsg: function (f, m) {
      output_received_data = true;
      console.log(m);
    },
    onclose: function (/*f*/) {
      output_closed = true;
    }
  });

  setTimeout(function () {
    test.ok(input_opened);
    test.ok(output_opened);
    test.ok(input_sent_data);
    test.ok(output_received_data);

    ctx.shutdown(function () {
      test.ok(input_closed);
      test.ok(output_closed);
      test.done();
    });
  },10000);

};