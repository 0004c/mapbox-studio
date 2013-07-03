#!/usr/bin/env node

// increase the libuv threadpool size to 1.5x the number of logical CPUs.
process.env.UV_THREADPOOL_SIZE = Math.ceil(Math.max(4, require('os').cpus().length * 1.5));

var _ = require('underscore');
var qs = require('querystring');
var tm = require('./lib/tm');
var fs = require('fs');
var path = require('path');
var source = require('./lib/source');
var project = require('./lib/project');
var express = require('express');
var argv = require('optimist')
    .config('config')
    .argv;

// Load defaults for new projects.
var defaults = {};
project({id:path.dirname(require.resolve('tm2-default-style'))}, function(err, proj) {
    if (err) throw err;
    var data = JSON.parse(JSON.stringify(proj.data));
    delete data.id;
    delete data._id;
    defaults.project = data;
});

var app = express();
app.use(express.bodyParser());
app.use(app.router);
app.use('/app', express.static(__dirname + '/app', { maxAge:3600e3 }));
app.use('/ext', express.static(__dirname + '/ext', { maxAge:3600e3 }));

app.param('project', function(req, res, next) {
    if (req.method === 'PUT' && req.body._recache && req.query.id) {
        source.invalidate(source.resolve(req.query.id, req.body.sources[0]), next);
    } else {
        next();
    }
}, function(req, res, next) {
    var id = req.query.id;
    var tmp = id && tm.tmpid(id);
    var data = false;
    if (req.method === 'PUT') {
        var data = req.body;
    } else if (tmp && req.path === '/project') {
        var data = defaults.project;
    }
    project({
        id: id,
        data: data,
        perm: !tmp && !!data
    }, function(err, project) {
        if (err && !tmp) tm.history(id, true);
        if (err) return next(err);
        if (!tmp) tm.history(id);
        req.project = project;
        req.project.data._tmp = tmp;
        return next();
    });
}, function(req, res, next) {
    // @TODO remove this -- sources should be edited through source UI.
    if (req.method === 'PUT' && req.project) {
        source({
            id: req.project._backend.data._id,
            data: req.project._backend.data,
            perm: true
        }, function(err, source) {
            if (err) return next(err);
            next();
        });
    } else {
        next();
    }
}, function(req, res, next) {
    if (!req.project) return next();

    // Set drawtime cookie for a given project.
    res.cookie('drawtime', _(project.stats(req.project.data.id, 'drawtime'))
        .reduce(function(memo, stat, z) {
            memo.push([z,stat.min,stat.avg|0,stat.max].join('-'));
            return memo;
        }, []).join('.'));

    // Set srcbytes cookie for a given project.
    res.cookie('srcbytes', _(project.stats(req.project.data.id, 'srcbytes')).
        reduce(function(memo, stat, z) {
            memo.push([z,stat.min,stat.avg|0,stat.max].join('-'));
            return memo;
        }, []).join('.'));
    next();
});

app.param('source', function(req, res, next) {
    if (req.method === 'PUT' && req.query.id) {
        source.invalidate(req.query.id, next);
    } else {
        next();
    }
}, function(req, res, next) {
    var id = req.query.id;
    var tmp = id && tm.tmpid(id);
    var data = false;
    if (req.method === 'PUT') {
        var data = req.body;
    } else if (tmp && req.path === '/source') {
        var data = {};
    }
    source({
        id: id,
        data: data,
        perm: !tmp && !!data
    }, function(err, source) {
        if (err) return next(err);
        req.source = source;
        return next();
    });
}, function(req, res, next) {
    project({
        id: req.query.id,
        data: {
            styles: [tm.templates.xraystyles(_(req.source.data.Layer).pluck('id'))],
            sources: [req.query.id]
        },
        perm: false
    }, function(err, project) {
        if (err) return next(err);
        req.project = project;
        req.project.data._tmp = true;
        return next();
    });
});

app.param('history', function(req, res, next) {
    req.history = {};
    var history = tm.history().concat([]); // Clone.

    var load = function() {
        if (!history.length) return next();
        var id = history.shift();
        project.info(id, function(err, info) {
            if (err) {
                tm.history(id, true);
            } else {
                req.history[id] = info;
            }
            load();
        });
    };
    load();
});

app.put('/:project(project)', function(req, res, next) {
    res.send({
        _recache:false,
        mtime:req.project.data.mtime,
        background:req.project.data.background
    });
});

app.get('/:project(project)', function(req, res, next) {
    tm.dirfiles(process.env.HOME, function(err, dirfiles) {
        if (err) return next(err);
        req.browse = {
            cwd: process.env.HOME,
            dir: dirfiles.filter(function(s) { return s.type === 'dir' })
        };
        return next();
    });
}, function(req, res, next) {
    res.set({'content-type':'text/html'});
    return res.send(tm.templates.project({
        cartoRef: require('carto').tree.Reference.data,
        sources: [req.project._backend.data],
        library: _(source.library).filter(function(source, s) {
            return !_(req.project.data.sources).include(s);
        }),
        browse: req.browse,
        project: req.project.data
    }));
});

app.get('/:project(project|source)/:z/:x/:y.grid.json', function(req, res, next) {
    var z = req.params.z | 0;
    var x = req.params.x | 0;
    var y = req.params.y | 0;
    req.project.getGrid(z,x,y, function(err, data, headers) {
        if (err && err.message === 'Tilesource not loaded') {
            return res.redirect(req.path);
        } else if (err) {
            return next(err);
        }
        headers['cache-control'] = 'max-age=3600';
        res.set(headers);
        return res.json(data);
    });
});

app.get('/:project(project|source)/:z/:x/:y.:format', function(req, res, next) {
    var z = req.params.z | 0;
    var x = req.params.x | 0;
    var y = req.params.y | 0;
    var done = function(err, data, headers) {
        if (err && err.message === 'Tilesource not loaded') {
            return res.redirect(req.path);
        } else if (err) {
            return next(err);
        }

        // Add stats for this tile render to project stats.
        project.stats(req.project.data.id, 'drawtime', z, data._drawtime);
        project.stats(req.project.data.id, 'srcbytes', z, data._srcbytes);

        headers['cache-control'] = 'max-age=3600';
        res.set(headers);
        return res.send(data);
    };
    done.format = req.params.format || 'png';
    req.project.getTile(z,x,y, done);
});

app.get('/:project(project).xml', function(req, res, next) {
    res.set({'content-type':'text/xml'});
    return res.send(req.project._xml);
});

app.get('/:source(source).xml', function(req, res, next) {
    res.set({'content-type':'text/xml'});
    return res.send(req.source._xml);
});

app.get('/:source(source)', function(req, res, next) {
    res.set({'content-type':'text/html'});
    return res.send(tm.templates.source({
        source: req.source.data
    }));
});

app.put('/:source(source)', function(req, res, next) {
    res.send({
        mtime:req.source.data.mtime
    });
});

app.post('/export/:project(package)', function(req, res, next) {
    project.toPackage({
        id: req.project.data.id,
        filepath: req.body && req.body.filepath
    }, function(err) {
        if (err) next(err);
        res.send({});
    });
});

app.get('/browse/saveas*', function(req, res, next) {
    tm.dirfiles('/' + req.params[0], function(err, dirfiles) {
        if (err) return next(err);
        dirfiles = dirfiles.filter(function(s) {
            return s.type === 'dir' && path.extname(s.path) !== '.tm2'
        });
        res.send(dirfiles);
    });
});

app.get('/browse/exportas*', function(req, res, next) {
    tm.dirfiles('/' + req.params[0], function(err, dirfiles) {
        if (err) return next(err);
        dirfiles = dirfiles.filter(function(s) {
            if (s.type === 'dir') return path.extname(s.path) !== '.tm2';
            if (s.type === 'file') return path.extname === '.tm2z';
        });
        res.send(dirfiles);
    });
});

app.get('/thumb.png', function(req, res, next) {
    if (!req.query.id) return next(new Error('No id specified'));
    project.thumb({id:req.query.id}, function(err, thumb) {
        if (err) return next(err);
        res.set({'content-type':'image/png'});
        res.send(thumb);
    });
});

app.get('/app/lib.js', function(req, res, next) {
    res.set({
        'content-type':'application/javascript',
        'cache-control':'max-age=3600'
    });
    res.send(tm.templates.libjs({
        cartoRef: require('carto').tree.Reference.data
    }));
});

app.get('/:newproject(new)', function(req, res, next) {
    res.redirect('/project?id=' + tm.tmpid());
});

app.get('/:history()', function(req, res, next) {
    res.set({'content-type':'text/html'});
    return res.send(tm.templates.history({
        history: req.history
    }));
});

app.use(function(err, req, res, next) {
    // Error on loading a tile, send 404.
    if (err && 'z' in req.params) return res.send(err.toString(), 404);
    // Otherwise 500 for now.
    if (/application\/json/.test(req.headers.accept)) {
        res.set({'content-type':'application/javascript'});
        res.send({message:err.toString()}, 500);
    } else if (/text\/html/.test(req.headers.accept)) {
        res.send(tm.templates.error({ error:err }));
    } else {
        res.send(err.toString(), 500);
    }
});

app.listen(3000);
console.log('TM2 @ http://localhost:3000/');
