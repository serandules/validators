exports.permissions = function (options) {
  options = options || {};
  return function (o, server, client, done) {
    if (options.server) {
      return done(null, server);
    }
    var index = {};

    var analyze = function (v) {
      v = v || [];
      v.forEach(function (entry) {
        var type = entry.user ? 'user' : 'group';
        var id = entry.user || entry.group;
        var actions = entry.actions || [];
        var key = type + ':' + id;
        var actionz = index[key] || (index[key] = []);
        actions.forEach(function (action) {
          if (actionz.indexOf(action) === -1) {
            actionz.push(action);
          }
        });
      });
    };

    analyze(server);
    analyze(client);

    var perms = [];
    Object.keys(index).forEach(function (key) {
      var parts = key.split(':');
      var type = parts[0];
      var id = parts[1];
      var entry = {
        actions: index[key]
      };
      entry[type] = id;
      perms.push(entry);
    });

    done(null, perms);
  };
};

exports.visibility = function (options) {
  return function (o, server, client, done) {
    if (options.server) {
      return done(null, server);
    }
    var index = {};
    var model = o.model;
    var schema = model.schema;
    var paths = schema.paths;

    var analyze = function (o) {
      o = o || {};
      Object.keys(o).forEach(function (field) {
        if (field !== '*' && !paths[field]) {
          return;
        }
        var values = o[field] || {};
        var entry = index[field] || (index[field] = {
          groups: [],
          users: []
        });
        var groups = values.groups || [];
        groups.forEach(function (group) {
          entry.groups[group] = true;
        });

        var users = values.users || [];
        users.forEach(function (user) {
          entry.users[user] = true;
        })
      });
    };

    analyze(server);
    analyze(client);
    var visibility = {};
    Object.keys(index).forEach(function (field) {
      var values = visibility[field] || (visibility[field] = {
        groups: [],
        users: []
      });
      var entry = index[field];
      Object.keys(entry.groups).forEach(function (group) {
        values.groups.push(group);
      });
      Object.keys(entry.users).forEach(function (users) {
        values.users.push(users);
      });
    });
    done(null, visibility);
  };
};
