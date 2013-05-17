/*globals require, exports, console, process, setTimeout */

var bcc = require('../bcc_core');

bcc.environment.debug = true;

exports.invalidApiKey = function (test) {

  'use strict';

  var ctx,
      p,
      expected_msg = null,
      thru_opened = false,
      thru_msg_received = false,
      thru_msg_sent = false,
      thru_history = false,
      thru_error = false,
      thru_closed = false
  ;

  ctx = bcc.init('1');
  p = ctx.project('t');

  p.feed({
    channel: 't',
    onopen: function (f) {
      console.log('onopen');
      thru_opened = true;
      expected_msg = { d: process.hrtime().join('') };
      f.send(expected_msg);
    },
    onmsgsent: function (/*f, m*/) {
      console.log('onmsgsent');
      thru_msg_sent = true;
    },
    onmsg: function (f, m) {
      console.log('onmsg');
      thru_msg_received = true;
      test.equal(expected_msg.d, m.d);
      console.log(m);
      f.history();
    },
    onhistory: function (f, h) {
      console.log('onhistory');
      thru_history = true;
      test.equal(10, h.length);
      console.log(h);
      f.close();
    },
    onerror: function (err) {
      console.log('onerror');
      thru_error = true;
      console.error(err);
    },
    onclose: function (/*f*/) {
      console.log('onclose');
      thru_closed = true;
    }
  });

  setTimeout(function () {
    test.ok(!thru_opened, 'not opened');
    test.ok(!thru_msg_sent, 'sent');
    test.ok(!thru_msg_received, 'received');
    test.ok(!thru_history, 'history');
    test.ok(!thru_closed, 'closed');
    test.ok(thru_error, 'error');

    ctx.shutdown(function () {
      test.done();
    });
  }, 1000);
};