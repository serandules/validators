var async = require('async');
var crypto = require('crypto');
var utils = require('utils');

var errors = require('errors');
var commons = require('./commons');

exports.values = {};

exports.tier = function (options) {
  return function (o, done) {
    var user = o.user;
    utils.grouped(user, 'admin', function (err, yes) {
      if (err) {
        return done(err);
      }
      var name = yes ? 'unlimited' : 'basic';
      utils.tier(name, function (err, tier) {
        if (err) {
          return done(err);
        }
        done(null, tier);
      });
    });
  };
};

exports.tags = function (options) {
  options = options || {};
  return function (o, done) {
    var tags = [];
    var fields = Object.keys(options);
    var data = o.data;
    async.each(fields, function (field, eachDone) {
      var value = data[field];
      if (!value) {
        return eachDone();
      }
      var tagger = options[field];
      tagger(field, value, function (err, tagz) {
        if (err) {
          return eachDone(err);
        }
        tags = tags.concat(tagz);
        eachDone();
      });
    }, function (err) {
      done(err, tags);
    });
  };
};

exports.user = function (options) {
  options = options || {};
  return function (o, done) {
    var user = o.user;
    if (!user) {
      return done();
    }
    var uid = o.found ? o.found.user : user.id;
    done(null, uid);
  };
};

exports.status = function (options) {
  options = options || {};
  return function (o, done) {
    var overrides = o.overrides;
    if (overrides.status) {
      return done(null, overrides.status);
    }
    if (o.found) {
      return done(null, o.found.status);
    }
    utils.workflow(options.workflow, function (err, workflow) {
      if (err) {
        return done(err);
      }
      if (!workflow) {
        return done(new Error('!workflow'));
      }
      done(null, workflow.start);
    });
  };
};

exports.createdAt = function (options) {
  options = options || {};
  return function (o, done) {
    var found = o.found;
    if (found) {
      return done(null, found.createdAt);
    }
    done(null, new Date());
  };
};

exports.updatedAt = function (options) {
  options = options || {};
  return function (o, done) {
    var overrides = o.overrides;
    if (overrides.updatedAt) {
      return done(null, overrides.updatedAt);
    }
    var found = o.found;
    if (found) {
      return done(null, found.updatedAt);
    }
    done(null, new Date());
  };
};

exports.groups = function (options) {
  options = options || {};
  return function (o, done) {
    utils.group('public', function (err, pub) {
      if (err) {
        return done(err);
      }
      done(null, [pub.id]);
    });
  };
};

exports.random = function (options) {
  var size = options.size || 96;
  return function (o, done) {
    crypto.randomBytes(size, function (err, buf) {
      if (err) {
        return done(err);
      }
      done(null, buf.toString('hex'));
    });
  };
};

exports._ = function (options) {
  return function (o, done) {
    var oo = {};
    var data = o.data;
    var found = o.found;
    if (!found) {
      return done(null, oo);
    }
    var verified = found._ && found._.verified || {};
    Object.keys(verified).forEach(function (field) {
      if (found[field] !== data[field]) {
        return
      }
      var v = oo.verified || (oo.verified = {});
      v[field] = verified[field];
    });
    done(null, oo);
  };
};

exports.permissions = function (options) {
  options = options || {};
  return function (o, done) {
    if (options.workflow) {
      utils.workflow(options.workflow, function (err, workflow) {
        if (err) {
          return done(err);
        }
        var data = o.data;
        var found = o.found;
        var status = data.status;
        var user = (found && found.user) || (o.user && o.user.id);
        utils.toPermissions(user, workflow, status, data, done);
      });
      return;
    }
    utils.group('admin', function (err, admin) {
      if (err) {
        return done(err);
      }
      var value = [{
        group: admin.id,
        actions: ['*']
      }];
      var user = o.user;
      if (user) {
        value.push({
          user: user.id,
          actions: options.actions
        });
      }
      done(null, value);
    });
  };
};

exports.visibility = function (options) {
  options = options || {};
  return function (o, done) {
    if (options.workflow) {
      utils.workflow(options.workflow, function (err, workflow) {
        if (err) {
          return done(err);
        }
        var data = o.data;
        var found = o.found;
        var status = data.status;
        var user = (found && found.user) || (o.user && o.user.id);
        utils.toVisibility(user, workflow, status, data, done);
      });
      return;
    }
    utils.group('admin', function (err, admin) {
      if (err) {
        return done(err);
      }
      var all = {
        groups: [admin.id],
        users: []
      };
      var user = o.user;
      if (user) {
        all.users.push(user.id);
      }
      done(null, {
        '*': all
      });
    });
  };
};

