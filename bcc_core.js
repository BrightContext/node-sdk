/*globals require, exports, console, setInterval, clearInterval, setTimeout, clearTimeout */

var bcc_connection = require('./bcc_connection.js');
var belt = require('./bcc_utility.js');


(function () {
  'use strict';


  function Dispatcher() {
    var me = this,
        feed_registry = {},
        listener_registry = {}
    ;

    this.feed = function (feed_key) {
      return feed_registry[feed_key];
    };

    this.registry = function () {
      return feed_registry;
    };

    this.registerFeed = function (feed_instance) {
      feed_registry[feed_instance.key()] = feed_instance;
    };

    this.unregisterFeed = function (feed_instance) {
      delete feed_registry[feed_instance.key()];
    };

    this.listener = function (feed_key) {
      return listener_registry[feed_key];
    };

    this.registerListener = function (feed_key, listener) {
      listener_registry[feed_key] = listener;
    };

    this.unregisterListener = function (feed_key) {
      delete listener_registry[feed_key];
    };

    this.dispatch = function (evt) {
      var f = me.feed(evt.eventKey),
          l = me.listener(evt.eventKey),
          event_data = [f, evt.msg],
          event_name = evt.eventType
      ;

      if ('onfeedmessage' === event_name) {
        // HACK: lazy programmers don't want to spell received
        me.notify(l, 'onmsg', event_data);
        me.notify(l, 'onmsgreceived', event_data);
      } else {
        me.notify(l, event_name, event_data);
      }
    };

    this.notify = function (listener, event_name, event_args) {
      if (listener) {
        if (listener.hasOwnProperty(event_name)) {
          var fn = listener[event_name];
          if ('function' === typeof(fn)) {
            fn.apply(listener, event_args);
          } else if ('onerror' === event_name) {
            console.error(event_args);
          }
        }
      }
    };
  }

  function Feed(project_instance, feed_settings) {
    var me = this;

    this.project = project_instance;
    this.settings = feed_settings;

    this.activeuser = {
      previous_message: null,
      revote_timer_id: null,
      revote_schedule: function () {
        return me.settings.activeUserCycle * 1000;
      },
      begin_cycle: function () {
        me.activeuser.revote_timer_id =
          setInterval(me.activeuser.revote, me.activeuser.revote_schedule());
      },
      isRevoting: function () {
        return (!!me.activeuser.revote_timer_id);
      },
      end_cycle: function () {
        clearInterval(me.activeuser.revote_timer_id);
        me.activeuser.revote_timer_id = null;
      },
      revote: function () {
        me.project.conn.createMessage(
          {
            feedKey: me.key(),
            writeKey: me.writeKey(),
            state: 'REVOTE'
          },
          me.activeuser.previous_message
        );
      }
    };

    this.key = function () {
      return me.settings.feedKey;
    };

    this.writeKey = function (wk) {
      if ('string' === typeof(wk)) {
        me.wk = wk;
      }
      return me.wk;
    };

    this.isActive = function () {
      return (!!me.settings.activeUserFlag);
    };

    this.close = function (completion) {
      me.project.closeFeed(me, completion);
    };

    this.calculateMessageDeltas = function (message_payload) {
      var delta_payload = message_payload;

      me.settings.activeUserFields.forEach(function(active_field) {
        var new_value, old_value, delta;
        new_value = message_payload[active_field];
        old_value = me.activeuser.previous_message[active_field];
        delta = new_value - old_value;
        delta_payload[active_field] = delta;
      });

      return delta_payload;
    };

    this.send = function (message_payload, completion) {
      var prev, message_metadata = {
        feedKey: me.key(),
        writeKey: me.writeKey()
      };


      if (me.isActive()) {
        // clone as previous message BEFORE calculating
        prev = JSON.parse(JSON.stringify(message_payload));

        if (!me.activeuser.isRevoting()) {
          message_metadata.state = 'INITIAL';
          me.activeuser.begin_cycle();
        } else {
          message_metadata.state = 'UPDATE';
          message_payload = me.calculateMessageDeltas(message_payload);
        }

        // save as previous message AFTER calculating
        me.activeuser.previous_message = prev;
      }

      me.project.conn.createMessage(
        message_metadata,
        message_payload,
        function (message_create_response) {
          var dispatcher, listener, t;

          dispatcher = me.project.dispatcher;
          listener = dispatcher.listener(message_metadata.feedKey);

          if (listener) {
            t = message_create_response.eventType;
            if ('onerror' === message_create_response.eventType) {
              dispatcher.notify(listener, 'onerror', message_create_response.msg);
            } else {
              dispatcher.notify(listener, 'onmsgsent', [me, message_payload]);
            }
          }

          if ('function' === typeof(completion)) {
            completion(message_payload);
          }
        }
      );
    };

    this.history = function (limit, since_ts, completion) {
      var k = me.key();

      me.project.conn.fetchHistory(
        k,
        limit,
        since_ts,
        function (history_response) {
          var dispatcher, listener, t;

          dispatcher = me.project.dispatcher;
          listener = dispatcher.listener(k);

          if (listener) {
            t = history_response.eventType;
            if ('onerror' === t) {
              dispatcher.notify(listener, t, history_response.msg);
            } else {
              dispatcher.notify(listener, 'onhistory', [me, history_response.msg]);
            }
          }

          if ('function' === typeof(completion)) {
            completion(history_response.msg);
          }
        }
      );
    };
  }

  function Project (project_name, connection) {
    var me = this, DEFAULT_FEED_NAME = 'default';

    this.conn = connection;
    this.dispatcher = new Dispatcher();

    this.queue_command = function (fn) {
      if (!me.action_queue) {
        me.action_queue = [];
      }

      me.action_queue.push(fn);
      if (1 === me.action_queue.length) {
        me.do_next_command();
      }
    };

    this.open_connection = function (callback) {
      if (me.conn.isOpen()) {
        callback();
      } else {
        me.conn.open({
          onopen: function(/* c */) {
            callback();
          },
          onevent: function (c, e) {
            me.dispatcher.dispatch(e);
          },
          onend: function (c, e) {
            if (e) {
              me.conn.forceShutdown(e);
              callback(e);
            }
          }
        });
      }
    };

    this.connect_and_execute = function (handler, fn) {
      me.queue_command(function () {
        me.open_connection(function(connect_error) {
          if (connect_error) {
            me.dispatcher.notify(handler, 'onerror', [connect_error]);
          } else {
            fn();
            me.do_next_command();
          }
        });
      });
    };

    this.do_next_command = function () {
      setTimeout(function () {
        var fn = me.action_queue.shift();
        if ('function' === typeof(fn)) {
          fn();
        }
      }, 1);
    };

    this.find_feed = function (md, feed_name) {
      var found = md.feeds.filter(function (f) {
        return (feed_name === f.name);
      });

      return (found && found.length) ? found[0] : null;
    };

    this.feed = function(feed_description) {
      function notifyError (msg) {
        me.dispatcher.notify(feed_description, 'onerror', [msg]);
        return me;
      }

      if ('object' !== typeof(feed_description)) {
        return me;
      }

      if (('undefined' === typeof(feed_description.channel)) || ('' === feed_description.channel)) {
        notifyError('channel name required');
        return me;
      }

      if ('string' !== typeof(project_name) || '' === project_name) {
        notifyError('invalid project name');
        return me;
      }

      function open_feed () {
        me.conn.createFeed(
          project_name,
          feed_description.channel,
          feed_description.name || DEFAULT_FEED_NAME,
          feed_description.filter,
          function (feed_create_response) {
            if ('onerror' === feed_create_response.eventType) {
              me.dispatcher.notify(feed_description, 'onerror', [feed_create_response.msg]);
            } else {
              var feed_instance = new Feed(me, feed_create_response.msg);
              if (feed_description.writekey) {
                feed_instance.writeKey(feed_description.writekey);
              }
              me.dispatcher.registerFeed(feed_instance);
              me.dispatcher.registerListener(feed_instance.key(), feed_description);

              me.dispatcher.notify(feed_description, 'onopen', [feed_instance]);
            }
          }
        );
      }

      me.connect_and_execute(feed_description, open_feed);

      return me;
    };

    this.data = function (storage_listener) {
      if (!storage_listener || !storage_listener.name || !storage_listener.ondata) {
        return me;
      }

      me.connect_and_execute(storage_listener, function () {
        me.conn.storageQuery(project_name, storage_listener, function (storage_query_response) {

          var event_handler = ('onerror' === storage_query_response.eventType) ?
            'onerror' : 'ondata';
          me.dispatcher.notify(storage_listener, event_handler, [storage_query_response.msg]);

        });
      });

      return me;
    };

    this.closeFeed = function (feed_instance, completion) {
      if (feed_instance.isActive()) {
        feed_instance.activeuser.end_cycle();
      }

      me.conn.destroyFeed(feed_instance.key(), function (/* close_feed_response */) {
        me.dispatcher.unregisterFeed(feed_instance);

        var listener = me.dispatcher.listener(feed_instance.key());
        if (listener) {
          me.dispatcher.notify(listener, 'onclose', [feed_instance]);
          me.dispatcher.unregisterListener(feed_instance.key());
        }

        if ('function' === typeof(completion)) {
          completion();
        }
      });
    };

    this.closeAllFeeds = function (completion) {
      var feed_registry = me.dispatcher.registry(),
          feed_instance,
          on_feed_closed,
          on_all_feeds_closed,
          num_feeds_to_close = Object.keys(feed_registry).length,
          num_closed_feeds = 0
      ;

      on_all_feeds_closed = function () {
        if ('function' === typeof(completion)) {
          completion();
        }
      };

      if (0 === num_feeds_to_close) {
        on_all_feeds_closed();
      } else {
        on_feed_closed = function () {
          ++num_closed_feeds;
          if (num_closed_feeds >= num_feeds_to_close) {
            on_all_feeds_closed();
          }
        };

        Object.keys(feed_registry).forEach(function (feed_key) {
          feed_instance = feed_registry[feed_key];
          feed_instance.close(on_feed_closed);
        });
      }
    };

  }


  function Connection(apikey, environment) {
    var me = this,
        socket = bcc_connection.socket(),
        heartbeat_timer_id = null,
        projects = {}
    ;

    this.open = function (connection_listener) {
      var env = environment || exports.environment, handleOpen, handleMessageEvent, handleEndEvent;
      env.apikey = apikey;

      handleOpen = function (session) {
        if (env.debug) {
          belt.inspect(session);
        }
        me.session = session;
        me.startHeartbeats();

        connection_listener.onopen(me);
      };

      handleMessageEvent = function (evt) {
        connection_listener.onevent(me, evt);
      };

      handleEndEvent = function (error) {
        connection_listener.onend(me, error);
      };

      socket.open(env, handleOpen, handleMessageEvent, handleEndEvent);
    };

    this.isOpen = function () {
      return (!!me.session);
    };

    this.project = function (project_name) {
      var p = projects[project_name];
      if (!p) {
        p = new Project(project_name, this);
        projects[project_name] = p;
      }
      return p;
    };

    this.getChannel = function (project_name, channel_name, callback) {
      socket.send('GET', '/channel/description.json',
        { name: channel_name, project: project_name },
        callback
      );
    };

    this.createFeed =
      function (project_name, channel_name, connector_name, filter_object, callback) {
        socket.send('POST', '/feed/session/create.json',
          {
            'feedDesc': {
              'project': project_name,
              'channel': channel_name,
              'connector': connector_name,
              'filters': filter_object
            }
          },
          callback
        );
      };

    this.destroyFeed = function (feed_key, callback) {
      socket.send('POST', '/feed/session/delete.json',
        { 'fklist' : feed_key },
        callback
      );
    };

    this.createMessage = function (md, message_payload, callback) {
      socket.send('POST', '/feed/message/create.json',
        {
          metadata: md,
          message: message_payload
        },
        callback
      );
    };

    this.fetchHistory = function (feed_key, limit, since_ts, callback) {
      var query = {
        feedKey: feed_key
      };

      if (limit) {
        query.limit = limit;
      }

      if (since_ts) {
        query.sinceTS = (new Date(since_ts)).getTime();
      }

      socket.send('GET', '/feed/message/history.json', query, callback);
    };

    this.storageQuery = function (project_name, storage_listener, callback) {
      var query = {
        project: project_name,
        dataStoreName: storage_listener.name,
        params: storage_listener.params || {}
      };

      socket.send('GET', '/storage/query.json', query, callback);
    };

    this.startHeartbeats = function () {
      heartbeat_timer_id = setInterval(function () {
        socket.hb();
      }, 45000);
    };

    this.stopHeartbeats = function () {
      clearInterval(heartbeat_timer_id);
      heartbeat_timer_id = null;
    };

    this.shutdown = function (completion) {
      var me = this,
          on_close_error,
          on_project_closed,
          on_all_projects_closed,
          num_projects_to_close = Object.keys(projects).length,
          num_closed_projects = 0
      ;

      this.stopHeartbeats();

      on_close_error = setTimeout(function () {
        me.forceShutdown();
      }, 5000);

      on_all_projects_closed = function () {
        socket.close(completion);
        clearTimeout(on_close_error);
      };

      if (0 === num_projects_to_close) {
        on_all_projects_closed();
      } else {
        on_project_closed = function () {
          ++num_closed_projects;
          if (num_closed_projects >= num_projects_to_close) {
            on_all_projects_closed();
          }
        };

        Object.keys(projects).forEach(function (project_name) {
          var project = projects[project_name];
          project.closeAllFeeds(on_project_closed);
        });
      }
    };

    this.forceShutdown = function (error) {
      this.stopHeartbeats();

      Object.keys(projects).forEach(function (project_name) {
        var project, feed_registry;

        project = projects[project_name];
        feed_registry = project.dispatcher.registry();

        Object.keys(feed_registry).forEach(function (feed_key) {
          project.dispatcher.dispatch({
            eventKey: feed_key,
            eventType: 'onclose',
            msg: 'force closed: ' + error
          });
        });
      });

      if (socket) {
        socket.close();
      }
    };

  }

  exports.init = function (apikey, environment) {
    var c = new Connection(apikey, environment);
    return c;
  };


  exports.environment = {
    'apiroot': '/api/v2',
    'host': 'pub.brightcontext.com',
    'port': 80,
    'debug': false
  };

}());
