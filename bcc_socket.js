/*globals require, console, exports */

var http = require('http');
var ws = require('ws');
var util = require('util');
var url = require('url');

var belt = require('./bcc_utility.js');


(function () {
  'use strict';

  var SocketWrapper = function() {
    var me = this;

    this._socket = null;

    this.open = function(opts) {
      me.setting = opts;

      createSession(function(status, sessionInfo) {
        _log('createSession status: ' + status);

        if (200 !== status) {
          if (belt.isFn(me.setting.end)) {
            me.setting.end('invalid api key');
          } else {
            _log(typeof(me.setting.end) + ' not a function');
          }
        } else {
          openSocket(sessionInfo, function(socket) {
            _log(util.inspect(socket));
            me._socket = socket;
            me._socket.on('close', function() {
              _log('socket closed');
              if (belt.isFn(me.setting.end)) {
                me.setting.end('socket closed');
              }
            });

            me._socket.on('message', function (message) {
              _log('<< ' + message);

              if (('' !== message) && (belt.isFn(me.setting.data))) {
                try {
                  me.setting.data(message);
                } catch (ex) {
                  console.error(ex);
                }
              }
            });

            if (belt.isFn(me.setting.open)) {
              me.setting.open(sessionInfo);
            }
          });
        }
      });
    };

    this.send = function(message, writeCompletion) {
      _log('>> ' + message);
      this._socket.send(message, writeCompletion);
    };

    this.write = this.send;

    this.close = function(completion) {
      if (belt.isFn(completion)) {
        if (belt.isFn(me.setting.end)) {
          var wrapped = me.setting.end;
          me.setting.end = function () {
            wrapped();
            completion();
          };
        } else {
          me.setting.end = completion;
        }
      }

      if (this._socket) {
        this._socket.close();
      } else {
        if (belt.isFn(me.setting.end)) {
          me.setting.end();
        }
      }
    };

    ////////////////////////////////////////////////////////////////////////////////
    // private methods
    ////////////////////////////////////////////////////////////////////////////////

    function _log(m) {
      if (me.setting.debug) {
        console.log(m);
      }
    }

    /** send a session/create and fires a callback with the session info */
    function createSession (callback) {
      var path, sessionCreate;

      _log(me.setting);
      path = me.setting.apiroot + '/session/create.json?apiKey=' + me.setting.apikey;
      _log(path);

      sessionCreate = http.request({
        port: me.setting.port,
        host: me.setting.host,
        method: 'POST',
        path: path
      });

      sessionCreate.on('response', function (response) {
        var data = '';

        _log('STATUS: ' + response.statusCode);
        _log('HEADERS: ' + JSON.stringify(response.headers));

        if (200 !== response.statusCode) {
          callback(response.statusCode);
          return;
        }

        response.on('data', function (chunk) {
          data += chunk;
        });

        response.on('end', function() {
          var sessionInfo = JSON.parse(data);
          _log('SID OK: ' + sessionInfo.sid);

          callback(response.statusCode, sessionInfo);
        });
      });

      sessionCreate.on('error', function(err) {
        console.error(err);
      });

      sessionCreate.end();
    }

    /** connect to first available socket endpoint */
    function openSocket (sessionInfo, callback) {
      var socketUrl, socketInfo, socket_endpoint, new_socket;

      _log(sessionInfo);

      socketUrl = sessionInfo.endpoints.socket[0];
      socketInfo = url.parse(socketUrl);
      _log(socketInfo);

      socket_endpoint = socketUrl + me.setting.apiroot + '/feed/ws?sid=' + sessionInfo.sid;
      _log('Connecting to ' + socket_endpoint);

      new_socket = new ws(socket_endpoint);
      new_socket.on('open', function () {
        _log('socket open');
        callback(new_socket);
      });
    }
  };

  exports.socket = function() {
    return new SocketWrapper();
  };

}());
