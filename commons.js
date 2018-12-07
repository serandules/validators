var mongoose = require('mongoose');
var _ = require('lodash');

var adminEmail = 'admin@serandives.com';

var users = {};

var groups = {};

var tiers = {};

exports.findUser = function (email, done) {
  var user = users[email];
  if (user) {
    return done(null, user);
  }
  var Users = mongoose.model('users');
  Users.findOne({email: email}, function (err, user) {
    if (err) {
      return done(err)
    }
    users[email] = user;
    done(null, user);
  });
};

exports.findGroup = function (user, name, done) {
  var o = groups[user] || (groups[user] = {});
  var group = o[name];
  if (group) {
    return done(null, group);
  }
  var Groups = mongoose.model('groups');
  Groups.findOne({user: user, name: name}, function (err, group) {
    if (err) {
      return done(err)
    }
    o[name] = group;
    done(null, group);
  });
};

exports.group = function (name, done) {
  exports.findUser(adminEmail, function (err, user) {
    if (err) {
      return done(err);
    }
    exports.findGroup(user, name, done);
  });
};

exports.grouped = function (user, name, done) {
  exports.group(name, function (err, o) {
    if (err) {
      return done(err);
    }
    var entry = _.find(user.groups, function (group) {
      return String(group) === o.id;
    });
    done(null, !!entry);
  });
};

exports.findTier = function (user, name, done) {
  var o = tiers[user] || (tiers[user] = {});
  var tier = o[name];
  if (tier) {
    return done(null, tier);
  }
  var Tiers = mongoose.model('tiers');
  Tiers.findOne({user: user, name: name}, function (err, tier) {
    if (err) {
      return done(err)
    }
    o[name] = tier;
    done(null, tier);
  });
};

exports.tier = function (name, done) {
  exports.findUser(adminEmail, function (err, user) {
    if (err) {
      return done(err);
    }
    exports.findTier(user.id, name, done);
  });
};

exports.permitOnly = function (ctx, query, actions, done) {
  // TODO actions --> [action]
  var user = ctx.user;
  if (ctx.previleged) {
    return done();
  }
  var restrict = function (done) {
    exports.group('public', function (err, pub) {
      if (err) {
        return done(err);
      }
      var groups;
      var permissions = [{
        group: pub.id,
        actions: actions
      }];
      if (user) {
        permissions.push({
          user: user.id,
          actions: actions
        });
        groups = user.groups;
        groups.forEach(function (group) {
          if (group === pub.id) {
            return
          }
          permissions.push({
            group: group, // TODO: may be populate the group
            actions: actions
          });
        });
      }
      query.permissions = {
        $elemMatch: {
          $or: permissions
        }
      };
      done();
    });
  };
  if (!user) {
    return restrict(done);
  }
  exports.grouped(user.groups, 'admin', function (err, yes) {
    if (err) {
      return done(err);
    }
    if (yes) {
      return done();
    }
    restrict(done);
  });
};
