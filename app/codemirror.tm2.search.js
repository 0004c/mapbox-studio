// Codemirror search for tm2
// ===========================
// - Combines dialog.js and search.js together
// - Dialog cleanup and uses mapbox.com/base class structure.
//
// Define search commands. Depends on dialog.js or another
// implementation of the openDialog method.
// Replace works a little oddly -- it will do the replace on the next
// Ctrl-G (or whatever is bound to findNext) press. You prevent a
// replace by making sure the match is no longer selected when hitting
// Ctrl-G.
(function (mod) {
    mod(CodeMirror);
})(function (CodeMirror) {
    'use strict';

    function dialogDiv(cm, template, bottom) {
        var wrap = cm.getWrapperElement();
        var dialog;
        dialog = wrap.appendChild(document.createElement('div'));
        if (bottom) {
            dialog.className = 'CodeMirror-dialog CodeMirror-dialog-bottom';
        } else {
            dialog.className = 'CodeMirror-dialog CodeMirror-dialog-top';
        }
        if (typeof template == 'string') {
            dialog.innerHTML = template;
        } else { // Assuming it"s a detached DOM element.
            dialog.appendChild(template);
        }
        return dialog;
    }

    function closeNotification(cm, newVal) {
        if (cm.state.currentNotificationClose)
            cm.state.currentNotificationClose();
        cm.state.currentNotificationClose = newVal;
    }

    CodeMirror.defineExtension('openDialog', function (template, callback, options) {
        var closed, helpActive = closed = false;
        closeNotification(this, null);
        var dialog = dialogDiv(this, template, options && options.bottom);
        var inp = dialog.getElementsByTagName('input')[0],
            help = document.getElementById('dialog-help'),
            cl = document.getElementById('dialog-close'),
            button,
            me = this;

        function close() {
            if (closed || helpActive) return;
            closed = true;
            dialog.parentNode.removeChild(dialog);
        }

        CodeMirror.on(help, 'mousedown', function(e) {
            helpActive = true;
        });

        CodeMirror.on(cl, 'mousedown', function(e) {
            helpActive = false;
            close();
        });

        if (inp) {
            if (options && options.value) inp.value = options.value;
            CodeMirror.on(inp, 'keydown', function(e) {
                if (options && options.onKeyDown && options.onKeyDown(e, inp.value, close)) {
                    return;
                }
                if (e.keyCode == 13 || e.keyCode == 27) {
                    inp.blur();
                    CodeMirror.e_stop(e);
                    helpActive = false;
                    close();
                    me.focus();
                    if (e.keyCode == 13) callback(inp.value);
                }
            });
            if (options && options.onKeyUp) {
                CodeMirror.on(inp, 'keyup', function(e) {
                    options.onKeyUp(e, inp.value, close);
                });
            }
            if (options && options.value) inp.value = options.value;
            inp.focus();

            CodeMirror.on(inp, 'blur', close);
        } else if (button = dialog.getElementsByTagName('button')[0]) {
            CodeMirror.on(button, 'click', function() {
                close();
                me.focus();
            });
            button.focus();
            CodeMirror.on(button, 'blur', close);
        }

        return close;
    });

    CodeMirror.defineExtension('openConfirm', function (template, callbacks, options) {
        var closed, helpActive = closed = false;
        closeNotification(this, null);
        var dialog = dialogDiv(this, template, options && options.bottom);
        var buttons = dialog.getElementsByTagName('button'),
            help = document.getElementById('dialog-help'),
            cl = document.getElementById('dialog-close'),
            me = this,
            blurring = 1;

        function close() {
            if (closed || helpActive) return;
            closed = true;
            dialog.parentNode.removeChild(dialog);
            me.focus();
        }

        CodeMirror.on(help, 'mousedown', function(e) {
            helpActive = true;
        });

        CodeMirror.on(cl, 'mousedown', function(e) {
            helpActive = false;
            close();
        });

        buttons[0].focus();
        for (var i = 0; i < buttons.length; ++i) {
            var b = buttons[i];
            (function (callback) {
                CodeMirror.on(b, 'click', function (e) {
                    CodeMirror.e_preventDefault(e);
                    close();
                    if (callback) callback(me);
                });
            })(callbacks[i]);
            CodeMirror.on(b, 'blur', function() {
            --blurring;
            setTimeout(function() { if (blurring <= 0) close(); }, 200);
            });
            CodeMirror.on(b, 'focus', function () {
                ++blurring;
            });
        }
    });

    function searchOverlay(query, caseInsensitive) {
        var startChar;
        if (typeof query == 'string') {
            startChar = query.charAt(0);
            query = new RegExp('^' + query.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&'),
                caseInsensitive ? 'i' : '');
        } else {
            query = new RegExp('^(?:' + query.source + ')', query.ignoreCase ? 'i' : '');
        }
        return {
            token: function (stream) {
                if (stream.match(query)) return 'searching';
                while (!stream.eol()) {
                    stream.next();
                    if (startChar && !caseInsensitive)
                        stream.skipTo(startChar) || stream.skipToEnd();
                    if (stream.match(query, false)) break;
                }
            }
        };
    }

    function SearchState() {
        this.posFrom = this.posTo = this.query = null;
        this.overlay = null;
    }

    function getSearchState(cm) {
        return cm.state.search || (cm.state.search = new SearchState());
    }

    function queryCaseInsensitive(query) {
        return typeof query == 'string' && query == query.toLowerCase();
    }

    function getSearchCursor(cm, query, pos) {
        // Heuristic: if the query string is all lowercase, do a case insensitive search.
        return cm.getSearchCursor(query, pos, queryCaseInsensitive(query));
    }

    function dialog(cm, text, shortText, deflt, f) {
        cm.openDialog(text, f, {
            value: deflt
        });
    }

    function confirmDialog(cm, text, shortText, fs) {
        if (cm.openConfirm) cm.openConfirm(text, fs);
        else if (confirm(shortText)) fs[0]();
    }

    function parseQuery(query) {
        var isRE = query.match(/^\/(.*)\/([a-z]*)$/);
        if (isRE) {
            query = new RegExp(isRE[1], isRE[2].indexOf('i') == -1 ? '' : 'i');
            if (query.test('')) query = /x^/;
        } else if (query == '') {
            query = /x^/;
        }
        return query;
    }

    var helpText = '<div id="search-help" class="clearfix keyline-bottom keyline-top small fill-white search-help hidden">'+
    '<div class="pad1">Use /re/ syntax for regex search</div>'+
    '<div class="pad1x keyline-right col6 space-bottom2">'+
      '<span class="code inline"> <kbd>Cmd</kbd>+<kbd>F</kbd> Find</span><br/>'+
      '<span class="code inline"><kbd>Cmd</kbd>+<kbd>G</kbd> Next</span> '+
    '</div>' +
    '<div class="pad1x col6 space-bottom2">'+
      '<span class="code inline"><kbd>Shift</kbd>+<kbd>Cmd</kbd>+<kbd>G</kbd> Prev</span><br/>'+
      '<span class="code inline"><kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> Find & Replace All</span>'+
    '</div>' +
    '</div>';
    var infoAndClose = "<div class='pin-right pad1'><a href='#search-help' id='dialog-help' class='inline icon help quiet'></a><a href='#' id='dialog-close' class='inline icon x quiet'></a></div>";
    var queryDialog = "<fieldset class='with-icon'><span class='icon search'></span><input type='text' value='' class='stretch'></fieldset>" + infoAndClose + helpText;

    function doSearch(cm, rev) {
        var state = getSearchState(cm);
        if (state.query) return findNext(cm, rev);
        dialog(cm, queryDialog, 'Search for:', cm.getSelection(), function (query) {
            cm.operation(function () {
                if (!query || state.query) return;
                state.query = parseQuery(query);
                cm.removeOverlay(state.overlay, queryCaseInsensitive(state.query));
                state.overlay = searchOverlay(state.query, queryCaseInsensitive(state.query));
                cm.addOverlay(state.overlay);
                state.posFrom = state.posTo = cm.getCursor();
                findNext(cm, rev);
            });
        });
    }

    function findNext(cm, rev) {
        cm.operation(function () {
            var state = getSearchState(cm);
            var cursor = getSearchCursor(cm, state.query, rev ? state.posFrom : state.posTo);
            if (!cursor.find(rev)) {
                cursor = getSearchCursor(cm, state.query, rev ? CodeMirror.Pos(cm.lastLine()) : CodeMirror.Pos(cm.firstLine(), 0));
                if (!cursor.find(rev)) return;
            }
            cm.setSelection(cursor.from(), cursor.to());
            cm.scrollIntoView({
                from: cursor.from(),
                to: cursor.to()
            });
            state.posFrom = cursor.from();
            state.posTo = cursor.to();
        });
    }

    function clearSearch(cm) {
        cm.operation(function () {
            var state = getSearchState(cm);
            if (!state.query) return;
            state.query = null;
            cm.removeOverlay(state.overlay);
        });
    }

    var replaceQueryDialog = "<fieldset><label class='pad1 block keyline-bottom'>Replace:</label><fieldset class='with-icon'><span class='icon search'></span><input type='text' value='' class='stretch' /></fieldset></fieldset>" + infoAndClose + helpText;
    var replacementQueryDialog = "<fieldset><label class='pad1 block keyline-bottom'>With:</label><fieldset class='with-icon'><span class='icon search'></span><input type='text' value='' class='stretch' /></fieldset></fieldset>" + infoAndClose + helpText;
    var doReplaceConfirm = "<fieldset class='pad1 space'><label class='inline'>Replace?</label><div class='inline pill'><button class='pad2x short'>Yes</button><button class='short pad2x'>No</button></div></fieldset>" + infoAndClose + helpText;

    function replace(cm, all) {
        dialog(cm, replaceQueryDialog, 'Replace:', cm.getSelection(), function (query) {
            if (!query) return;
            query = parseQuery(query);
            dialog(cm, replacementQueryDialog, 'Replace with:', '', function (text) {
                if (all) {
                    cm.operation(function () {
                        for (var cursor = getSearchCursor(cm, query); cursor.findNext();) {
                            if (typeof query != 'string') {
                                var match = cm.getRange(cursor.from(), cursor.to()).match(query);
                                cursor.replace(text.replace(/\$(\d)/g, function (_, i) {
                                    return match[i];
                                }));
                            } else cursor.replace(text);
                        }
                    });
                } else {
                    clearSearch(cm);
                    var cursor = getSearchCursor(cm, query, cm.getCursor());
                    var advance = function () {
                        var start = cursor.from(),
                            match;
                        if (!(match = cursor.findNext())) {
                            cursor = getSearchCursor(cm, query);
                            if (!(match = cursor.findNext()) ||
                                (start && cursor.from().line == start.line && cursor.from().ch == start.ch)) return;
                        }
                        cm.setSelection(cursor.from(), cursor.to());
                        cm.scrollIntoView({
                            from: cursor.from(),
                            to: cursor.to()
                        });
                        confirmDialog(cm, doReplaceConfirm, 'Replace?', [
                            function () {
                                doReplace(match);
                            },
                            advance
                        ]);
                    };
                    var doReplace = function (match) {
                        cursor.replace(typeof query == 'string' ? text :
                            text.replace(/\$(\d)/g, function (_, i) {
                                return match[i];
                            }));
                        advance();
                    };
                    advance();
                }
            });
        });
    }

    CodeMirror.commands.find = function (cm) {
        clearSearch(cm);
        doSearch(cm);
    };
    CodeMirror.commands.findNext = doSearch;
    CodeMirror.commands.findPrev = function (cm) {
        doSearch(cm, true);
    };
    CodeMirror.commands.clearSearch = clearSearch;
    CodeMirror.commands.replace = replace;
    CodeMirror.commands.replaceAll = function (cm) {
        replace(cm, true);
    };
});
