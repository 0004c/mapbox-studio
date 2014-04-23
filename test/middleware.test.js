var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var tm = require('../lib/tm');
var middleware = require('../lib/middleware');
var style = require('../lib/style');
var source = require('../lib/source');
var tilelive = require('tilelive');
var yaml = require('js-yaml');

describe('middleware', function() {
    var tmppath = '/tmp/tm2-test-' + +new Date;
    before(function(done) {
        tm.config({
            db: path.join(tmppath, 'app.db'),
            cache: path.join(tmppath, 'cache')
        }, done);
    });
    after(function(done) {
        try { fs.unlinkSync(path.join(tmppath, 'app.db')); } catch(err) {}
        try { fs.rmdirSync(path.join(tmppath, 'cache')); } catch(err) {}
        try { fs.rmdirSync(tmppath); } catch(err) {}
        done();
    });

    describe('history', function() {
        var sourceId = 'tmsource://' + path.resolve(path.dirname(__filename), './fixtures-localsource');
        var styleId = 'tmstyle://' + path.resolve(path.dirname(__filename), './fixtures-localsource');

        after(function(done) {
            tm.history('source', sourceId, true);
            tm.history('style', styleId, true);
            done();
        });
        it('loads history', function(done) {
            this.timeout(10000);
            var req = {};
            middleware.history(req, {}, function() {
                assert(req.history, 'has history');
                assert(req.history.source, 'history object includes a source');
                assert(req.history.source['mapbox:///mapbox.mapbox-streets-v4'], 'default source is listed');
                done();
            });
        });
        it('gets style/source info', function(done) {
            var sourceDoc = require('./fixtures-localsource/data.yml');
            var styleDoc = require('./fixtures-localsource/project.yml');
            tm.history('source', sourceId);
            tm.history('style', styleId);

            var req = {};
            middleware.history(req, {}, function() {
                var sourceInfo = req.history.source[sourceId];
                var styleInfo = req.history.style[styleId];
                assert.equal(sourceDoc.attribution, sourceInfo.attribution, 'source info was loaded');
                assert.equal(styleDoc.mtime, styleInfo.mtime, 'style info was loaded');
                done();    
            });
        });
        it('removes dead source/styles', function(done) {
            tm.history('source', 'foo');
            tm.history('style', 'bar');
            var req = {};
            middleware.history(req, {}, function() {
                assert(!req.history.source.foo, 'source `foo` was removed');
                if (req.history.style) assert(!req.history.style.bar, 'style `bar` was removed');
                done();
            });
        });
    });

    describe('writeStyle', function() {
        var tmpId = '/tmp/tm2-perm-' + (+new Date);
        after(function(done) {
            setTimeout(function() {
                ['project.xml','project.yml','a.mss','.thumb.png'].forEach(function(file) {
                    try { fs.unlinkSync(tmpId + '/' + file) } catch(err) {};
                });
                try { fs.rmdirSync(tmpId) } catch(err) {};
                done();
            }, 250);
        });
        it('makes tmp styles', function(done) {
            var req = { body: {} };
            middleware.writeStyle(req, {}, function() {
                assert(req.style, 'appends style to req');
                assert(tm.tmpid('tmstyle:', req.style.data.id), 'creates a valid tmp id');
                var history = tm.history();
                if (history.style) {
                    assert(history.style.indexOf(req.style.data.id) === -1, 'does not write to history');
                }

                style.info('tmstyle://' + path.dirname(require.resolve('tm2-default-style')), function(err, defaultInfo) {
                    delete req.style.data.id;
                    delete req.style.data.mtime;
                    delete req.style.data._tmp;
                    delete req.style.data.background;
                    delete defaultInfo.id;
                    delete defaultInfo.mtime;
                    
                    assert.deepEqual(req.style.data, defaultInfo, 'mimics default style');
                    done(); 
                });
            });
        });
        it('makes persistent styles', function(done) {
            var data = {
                id:'tmstyle://' + tmpId,
                name:'tmp-1234',
                source:'mapbox:///mapbox.mapbox-streets-v2',
                styles:{ 'a.mss': '#water { polygon-fill:#fff }' }
            };
            var req = { body: data };
            middleware.writeStyle(req, {}, function() {
                assert(req.style, 'appends style to req');
                assert(!tm.tmpid('tmstyle:', req.style.data.id), 'does not create a tmp id');
                assert(tm.history().style.indexOf(req.style.data.id) !== -1, 'writes to history');
                assert.equal(req.style.data.name, data.name, 'has correct info');
                assert.ok(/maxzoom: 22/.test(fs.readFileSync(tmpId + '/project.yml', 'utf8')), 'saves project.yml');
                assert.equal(data.styles['a.mss'], fs.readFileSync(tmpId + '/a.mss', 'utf8'), 'saves a.mss');
                done();
            });
        });
        // @TODO: testing this requires some work on source.invalidate
        // it('invalidates source if req._recache', function() {
        //     done();
        // });
    });
    
    describe('loadStyle', function() {
        it('loads a tmp style', function(done) {
            var writeReq = { body: {} };
            middleware.writeStyle(writeReq, {}, function() {
                var req = { query: { id: writeReq.style.data.id } };
                middleware.loadStyle(req, {}, function() {
                    assert(req.style, 'appends style to req');
                    assert.equal(req.style.data.id, writeReq.style.data.id, 'has the correct id');
                    var history = tm.history();
                    if (history.style) {
                        assert(history.style.indexOf(req.style.data.id) === -1, 'does not write to history');
                    }
                    done();
                });
            });
        });
        it('loads a persistent style', function(done) {
            var styleId = 'tmstyle://' + path.resolve(path.dirname(__filename), './fixtures-localsource');
            var styleDoc = require('./fixtures-localsource/project.yml');
            var req = { query: { id: styleId } };
            middleware.loadStyle(req, {}, function() {
                assert(req.style, 'appends style to req');
                assert.equal(req.style.data.id, styleId, 'has the correct id');
                assert(tm.history().style.indexOf(req.style.data.id) !== -1, 'writes to history');
                assert.equal(req.style.data.mtime, styleDoc.mtime, 'style info was loaded');
                done();
            });
        });
    });

    describe('writeSource', function() {
        var tmpId = '/tmp/tm2-perm-' + (+new Date);
        after(function(done) {
            setTimeout(function() {
                ['data.xml', 'data.yml'].forEach(function(file) {
                    try { fs.unlinkSync(tmpId + '/' + file) } catch(err) {};
                });
                try { fs.rmdirSync(tmpId) } catch(err) {};
                done();
            }, 250);
        });
        it('makes tmp sources', function(done) {
            var req = { body: {} };
            middleware.writeSource(req, {}, function() {
                assert(req.source, 'appends source to req');
                assert(source.tmpid(req.source.data.id), 'creates a valid tmp id');
                var history = tm.history();
                if (history.source) {
                    assert(history.source.indexOf(req.source.data.id) === -1, 'does not write to history');
                }
                done();
            });
        });
        it('makes persistent sources', function(done) {
            var data = {
                id: 'tmsource://' + tmpId,
                name: 'Test source',
                attribution: '&copy; John Doe 2013.',
                minzoom: 0,
                maxzoom: 6,
                Layer: [ {
                    id: 'box',
                    name: 'box',
                    description: '',
                    srs: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0.0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs +over',
                    properties: {
                        'buffer-size': 0,
                        minzoom: 0,
                        maxzoom: 6
                    },
                    Datasource: {
                        file: __dirname + '/fixtures-localsource/10m-900913-bounding-box.shp',
                        type: 'shape'
                    }
                } ]
            };
            var req = { body: data };
            middleware.writeSource(req, {}, function() {
                var s = req.source;
                assert(s, 'appends source to req');
                assert(!source.tmpid(s.data.id), 'does not creates a tmp id');
                var history = tm.history();
                if (history.source) {
                    assert(history.source.indexOf(s.data.id) !== -1, 'writes to history');
                }
                assert.deepEqual(s.data, data, 'has the right data');
                done();
            });
        });
    });
    
    describe('loadSource', function() {
        it('loads a tmp source', function(done) {
            var writeReq = { body: {} };
            middleware.writeSource(writeReq, {}, function() {
                var req = { query: { id: writeReq.source.data.id } };
                middleware.loadSource(req, {}, function() {
                    assert(req.source, 'appends source to req');
                    assert.equal(req.source.data.id, writeReq.source.data.id, 'has the correct id');
                    var history = tm.history();
                    if (history.source) {
                        assert(history.source.indexOf(req.source.data.id) === -1, 'does not write to history');
                    }
                    done();
                });
            });
        });
        it('loads a persistent source', function(done) {
            var sourceId = 'tmsource://' + path.resolve(path.dirname(__filename), './fixtures-localsource');
            var sourceDoc = require('./fixtures-localsource/data.yml');
            var req = { query: { id: sourceId } };
            middleware.loadSource(req, {}, function() {
                assert(req.source, 'appends source to req');
                assert.equal(req.source.data.id, sourceId, 'has the correct id');
                assert(tm.history().source.indexOf(req.source.data.id) !== -1, 'writes to history');
                assert.equal(req.source.data.name, sourceDoc.name, 'has the correct name');
                assert.equal(req.source.data.attribution, sourceDoc.attribution, 'has the correct attribution');
                assert.equal(req.source.data.minzoom, sourceDoc.minzoom, 'has the correct minzoom');
                assert.equal(req.source.data.maxzoom, sourceDoc.maxzoom, 'has the correct maxzoom');
                assert.deepEqual(req.source.data.Layer[0].Datasource, sourceDoc.Layer[0].Datasource, 'has the correct Layer');
                done();
            });
        });
    });
});