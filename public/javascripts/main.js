define(['jquery', './base/transform', 'fingerprint', 'md5', 'moment', 'favico'],
  function ($, transform, Fingerprint, md5, moment, Favico) {
  'use strict';

  var CHAT_LIMIT = 25;
  var CHAR_LIMIT = 300;

  var auth = {
    userid: null,
    fingerprint: new Fingerprint({ canvas: true }).get()
  };
  var chat = {
    container: $('#chat-container'),
    list: $('#chat-list')
  };
  var composer = {
    blocker: $('#composer-blocker'),
    form: $('#composer-form'),
    message: $('#composer-message'),
    inputs: $('#composer-form input').toArray()
  };
  var menu = {
    button: $('#menu-button'),
    list: $('#menu-list')
  };
  var html = $('html');
  var body = $('body');
  var counter = $('#counter');
  var footer = $('#footer');
  var channel = false;
  var isPosting = false;
  var canSend = true;
  var muteText = body.data('mute');
  var mutes = JSON.parse(localStorage.getItem('muted')) || [];
  var favicon = new Favico({
    animation: 'none',
    position: 'up left'
  });
  var socket = io.connect(
    location.protocol + '//' + location.hostname +
    (location.port ? ':' + location.port : '')
  );
  var unreadMessages = 0;
  var pageHidden = 'hidden';
  var pageVisibilityChange = 'visibilitychange';

  if (typeof document.hidden === 'undefined') {
    ['webkit', 'moz', 'ms'].some(function (prefix) {
      var prop = prefix + 'Hidden';
      if (typeof document[prop] !== 'undefined') {
        pageHidden = prop;
        pageVisibilityChange = prefix + 'visibilitychange';
        return true;
      }
    });
  }

  var handleVisibilityChange = function () {
    if (!document[pageHidden]) {
      unreadMessages = 0;
      favicon.badge(0);
    }
  };

  var updateNotificationCount = function () {
    if (document[pageHidden]) {
      unreadMessages += 1;
      favicon.badge(unreadMessages);
    }
  };

  var isMuted = function (fingerprint) {
    return mutes.indexOf(fingerprint) !== -1;
  };

  var render = function (incoming) {
    var fingerprint = incoming.value.fingerprint;

    if (!isMuted(fingerprint)) {
      // Don't want duplicates and don't want muted messages
      if (body.find('li[data-key="' + incoming.key + '"]').length === 0 &&
          !isMuted(fingerprint)) {

        var li = document.createElement('li');
        li.dataset.key = incoming.key;
        li.dataset.fingerprint = fingerprint;
        // This is likely your own fingerprint so you don't mute yourself. Unless you're weird.
        if (auth.userid !== fingerprint) {
          updateNotificationCount();

          var button = document.createElement('button');
          button.textContent = muteText;
          button.className = 'mute';
          li.appendChild(button);
        }

        var message = document.createElement('p');
        message.textContent = incoming.value.message;
        message.innerHTML = transform(message.innerHTML);
        li.appendChild(message);

        var created = moment(new Date(incoming.value.created));
        var time = document.createElement('time');
        time.setAttribute('datetime', created.toISOString());
        time.textContent = created.format('LT');
        time.className = 'timestamp';
        li.appendChild(time);

        var size = composer.message.is(":visible") ?
          composer.message[0].getBoundingClientRect().bottom :
          $(window).innerHeight();

        var last = chat.list[0].lastChild;
        var bottom = last ? last.getBoundingClientRect().bottom : 0;
        var follow = bottom < size + 50;

        chat.list.prepend(li);

        // if scrolled to bottom of window then scroll the new thing into view
        // otherwise, you are reading the history... allow user to scroll up.
        if (follow) {
          var children = chat.list.children();
          var toRemove = children.length - CHAT_LIMIT;

          toRemove = toRemove < 0 ? 0 : toRemove;
          children.slice(0, toRemove).remove();
          li.scrollIntoView();
        }
      }
    }
  };

  $.get('/ip?t=' + Date.now(), function (data) {
    auth.userid = md5(auth.fingerprint + data.ip);
  });

  body.on('click', '#unmute', function (ev) {
    if (ev.target.id === 'unmute') {
      localStorage.removeItem('muted');
      mutes = [];
    }
  }).on('keydown', function (ev) {
    if (!hasModifiersPressed(ev) && ev.target !== composer.message[0]) {
      composer.message.focus();
    }
  });

  chat.list.on('click', '.mute', function (ev) {
    var fingerprint = $(this).parent('[data-fingerprint]').data('fingerprint');
    var messages;

    if (!isMuted(fingerprint)) {
      mutes.push(fingerprint);
      localStorage.setItem('muted', JSON.stringify(mutes));
      messages = chat.list.children().filter(function() {
        // using filter because we have no guarantee of fingerprint
        // formatting, and therefore cannot trust a string attribute selector.
        return this.dataset.fingerprint === fingerprint;
      });
      messages.waypoint('destroy').remove();

      $.waypoints('refresh');
    }
  });

  composer.form.on('keydown', function (ev) {
    if (ev.keyCode === 13) {
      ev.preventDefault();
      composer.form.submit();
    }
  }).on('keyup', function (ev) {
    counter.text(CHAR_LIMIT - composer.message.val().length);
  }).on('submit', function (ev) {
    ev.preventDefault();

    composer.message.prop('readonly', true);

    if (!isPosting) {
      if (!canSend) {
        alert('please wait a wee bit...');
        composer.message.prop('readonly', false);
      }

      if (canSend) {
        canSend = false;
        composer.blocker.removeClass('hidden');
        isPosting = true;

        setTimeout(function () {
          canSend = true;
        }, 3000);

        var submission = composer.inputs.reduce(function(data, input) {
          return (data[input.name] = input.value, data);
        }, { picture: '' });

        $.post('/c/' + auth.channel + '/chat', $.extend(submission, auth), function () {
          // nothing to see here?
        }).error(function (data) {
          alert(data.responseJSON.error);
        }).always(function (data) {
          composer.message.prop('readonly', false);
          composer.message.val('');
          composer.blocker.addClass('hidden');
          counter.text(CHAR_LIMIT);
          isPosting = false;
        });
      }
    }
  });

  menu.button.on('click', function (ev) {
    menu.list.toggle();
  });

  socket.on('message', function (data) {
    render(data.chat);
  });

  auth.channel = body.find('#channel').data('channel') || false;

  if (auth.channel) {
    socket.emit('join', {
      channel: auth.channel
    });
  }

  $(document).on(pageVisibilityChange, handleVisibilityChange);

  function hasModifiersPressed(ev) {
    // modifiers exclude shift since it's often used in normal typing
    return ev.altKey || ev.ctrlKey || ev.metaKey;
  }
});
