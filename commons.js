var utils = require('utils');

exports.permitOnly = function (ctx, query, actions, done) {
  // TODO actions --> [action]
  var user = ctx.user;
  if (ctx.previleged) {
    return done();
  }
  var restrict = function (done) {
    utils.group('public', function (err, pub) {
      if (err) {
        return done(err);
      }
      utils.group('anonymous', function (err, anon) {
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
        } else {
          permissions.push({
            group: anon.id,
            actions: actions
          });
        }
        query.permissions = {
          $elemMatch: {
            $or: permissions
          }
        };
        done();
      });
    });
  };
  if (!user) {
    return restrict(done);
  }
  utils.grouped(user.groups, 'admin', function (err, yes) {
    if (err) {
      return done(err);
    }
    if (yes) {
      return done();
    }
    restrict(done);
  });
};
