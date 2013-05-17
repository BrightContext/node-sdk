/*globals require, exports, console, setTimeout, clearTimeout */

var util = require('util');
var wsocket = require('./bcc_socket.js');

(function () {
  'use strict';

  function ApiSocket () {
    var
      me = this,
      _socket = wsocket.socket(),
      _heartbeatTimeoutId = null,
      _commandQ = {},
      _keyCounter = 0
    ;

    this._session = {};
    this.session = function(s) {
      if ('undefined' !== typeof(s)) {
        this._session = s;
      }
      return this._session;
    };

    this.open = function(e, onopen, onmsgreceived, onend) {
      this._selectedEnv = e;
      me._msgreceived = onmsgreceived;

      _socket.open({
        apikey: e.apikey,
        apiroot: e.apiroot,
        host: e.host,
        port: e.port,
        debug: e.debug,
        open: function(s) {
          // console.log('connection opened');
          me.session(s);
          if ('function' === typeof(onopen)) {
            onopen(s);
          }
        },
        data: function(d) {
          // console.log('connection data');
          try {
            handleResponse(d);
          } catch(ex) {
            console.error(ex.stack);
          }
        },
        end: function (err) {
          // console.log('connection end');
          if (err) {
            console.error(err);
          }

          try {
            if ('function' === typeof(onend)) {
              onend(err);
            }
          } catch(ex) {
            console.error(ex);
          }
        }
      });
    };

    this.send = function(action, url, params, fn) {
      var c = cmd(action, url, params, fn);
      _socket.send(c);
    };

    function heartbeatResponse () {
      clearTimeout(_heartbeatTimeoutId);
    }

    this.hb = function() {
      var hb = '{ "cmd": "heartbeat" }';
      _socket.send(hb);

      // set a tripwire if heartbeats stop
      _heartbeatTimeoutId = setTimeout(function () {
        me.close();
      }, 1000);
    };

    this.close = function(completion) {
      _socket.close(completion);
    };

    ////////////////////////////////////////////////////////////////////////////////
    // private methods
    ////////////////////////////////////////////////////////////////////////////////

    function cmd (action, url, params, fn) {
      var c, f;

      c = {
        cmd: action + ' ' + me._selectedEnv.apiroot + url
      };

      c.params = ('object' === typeof(params)) ? params: {};
      c.params.eventKey = key();
      c.params.sid = sid();

      f = ('function' === typeof(fn)) ? fn: console.log;
      _commandQ['' + c.params.eventKey] = f;

      return JSON.stringify(c);
    }

    function key () {
      return ++_keyCounter;
    }

    function sid () {
      return me._session.sid;
    }

    function handleResponse (json) {
      var o = null, k, fn;

      try {
        o = JSON.parse(json);
      } catch(parseErr) {
        console.error('invalid json: ' + json);
      }

      if (null === o) {
        return;
      }

      if (0 === parseInt(o.eventKey,10)) {
        if ('hb' === o.msg.message) {
          heartbeatResponse();
          return;
        }
      }

      if ('onfeedmessage' === o.eventType) {
        if ('function' === typeof(me._msgreceived)) {
          me._msgreceived(o);
        } else {
          console.info('Inbound Message Data Received');
          console.info(util.inspect(o));
        }
        return;
      }

      k = '' + o.eventKey;
      fn = _commandQ[k];
      if ('function' === typeof(fn)) {
        fn(o);
      }
    }
  }

  exports.socket = function() {
    return new ApiSocket();
  };

}());
