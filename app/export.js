window.Export = function(templates, source, job) {
  var Job = Backbone.Model.extend({});
  Job.prototype.url = function() { return '/mbtiles.json?id='+ source.id; };

  var Upload = Backbone.Model.extend({});
  Upload.prototype.url = function() { return '/upload.json?id='+ source.id; };

  var Modal = new views.Modal({
    el: $('.modal-content'),
    templates: templates
  });

  var Exporter = Backbone.View.extend({});
  Exporter.prototype.events = {
    'click .js-cancel': 'cancel',
    'click .js-recache': 'recache',
    'click .js-upload': 'upload'
  };
  Exporter.prototype.poll = function() {
    var model = this.model;
    var view = this;
    model.fetch({
      success:function() {
        if (!model.get('progress')) {
          console.log(model.get('type'), model.get('progress'))
          view.refresh();
        } else {
          view.timeout = setTimeout(view.poll, 200);
        }
      },
      error:function() {}
    });
  };
  Exporter.prototype.initialize = function() {
    _(this).bindAll('poll', 'refresh');
    this.model.on('change', this.refresh);
    this.poll();
  };
  Exporter.prototype.refresh = function() {
    console.log(this.model.get('type'), this.model.get('progress'));
    if (!this.model.get('progress')) {
      console.log('no progress, resetting');
      var pct = '100.0';
      var spd = 0;
      this.$('.size').text(templates.exportsize(this.model.get('size')));
      $('body').removeClass('task').addClass('stat');
    } else {
      var pct = this.model.get('progress').percentage || 0;
      var spd = this.model.get('progress').delta || 0;
      $('body').removeClass('stat').addClass('task');
    }
    var pctel = this.$('.percent');
    var target = parseFloat(pct);
    var tweenpct = function() {
      var current = parseFloat(pctel.text());
      if (target === 0) return pctel.text('0.0');
      if (current >= target) return;
      pctel.text((current + 0.1).toFixed(1));
      setTimeout(tweenpct,50/(target-current)|0);
    };
    tweenpct();
    this.$('.progress .fill').css({width:pct+'%'});
    this.$('.speed').text(spd);
  };
  Exporter.prototype.recache = function() {
    var view = this;
    if (this.model.get('type') != 'export') {
      job.type = 'export';
      this.model = new Job(job);
    }

    _(this).bindAll('poll', 'refresh');
    this.model.on('change', this.refresh);

    this.model.save({}, {
      success: function() { view.poll(); }
    });
    return false;
  };
  Exporter.prototype.upload = function() {
    var view = this;
    job.type = 'upload';
    job.progress = null;
    this.model = new Upload(job);

    _(this).bindAll('poll', 'refresh');
    this.model.on('change', this.refresh);

    this.model.save({}, {
      success: function() { view.poll(); }
    });
    return false;
  };
  Exporter.prototype.cancel = function(ev) {
    var href = $(ev.currentTarget).attr('href');
    if (this.timeout) clearTimeout(this.timeout);
    this.model.destroy({
      success: function() { window.location.href = href }
    });
    return false;
  };

  var exporter = new Exporter({
    el: document.body,
    model: new Job(job)
  });
};
