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
      tagger(value, function (err, tagz) {
        if (err) {
          return eachDone(err);
        }
        tagz.forEach(function (tag) {
          tag.name = field + ':' + tag.name;
        });
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
      return done(errors.serverError());
    }
    done(null, o.user.id);
  };
};

exports.createdAt = function (options) {
  options = options || {};
  return function (o, done) {
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

exports.permissions = function (options) {
  options = options || {};
  return function (o, done) {
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

