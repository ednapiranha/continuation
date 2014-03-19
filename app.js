'use strict';

var express = require('express');
var configurations = module.exports;
var app = express();
var server = require('http').createServer(app);
var nconf = require('nconf');
var settings = require('./settings')(app, configurations, express);

nconf.argv().env().file({ file: 'local.json' });

// set up websocket
var io = require('socket.io').listen(server);

io.configure(function () {
  io.set('transports', ['websocket']);
  io.set('log level', 1);
});

io.sockets.on('connection', function (socket) {
  socket.on('join', function (data) {
    console.log('socket join on ', data.channel);
    socket.join(data.channel);
  });
});

var isLoggedIn = function (req, res, next) {
  if (req.session.username) {
    next();
  } else {
    res.redirect('/');
  }
};

// routes
require('./routes')(app, isLoggedIn, nconf, io);

server.listen(process.env.PORT || nconf.get('port'));
