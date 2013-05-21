/*globals require, exports, console, setTimeout, setInterval, clearInterval */

var bcc = require('../bcc_core');

exports.testActiveUser = function (test) {

  'use strict';

  bcc.environment.debug = true;

  test.expect(6);

  var ctx,
      p,
      input_opened, input_sent_data, input_closed,
      output_opened, output_received_data, output_closed,
      next_value = 0, input_intervalid
  ;

  ctx = bcc.init('08dff800-4de3-4f5c-aa1d-6391f91c1b54');
  p = ctx.project('t');

  p

  .feed({
    channel: 'au',
    name: 'i',
    onopen: function (f) {
      console.log('input onopen');

      input_opened = true;

      input_intervalid = setInterval(function () {
        next_value += 1;

        console.log('next value ' + next_value);

        f.send({
          n: next_value
        });
      }, 2000);
    },
    onmsgsent: function (f, m) {
      console.log('input onmsgsent');

      input_sent_data = true;
      console.log(m);
    },
    onclose: function (/*f*/) {
      console.log('input onclose');

      input_closed = true;
    }
  })

  .feed({
    channel: 'au',
    name: 'o',
    onopen: function (/*f*/) {
      console.log('output onopen');

      output_opened = true;
    },
    onmsg: function (f, m) {
      console.log('output onmsg');

      output_received_data = true;
      console.log(m);
    },
    onclose: function (/*f*/) {
      console.log('output onclose');

      output_closed = true;
    }
  });

  setTimeout(function () {
    clearInterval(input_intervalid);

    test.ok(input_opened);
    test.ok(output_opened);
    test.ok(input_sent_data);
    test.ok(output_received_data);

    ctx.shutdown(function () {
      test.ok(input_closed);
      test.ok(output_closed);
      test.done();
    });
  }, 60000);

};