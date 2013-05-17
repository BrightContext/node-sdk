var bcc = require('../../bcc_core');

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

bcc.environment.host = 'pub.bcclabs.com';
bcc.environment.debug = true;

ctx = bcc.init('09b30994-0c69-413b-b5f6-97b6071be247');
p = ctx.project('t');

p.feed({
	channel: 't',
	onopen: function (f) {
		thru_opened = true;

		// setInterval(function () {
		// 	f.send({ d: process.hrtime().join('') });
		// }, 1000);

		f.history(1);
	},
	onmsgsent: function (f, m) {
		thru_msg_sent = true;
	},
	onmsg: function (f, m) {
		thru_msg_received = true;
		console.log(m);
		// f.history();
	},
	onhistory: function (f, h) {
		thru_history = true;
		// test.equal(10, h.length);
		console.log(h);
		// f.close();
	},
	onerror: function (err) {
		thru_error = true;
		console.log(err);
		process.exit(1);
	},
	onclose: function (f) {
		process.exit(2);
	}
});
