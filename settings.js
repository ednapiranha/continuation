// Module dependencies.
module.exports = function(app, configurations, express) {
  var RedisStore = require('connect-redis')(express);
  var nconf = require('nconf');
  var i18n = require('i18next');
  var maxAge = 24 * 60 * 60 * 1000 * 28;
  var csrf = express.csrf();

  nconf.argv().env().file({ file: 'local.json' });

  i18n.init({
    lng: nconf.get('locale'), // undefined detects user browser settings
    supportedLngs: ['en'],
    fallbackLng: 'en',
    useCookie: false,
    resGetPath: 'locales/__lng__.json'
  });
  i18n.registerAppHelper(app);

  app.configure(function () {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.set('view options', { layout: false });
    app.use(express.json());
    app.use(express.urlencoded());
    app.use(express.methodOverride());
    if (!process.env.NODE_ENV) {
      app.use(express.logger('dev'));
    }
    app.use(express.static(__dirname + '/public'));
    app.use(express.cookieParser());
    app.use(express.session({
      secret: nconf.get('session_secret'),
      store: new RedisStore({ db: nconf.get('redis_db'), prefix: 'facespaces' }),
      cookie: { maxAge: maxAge }
    }));
    app.use(function (req, res, next) {
      res.locals.session = req.session;
      res.locals.csrf = csrf;

      if (!process.env.NODE_ENV) {
        res.locals.debug = true;
      } else {
        res.locals.debug = false;
      }
      res.locals.analytics = nconf.get('analytics');
      res.locals.analyticsHost = nconf.get('analyticsHost');
      next();
    });
    app.use(i18n.handle);
    app.enable('trust proxy');
    app.locals.pretty = true;
    app.use(app.router);
    app.use(function (req, res, next) {
      res.status(404);
      res.render('404', { url: req.url, layout: false });
      return;
    });
    app.use(function (req, res, next) {
      res.status(403);
      res.render('403', { url: req.url, layout: false });
      return;
    });
  });

  app.configure('development, test', function() {
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  });

  app.configure('prod', function() {
    app.use(function(err, req, res, next) {
      res.status(err.status || 500);
      res.render('500', { error: err, layout: false });
    });
    app.use(express.errorHandler());
  });

  return app;
};
