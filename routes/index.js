'use strict';

module.exports = function (app, isLoggedIn, hasUsername, nconf, io) {
  var crypto = require('crypto');
  var Diphenhydramine = require('diphenhydramine');
  var level = require('level');
  var uuid = require('uuid');
  var accessIds = {};

  var diphenhydramine = new Diphenhydramine({
    db: './db',
    limit: 25
  });

  var getSortedChats = function (channel, done) {
    diphenhydramine.getChats(channel, true, function (err, c) {
      if (err) {
        done(err);
      } else {
        if (c.chats && c.chats.length > 0) {
          c.chats.reverse();
        }
        done(null, c);
      }
    });
  };

  var emitChat = function (socket, channel, chat) {
    io.sockets.in(channel).emit('message', { chat: chat });
  };

  app.get('/', function (req, res) {
    res.render('index');
  });

  app.get('/username', function (req, res) {
    res.render('username', {
      channel: req.query.channel
    });
  });

  app.post('/username', function (req, res) {
    req.session.username = req.body.username;
    res.redirect('/c/' + req.body.channel);
  });

  app.post('/channel', function (req, res, next) {
    var postmark = require('postmark')(nconf.get('postmark_api_key'));
    var channel = uuid.v4().replace(/[^\w+]/gi, '').toLowerCase();

    diphenhydramine.getChats(channel, true, function (err, c) {
      if (err) {
        res.status(400);
        next(err);
      } else {
        req.session.accessId = channel;

        var link = nconf.get('domain') + ':' + nconf.get('authPort') + '/c/' +
                   req.session.accessId;

        postmark.send({
          'From': nconf.get('email'),
          'To': req.body.email,
          'Subject': 'Here is your chat link!',
          'HtmlBody': '<p>Here is the link to your chat room <a href="' +
          link +'">' + link + '</a></p>',
          'TextBody': 'Here is the link to your chat room ' + link,
          'Attachments': []
        }, function (err, success) {
          if (err) {
            throw new Error('Unable to send via postmark: ' + err.message);
          } else {
            req.session.username = req.body.username;

            res.redirect('/c/' + channel);
            console.info('Sent to postmark for delivery');
          }
        });
      }
    });
  });

  app.get('/c/:channel', hasUsername, function (req, res, next) {
    diphenhydramine.getChats(req.params.channel, true, function (err, c) {
      if (err) {
        res.status(400);
        next(err);
      } else {
        res.render('channel', {
          channel: req.params.channel,
          chats: c.chats
        });
      }
    });
  });

  app.get('/ip', isLoggedIn, function (req, res) {
    res.json({
      ip: req.ip
    });
  });

  var addChat = function (channel, message, picture, fingerprint, userId, ip, next) {
    diphenhydramine.addChat(message.slice(0, 500), channel, {
      ttl: 600000,
      media: picture,
      fingerprint: userId
    }, function (err, c) {
      if (err) {
        next(err);
      } else {
        try {
          emitChat(io.sockets, channel, { key: c.key, value: c });
          next(null, 'sent!');
        } catch (err) {
          next(new Error('Could not emit message'));
        }
      }
    });
  };

  var getUserId = function(fingerprint, ip) {
    return crypto.createHash('md5').update(fingerprint + ip).digest('hex');
  };

  app.post('/c/:channel/chat', isLoggedIn, function (req, res, next) {
    var ip = req.ip;
    var userId = getUserId(req.body.fingerprint, ip);

    if (userId === req.body.userid) {
      addChat(req.params.channel, '<b>' + req.session.username + '</b>: ' +
              req.body.message, '', req.body.fingerprint, userId, ip, function (err, status) {
        if (err) {
          res.status(400);
          res.json({ error: err.toString() });
        } else {
          res.json({ status: status });
        }
      });
    } else {
      res.status(403);
      res.json({ error: 'invalid fingerprint' });
    }
  });

  io.sockets.on('connection', function (socket) {
    var ip = socket.handshake.address.address;
    if (socket.handshake.headers['x-forwarded-for']) {
      ip = socket.handshake.headers['x-forwarded-for'].split(/ *, */)[0];
    }

    socket.on('join', function (data) {
      socket.join(data.channel);

      // Fire out an initial burst of images to the connected client, assuming there are any available
      getSortedChats(data.channel, function (err, results) {
        if (results.chats && results.chats.length > 0) {
          try {
            results.chats.forEach(function (chat) {
              emitChat(socket, data.channel, chat);
            });
          } catch (e) {
            if (typeof results.chats.forEach !== 'function') {
              console.log('chats is type of ', typeof results.chats, ' and somehow has length ', results.chats.length);

              if (typeof results.chats === 'string') {
                console.log('results.chats appears to be a string');
              }
            }
          }
        }
      });
    });
  });
};
