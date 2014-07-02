'use strict';

var assert = chai.assert;

mocha.setup('bdd');

// Override window methods for the test runner.
window.confirm = function(message) { return true; };

// Global queue for testing post-ajax request. Use by calling
//
// onajax(function() {
//   // run once after the next ajax request completes
// });
var _onajax = [];
function onajax(callback) {
    _onajax.push(callback);
}
$(document).ajaxComplete(function() {
    if (!_onajax.length) return;
    var callback = _onajax.shift();
    // This setTimeout prevents the onajax callback from being called
    // before the actual ajax call's success/error handlers are called.
    setTimeout(function() { callback(); }, 100);
});

function hasModal(selector) {
    return $('#modal-content ' + selector).size() > 0;
}

/*
TODO - https://github.com/mapbox/tm2/issues/203
beforeEach(function() {
    event = document.createEvent('HTMLEvents');
});

it('saves a project', function() {
    el = document.getElementById('title').getElementsByClassName('js-save')[0];
    event.initEvent('click', true, false);
    el.dispatchEvent(event);

    var form = document.getElementById('saveas');
    form.getElementsByTagName('input')[1].value = 'foo.tm2';
    var submit = document.createEvent('HTMLEvents');
    submit.initEvent('submit', true, false);
    form.dispatchEvent(submit);
});
*/

describe('.js-history', function() {
    it('browses sources', function() {
        $('.js-history .js-browsesource').click();
        assert.ok(hasModal('#browsesource'));
    });

    it('browses styles', function() {
        $('.js-history .js-browsestyle').click();
        assert.ok(hasModal('#browsestyle'));
    });

    it('removes history style', function(done) {
        var count = $('#history-style .project').size();
        $('.js-history .js-ref-delete:eq(0)').click();
        onajax(function() {
            assert.equal(count - 1, $('#history-style .project').size());
            done();
        });
    });
});

describe('#style-ui', function() {
    it('creates a new tab', function() {
        $('.js-addtab:eq(0)').click();
        assert.ok(hasModal('form#addtab'));

        $('#addtab-filename').val('foo');
        $('#addtab').submit();

        // Submit removes modal.
        assert.equal(0, $('#addtab-filename').size());

        // Automatically adds .mss extension.
        assert.equal('foo.mss', $('#tabs .js-tab:last').attr('rel'));
    });

    it('clicks set tabs as active', function() {
        $('#tabs .js-tab:eq(1)').click();
        assert.ok($('#tabs .js-tab:eq(1)').hasClass('active'));
        assert.ok(!$('#tabs .js-tab:eq(0)').is('.active'));

        $('#tabs .js-tab:eq(0)').click();
        assert.ok($('#tabs .js-tab:eq(0)').hasClass('active'));
        assert.ok(!$('#tabs .js-tab:eq(1)').is('.active'));
    });

    it('keys set tabs as active', function() {
        var e;
        // ctrl+alt+1
        e = $.Event('keydown');
        e.which = ('1').charCodeAt(0);
        e.altKey = true;
        e.ctrlKey = true;
        $('body').trigger(e);
        assert.ok($('#tabs .js-tab:eq(0)').hasClass('active'));
        assert.ok(!$('#tabs .js-tab:eq(1)').is('.active'));

        // ctrl+alt+2
        e = $.Event('keydown');
        e.which = ('2').charCodeAt(0);
        e.altKey = true;
        e.ctrlKey = true;
        $('body').trigger(e);
        assert.ok($('#tabs .js-tab:eq(1)').hasClass('active'));
        assert.ok(!$('#tabs .js-tab:eq(0)').is('.active'));
    });

    it('deletes a tab', function() {
        var count = $('#tabs .js-tab').size();
        $('#tabs .js-deltab:eq(0)').click();
        assert.equal(count - 1, $('#tabs .js-tab').size());
    });

    it('prevents duplicate extensions in filename', function() {
        $('.js-addtab:eq(0)').click();
        assert.ok(hasModal('#addtab'));

        $('#addtab-filename').val('bar.mss');
        $('#addtab').submit();

        // Submit removes modal.
        assert.ok(!hasModal('#addtab'));

        // Prevents duplicate .mss extension.
        assert.equal('bar.mss', $('#tabs .js-tab:last').attr('rel'));
    });

    it('requires unique stylesheet name', function() {
        $('.js-addtab:eq(0)').click();
        assert.ok(hasModal('form#addtab'));

        $('#addtab-filename').val('baz');
        $('#addtab').submit();

        $('.js-addtab:eq(0)').click();
        assert.ok(hasModal('form#addtab'));

        $('#addtab-filename').val('baz');
        $('#addtab').submit();

        assert.ok(hasModal('#error'));
        assert.equal('Tab name must be different than existing tab "baz"', $('#error > pre').text());
    });
});

describe('.js-layers', function() {
    it('opens layer description', function() {
        $('.js-layers .js-tab:eq(0)').click();
        assert.ok($('.js-layers .js-tab:eq(0)').hasClass('active'));
    });

    it('shows sources modal', function(done) {
        $('.js-layers .js-modalsources:eq(0)').click();
        onajax(function() {
            assert.ok(hasModal('#modalsources'));
            $('#modalsources-remote .js-adddata:eq(0)').click();
            onajax(function() {
                assert.ok(!hasModal('#modalsources'));
                done();
            });
        });
    });
});

describe('#reference', function() {
    it('tabs through CartoCSS reference', function() {
        $('#reference .js-tab:last').click();
        var target = $('#' + $('#reference .js-tab:last').attr('href').split('#').pop());
        assert.ok($('#reference .js-tab:last').hasClass('active'));
        assert.ok(target.hasClass('active'));
    });
});

mocha.ignoreLeaks();

if (window.mochaPhantomJS) {
    mochaPhantomJS.run();
} else {
    mocha.run();
}
