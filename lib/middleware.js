var _ = require('underscore');
var path = require('path');
var request = require('request');
var source = require('../lib/source');
var style = require('../lib/style');
var tm = require('../lib/tm');

// Load defaults for new styles
var defaults = {};
style.info('tmstyle://' + path.dirname(require.resolve('tm2-default-style')), function(err, info) {
    if (err) throw err;
    var data = JSON.parse(JSON.stringify(info));
    delete data.id;
    defaults.style = data;
});

var middleware = {};

// Load user tilesets from the Mapbox API and include in source history.
middleware.userTilesets = function(req, res, next) {
    var oauth = tm.db.get('oauth');
    if (!oauth) return next(new Error('oauth required'));
    req.accesstoken = oauth.accesstoken;
    var url = tm.config().mapboxauth+'/api/Map?account='+oauth.account+'&_type=tileset&private=true&access_token='+oauth.accesstoken;
    request(url, function(err, resp, body) {
        if (err) return next(err);
        if (resp.statusCode !== 200) return next(new Error(resp.statusCode + ' GET ' + url));
        var tilesets;
        try { tilesets = JSON.parse(body); } catch(err) { next(err); }
        tilesets.forEach(function(t) {
            if (!t.metadata) return;
            if (t.metadata.format !== 'pbf') return;
            tm.history('source', 'mapbox:///' + t.id);
        });
        next();
    });
};

middleware.history = function(req, res, next) {
    req.history = {};
    var history = tm.history();
    var types = Object.keys(history);

    if (!types.length) return next();

    var load = function(type, queue) {
        if (!queue.length && !types.length) return next();
        if (!queue.length) {
            type = types.shift();
            queue = history[type].slice(0);
            return load(type, queue);
        }
        var id = queue.shift();
        var method = type === 'style' ? style.info : source.info;
        method(id, function(err, info) {
            if (err) {
                tm.history(type, id, true);
            } else {
                req.history[type] = req.history[type] || {};
                req.history[type][id] = info;
            }
            load(type, queue);
        });
    };
    var type = types.shift();
    var queue = history[type].slice(0);
    load(type, queue);
};

middleware.writeStyle = function(req, res, next) {
    var data = req.body.id ? req.body : _({id:style.tmpid()}).defaults(defaults.style);

    var write = function(err) {
        if (err) return next(err);
        style.save(data, function(err, s) {
            if (err) return next(err);
            if (!tm.tmpid('tmstyle:', s.data.id)) tm.history('style', s.data.id);
            req.style = s;
            next();
        });
    }
    if (data._recache && req.query.id) return source.invalidate(req.body.source, write);

    // Let source for new styles be specified via querystring.
    if (!req.body.id && req.query && req.query.source) return source(req.query.source, function(err, s) {
        if (err) return next(err);
        data.styles = {
            'style.mss': tm.templates.xraydefaultcarto(s.data.vector_layers)
        };
        data.source = req.query.source;
        write();
    });

    write();
}

middleware.loadStyle = function(req, res, next) {
    style(req.query.id, function(err, s) {
        // if (err.code === 'ENOENT' && style.tmpid(path.dirname(err.path).slice(1)) return writeStyle(req, res, next);
        if (err) return next(err);
        if (!tm.tmpid('tmstyle:', s.data.id)) tm.history('style', s.data.id);
        req.style = s;
        next();
    });
};

middleware.writeSource = function(req, res, next) {
    var data = req.body.id ? req.body : {id: source.tmpid()};
    source.save(data, function(err, s) {
        if (err) return next(err);
        if (!source.tmpid(s.data.id)) tm.history('source', s.data.id);
        req.source = s;
        next();
    });
};

middleware.loadSource = function(req, res, next) {
    source(req.query.id, function(err, s) {
        if (err) return next(err);
        if (!source.tmpid(s.data.id)) tm.history('source', s.data.id);
        req.source = s;
        req.style = s.style;
        next();
    });
};

middleware.auth = function(req, res, next) {
    if (!tm.db.get('oauth')) {
        var err = new Error('No active OAuth account');
        err.code = 'EOAUTH';
        return next(err);
    }
    next();
};

// Check for an active export. If present, redirect to the export page
// effectively locking the application from use until export is complete.
middleware.exporting = function(req, res, next) {
    tm.copytask(null, null, function(err, job) {
        if (err) {
            next(err);
        } else if (job && (req.path !== '/mbtiles' || req.query.id !== job.id)) {
            res.redirect('/mbtiles?id=' + job.id);
        } else {
            next();
        }
    });
};

module.exports = middleware;
