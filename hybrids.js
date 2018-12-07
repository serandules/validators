
exports.permissions = function (options) {
  return function (server, client, done) {
    var index = {};

    var analyze = function (o) {
      o = o || [];
      o.forEach(function (entry) {
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
      var o = {
        actions: index[key]
      };
      o[type] = id;
      perms.push(o);
    });

    done(null, perms);
  };
};
