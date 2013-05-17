/*globals require, exports, console, process, setTimeout */

var bcc = require('../bcc_core');

bcc.environment.debug = true;

exports.testThru = function (test) {

  'use strict';

  try {

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

    ctx = bcc.init('08dff800-4de3-4f5c-aa1d-6391f91c1b54');
    p = ctx.project('t');

    p.feed({
      channel: 't',
      onopen: function (f) {
        thru_opened = true;
        expected_msg = { d: process.hrtime().join('') };
        f.send(expected_msg);
      },
      onmsgsent: function (/*f, m*/) {
        thru_msg_sent = true;
      },
      onmsg: function (f, m) {
        thru_msg_received = true;
        test.equal(expected_msg.d, m.d);
        console.log(m);
        f.history();
      },
      onhistory: function (f, h) {
        thru_history = true;
        test.equal(10, h.length);
        console.log(h);
        f.close();
      },
      onerror: function (err) {
        thru_error = true;
        console.log(err);
      },
      onclose: function (/*f*/) {
        thru_closed = true;
      }
    });

    setTimeout(function () {

      test.ok(thru_opened, 'opened');
      test.ok(thru_msg_sent, 'sent');
      test.ok(thru_msg_received, 'received');
      test.ok(thru_history, 'history');
      test.ok(thru_closed, 'closed');
      test.ok(false === thru_error, 'error');

      ctx.shutdown(function () {
        test.done();
      });
    }, 2000);

  } catch(ex) {
    console.log(ex);
  }

};