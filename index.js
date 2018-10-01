var log = require('logger')('validators:index');
var util = require('util');
var fs = require('fs');
var async = require('async');
var crypto = require('crypto');
var stream = require('stream');
var _ = require('lodash');
var tmp = require('tmp');
var mongoose = require('mongoose');
var formidable = require('formidable');

var serand = require('serand');
var utils = require('utils');
var errors = require('errors');
var mongutils = require('mongutils');

var locations = require('./locations')

var adminEmail = 'admin@serandives.com';

var users = {};

var groups = {};

var tiers = {};

var findUser = function (email, done) {
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

var findGroup = function (user, name, done) {
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

var group = function (name, done) {
    findUser(adminEmail, function (err, user) {
        if (err) {
            return done(err);
        }
        findGroup(user.id, name, done);
    });
};

var grouped = function (user, name, done) {
  group(name, function (err, o) {
    if (err) {
      return done(err);
    }
    var entry = _.find(user.groups, function (group) {
      return String(group) === o.id;
    });
    done(null, !!entry);
  });
};

var findTier = function (user, name, done) {
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

var tier = function (name, done) {
    findUser(adminEmail, function (err, user) {
        if (err) {
            return done(err);
        }
        findTier(user.id, name, done);
    });
};

var format = function () {
    return util.format.apply(util.format, Array.prototype.slice.call(arguments));
};

var unprocessableEntity = function () {
    var message = format.apply(format, Array.prototype.slice.call(arguments));
    return errors.unprocessableEntity(message);
};

exports.types = {};

exports.values = {};

exports.requires = {};

exports.contents = {};

exports.resources = {};

exports.types.string = function (options) {
    options = options || {};
    return function (o, done) {
        var string = o.value;
        var field = options.field || o.field;
        if (!string) {
            return done(unprocessableEntity('\'%s\' needs to be specified', field));
        }
        if (typeof string !== 'string' && !(string instanceof String)) {
            return done(unprocessableEntity('\'%s\' needs to be a string', field));
        }
        if (options.enum) {
            if (options.enum.indexOf(string) !== -1) {
                return done()
            }
            return done(unprocessableEntity('\'%s\' contains an invalid value', field));
        }
        if (string.length > options.length) {
            return done(unprocessableEntity('\'%s\' exceeds the allowed length', field));
        }
        return done();
    };
};

exports.types.number = function (options) {
    options = options || {};
    return function (o, done) {
        var number = o.value;
        var field = options.field || o.field;
        if (!number && number !== 0) {
            return done(unprocessableEntity('\'%s\' needs to be specified', field));
        }
        if (typeof number !== 'number' && !(number instanceof Number)) {
            return done(unprocessableEntity('\'%s\' needs to be a number', field));
        }
        if (options.enum) {
            if (options.enum.indexOf(number) !== -1) {
                return done()
            }
            return done(unprocessableEntity('\'%s\' contains an invalid value', field));
        }
        if (number.length > options.length) {
            return done(unprocessableEntity('\'%s\' exceeds the allowed length', field));
        }
        if (options.max && number > options.max) {
            return done(unprocessableEntity('\'%s\' needs to be below or equal %s', field, options.max))
        }
        if (options.min && number < options.min) {
            return done(unprocessableEntity('\'%s\' needs to be above or equal %s', field, options.min))
        }
        return done();
    };
};

exports.types.permissions = function (options) {
    options = options || {};
    return function (o, done) {
        var user = o.user;
        if (!user) {
            return done(errors.serverError());
        }
        var actions = options.actions;
        var permissions = o.value;
        var id = o.id;
        var field = options.field || o.field;
        var i;
        var entry;
        var length = permissions.length;
        var found = false;
        for (i = 0; i < length; i++) {
            entry = permissions[i];
            if (!(entry.user || entry.group)) {
                return done(unprocessableEntity('either \'%s[*].user\' or \'%s[*].group\' needs to be specified', field, field));
            }
            if (!Array.isArray(entry.actions)) {
                return done(unprocessableEntity('\'%s\' needs to be an array', field + '.actions'));
            }
            var valid = entry.actions.every(function (perm) {
                return actions.indexOf(perm) !== -1;
            });
            if (!valid) {
                return done(unprocessableEntity('\'%s\' contains an invalid value', field + '.actions'));
            }
            if (!id) {
                continue;
            }
            if (entry.user !== user.id) {
                continue;
            }
            if (!permissions.indexOf('read') || !permissions.indexOf('update')) {
                return done(unprocessableEntity('\'%s\' needs to contain permissions for the current user', field));
            }
            found = true;
        }
        if (id && !found) {
            return done(unprocessableEntity('\'%s\' needs to contain permissions for the current user', field));
        }
        done();
    };
};

exports.values.random = function (options) {
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

exports.values.permissions = function (options) {
    options = options || {};
    return function (o, done) {
        group('admin', function (err, admin) {
          if (err) {
            return done(err);
          }
          var value = [{
            group: admin.id,
            actions: options.actions
          }];
          var user = o.user;
          if (user) {
            value.push({
              user: user.id,
              actions: options.actions
            })
          }
          done(null, value);
        });
    };
};

exports.types.tags = function (options) {
    options = options || {};
    return function (o, done) {
        var i;
        var entry;
        var name;
        var value;
        var field;
        var key;
        var parts;
        var tags = o.value;
        var length = tags.length;
        for (i = 0; i < length; i++) {
            entry = tags[i];
            name = entry.name;
            if (!name) {
                return done(unprocessableEntity('\'%s\' needs to be specified', o.field + '.name'));
            }
            if (typeof name !== 'string' && !(name instanceof String)) {
                return done(unprocessableEntity('\'%s\' needs to be a string', o.field + '.name'));
            }
            parts = name.split(':');
            field = parts[0];
            key = parts[1];
            if (!field || !key) {
                return done(unprocessableEntity('\'%s\' contains an invalid value', o.field + '.name'));
            }
            if (!options[field] || options[field].indexOf(key) === -1) {
                return done(unprocessableEntity('\'%s\' contains an invalid value', o.field + '.name'));
            }
            value = entry.value;
            if (!value) {
                return done(unprocessableEntity('\'%s\' needs to be specified', o.field + '.value'));
            }
            if (typeof value !== 'string' && !(value instanceof String)) {
                return done(unprocessableEntity('\'%s\' needs to be a string', o.field + '.value'));
            }
        }
        done();
    };
};

exports.values.tier = function (options) {
  return function (o, done) {
    var user = o.user;
    grouped(user, 'admin', function (err, yes) {
      if (err) {
        return done(err);
      }
      var name = yes ? 'unlimited' : 'basic';
      tier(name, function (err, tier) {
        if (err) {
          return done(err);
        }
        done(null, tier);
      });
    });
  };
};

exports.values.tags = function (options) {
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

exports.values.user = function (options) {
    options = options || {};
    return function (o, done) {
        var user = o.user;
        if (!user) {
            return done(errors.serverError());
        }
        done(null, o.user._id);
    };
};

exports.values.createdAt = function (options) {
    options = options || {};
    return function (o, done) {
        done(null, new Date());
    };
};

exports.values.groups = function (options) {
  options = options || {};
  return function (o, done) {
    group('public', function (err, pub) {
      if (err) {
        return done(err);
      }
      done(null, [pub.id]);
    });
  };
};

exports.types.stream = function (options) {
    options = options || {};
    return function (o, done) {
        var value = o.value;
        var field = options.field || o.field;
        if (!value) {
            return done(unprocessableEntity('\'%s\' needs to be specified', field));
        }
        fs.exists(value.path, function (exists) {
            if (!exists) {
                return done(unprocessableEntity('\'%s\' needs to be a stream', field));
            }
            done();
        });
    };
};

exports.types.binaries = function (options) {
    options = options || {};
    return function (o, done) {
        var value = o.value;
        var stream = o.stream;
        var path = o.path;
        var required = path.isRequired;
        var field = options.field || o.field;
        var max = options.max || 1;
        var min = options.min || (required ? 1 : 0);
        var validateData = function (min, done) {
            var validator = exports.types.array({
                max: max,
                min: min,
                validator: exports.types.string({
                    field: field
                })
            });
            var value = o.value;
            validator({
                user: o.user,
                path: path,
                field: field,
                value: value,
                options: {}
            }, done);
        };
        var validateStream = function (min, done) {
            var validator = exports.types.array({
                max: max,
                min: min,
                validator: exports.types.stream({
                    field: field
                })
            });
            validator({
                user: o.user,
                path: path,
                field: field,
                value: stream,
                options: {}
            }, done);
        };
        if (!value) {
            return validateStream(min, done);
        }
        if (!stream) {
            return validateData(min, done);
        }
        validateStream(0, function (err) {
            if (err) {
                return done(err);
            }
            validateData(0, function (err) {
                if (err) {
                    return done(err);
                }
                var length = value.length + stream.length;
                if (max < length) {
                    return done(unprocessableEntity('\'%s\' exceeds the allowed length', field));
                }
                if (min > length) {
                    return done(unprocessableEntity('\'%s\' needs to contain more items', field));
                }
                done();
            });
        });
    };
};

exports.types.array = function (options) {
    options = options || {};
    return function (o, done) {
        var array = o.value;
        var field = options.field || o.field;
        var max = o.options.max || options.max || 10;
        var min = o.options.min || options.min || 0;
        if (!array) {
            return done(unprocessableEntity('\'%s\' needs to be specified', field));
        }
        if (!Array.isArray(array)) {
            return done(unprocessableEntity('\'%s\' needs to be an array', field));
        }
        if (max < array.length) {
            return done(unprocessableEntity('\'%s\' exceeds the allowed length', field));
        }
        if (min > array.length) {
            return done(unprocessableEntity('\'%s\' needs to contain more items', field));
        }
        async.each(array, function (v, validated) {
            options.validator({
                user: o.user,
                path: o.path,
                field: field + '[*]',
                value: v,
                options: o.options
            }, validated)
        }, done);
    };
};

exports.types.groups = function (options) {
    options = options || {};
    return function (o, done) {
        var groups = o.value;
        var field = options.field || o.field;
        var max = o.options.max || options.max || 10;
        var min = o.options.min || options.min || 0;
        if (!groups) {
            return done(unprocessableEntity('\'%s\' needs to be specified', field));
        }
        if (!Array.isArray(groups)) {
            return done(unprocessableEntity('\'%s\' needs to be an array', field));
        }
        if (max < groups.length) {
            return done(unprocessableEntity('\'%s\' exceeds the allowed length', field));
        }
        if (min > groups.length) {
            return done(unprocessableEntity('\'%s\' needs to contain more items', field));
        }
        async.each(groups, function (v, validated) {
            var validator = exports.types.ref();
            validator({
                user: o.user,
                path: o.path,
                field: field + '[*]',
                value: v,
                options: o.options
            }, validated);
        }, function (err) {
            if (err) {
                return done(err);
            }
            var Groups = mongoose.model('groups');
            var query = {_id: {$in: groups}};
            permitOnly(query, o.user, 'read', function (err) {
                if (err) {
                    return done(err);
                }
                Groups.find(query).select('_id').exec(function (err, groupz) {
                    if (err) {
                        return done(err);
                    }
                    if (!groupz || (groups.length !== groupz.length)) {
                        return done(unprocessableEntity('\'%s\' contains invalid values', field));
                    }
                    done();
                });
            });
        });
    };
};

exports.types.ref = function (options) {
    options = options || {};
    return function (o, done) {
        var ref = o.value;
        var field = options.field || o.field;
        if (!mongoose.Types.ObjectId.isValid(ref)) {
            return done(unprocessableEntity('\'%s\' needs to be a valid reference', field));
        }
        done();
    };
};

exports.types.boolean = function (options) {
    options = options || {};
    return function (o, done) {
        var boolean = o.value;
        var field = options.field || o.field;
        if (!boolean) {
            return done(unprocessableEntity('\'%s\' needs to be specified', field));
        }
        if (typeof boolean !== 'boolean' && !(boolean instanceof Boolean)) {
            return done(unprocessableEntity('\'%s\' needs to be a boolean', field));
        }
        done();
    };
};

exports.types.url = function (options) {
    options = options || {};
    return function (o, done) {
        var url = o.value;
        var field = options.field || o.field;
        if (!url || url.length > 2000 || (url.indexOf('http://') === -1 && url.indexOf('https://') === -1)) {
            return done(unprocessableEntity('\'%s\' contains an invalid value', field));
        }
        done();
    };
};

exports.types.cors = function (options) {
    options = options || {
      url: exports.types.url(options)
    };
    return function (o, done) {
        var urls = o.value;
        var field = options.field || o.field;
        async.each(urls, function (url, eachDone) {
          if (url === '*') {
            return eachDone();
          }
          options.url({
            value: url,
            field: field
          }, eachDone);
        }, done);
    };
};

exports.types.name = function (options) {
    options = options || {};
    return function (o, done) {
        done()
    };
};

exports.types.title = function (options) {
    options = options || {};
    return function (o, done) {
        done();
    };
};

exports.types.color = function (options) {
    options = options || {};
    return function (o, done) {
        done();
    };
};

exports.types.currency = function (options) {
    options = options || {};
    return function (o, done) {
        done();
    };
};

exports.types.contacts = function (options) {
    options = options || {};
    return function (o, done) {
        done();
    };
};

exports.types.date = function (options) {
    options = options || {};
    return function (o, done) {
        done();
    };
};

exports.types.email = function (options) {
    options = options || {};
    return function (o, done) {
        var email = o.value;
        var field = options.field || o.field;
        if (!email) {
            return done(unprocessableEntity('\'%s\' needs to be specified', field));
        }
        var at = email.indexOf('@');
        var dot = email.lastIndexOf('.');
        if (at === -1 || dot === -1 || dot < at) {
            return done(unprocessableEntity('\'%s\' needs to be a valid email address', field));
        }
        done();
    };
};

exports.types.password = function (options) {
    options = options || {};
    return function (o, done) {
        var password = o.value;
        var field = options.field || o.field;
        if (!password) {
            return done(unprocessableEntity('\'%s\' needs to be specified', field));
        }
        if (password.length < 6) {
            return done(unprocessableEntity('\'%s\' should at least be 6 characters', field));
        }
        var blocked = options.blocked || {};
        var pass = password.toLowerCase();
        var name;
        for (name in blocked) {
            if (!blocked.hasOwnProperty(name)) {
                continue;
            }
            if (pass !== blocked[name].toLowerCase()) {
                continue;
            }
            return done(unprocessableEntity('\'%s\' should not be equivalent to the \'%s\'', field, name));
        }
        if (!/[0-9]/.test(password)) {
            return done(unprocessableEntity('\'%s\' should contain at least one number', field));
        }
        if (!/[a-z]/.test(password)) {
            return done(unprocessableEntity('\'%s\' should contain at one lower case letter', field));
        }
        if (!/[A-Z]/.test(password)) {
            return done(unprocessableEntity('\'%s\' should contain at one upper case letter', field));
        }
        done();
    };
};

exports.types.birthday = function (options) {
    options = options || {};
    return function (o, done) {
        done();
    };
};

exports.types.addresses = function (options) {
    options = options || {};
    return function (o, done) {
        done();
    };
};

exports.types.phones = function (options) {
    options = options || {};
    return function (o, done) {
        done();
    };
};

exports.types.socials = function (options) {
    options = options || {};
    return function (o, done) {
        done();
    };
};

exports.types.country = function (options) {
    options = options || {};
    return function (o, done) {
        var country = o.value;
        var field = options.field || o.field;
        if (!country) {
            return done(unprocessableEntity('\'%s\' needs to be specified', field));
        }
        var allow = options.allow;
        if (allow.indexOf(country) === -1) {
            return done(unprocessableEntity('\'%s\' contains an invalid value', field))
        }
        done();
    };
};

exports.requires.district = function (options) {
    options = options || {};
    return function (o, done) {
        return locations.district(o, done);
    };
};

exports.requires.province = function (options) {
    options = options || {};
    return function (o, done) {
        return locations.province(o, done);
    };
};

exports.requires.state = function (options) {
    options = options || {};
    return function (o, done) {
        return locations.state(o, done);
    };
};

exports.contents.json = function (req, res, done) {
    if (req.is('application/json')) {
        return done();
    }
    done(errors.unsupportedMedia());
};

exports.contents.urlencoded = function (req, res, done) {
    if (req.is('application/x-www-form-urlencoded')) {
        return done();
    }
    done(errors.unsupportedMedia());
};

exports.contents.multipart = function (req, res, done) {
    req.streams = {};
    if (!req.is('multipart/form-data')) {
        return done(errors.unsupportedMedia());
    }
    var form = new formidable.IncomingForm();
    form.on('progress', function (rec, exp) {

    });
    form.on('field', function (name, value) {
        if (name !== 'data') {
            return;
        }
        req.body = JSON.parse(value);
    });
    form.on('file', function (name, file) {
        var streams = req.streams[name] || (req.streams[name] = []);
        streams.push(file);
    });
    form.on('error', function (err) {
        log.error('forms:errored', 'data:%j', data, err);
        done(errors.badRequest());
    });
    form.on('aborted', function () {
        done();
    });
    form.on('end', function () {
        done();
    });
    form.parse(req);
};

exports.create = function (options, req, res, next) {
    var create = function (next) {
        var model = options.model;
        var data = req.body;
        var schema = model.schema;
        var paths = schema.paths;
        var streams = req.streams || {};
        // TODO: remove fields which is not in schema
        async.eachLimit(Object.keys(paths), 1, function (field, validated) {
            var value;
            var path = paths[field];
            var options = path.options || {};
            var o = {
                model: model,
                user: req.user,
                path: path,
                field: field,
                value: data[field],
                id: options.id,
                stream: streams[field],
                options: options,
                data: data
            };
            if (options.server) {
                value = options.value;
                if (!value) {
                    return validated();
                }
                value(o, function (err, value) {
                    if (err) {
                        return validated(err);
                    }
                    data[field] = value;
                    validated();
                });
                return;
            }
            if (options.hybrid) {
                value = options.value;
                if (!value) {
                  return validated();
                }
                value(o, function (err, value) {
                  if (err) {
                    return validated(err);
                  }
                  var uv = data[field] || []
                  data[field] = uv.concat(value);
                  validated();
                });
                return;
            }
            if ((!o.value && o.value !== 0 && !o.stream) || (Array.isArray(o.value) && !o.value.length)) {
                value = options.value;
                if (!value) {
                    return path.isRequired ? validated(unprocessableEntity('\'%s\' needs to be specified', field)) : validated();
                }
                value(o, function (err, value) {
                    if (err) {
                        return validated(err);
                    }
                    data[field] = value;
                    validated();
                });
                return;
            }
            var validator = options.validator;
            if (!validator) {
                return validated();
            }
            validator(o, validated);
        }, function (err) {
            if (err) {
                return res.pond(err);
            }
            async.eachLimit(Object.keys(paths), 1, function (field, validated) {
                var path = paths[field];
                var options = path.options || {};
                var requir = options.require;
                if (!requir) {
                    return validated();
                }
                var o = {
                    user: req.user,
                    path: path,
                    field: field,
                    value: data[field],
                    id: options.id,
                    stream: streams[field],
                    options: options,
                    data: data
                };
                if (o.value || o.value === 0 || o.stream || (Array.isArray(o.value) && o.value.length)) {
                    return validated();
                }
                requir(o, validated);
            }, function (err) {
                if (err) {
                    return res.pond(err);
                }
                next();
            });
        });
    };
    var content = options.content;
    if (!content) {
        return create(next);
    }
    var validate = exports.contents[content];
    validate(req, res, function (err) {
        if (err) {
            return res.pond(err);
        }
        create(next);
    });
};

exports.query = function (req, res, next) {
    var data = req.query.data;
    if (!data) {
        req.query.data = {};
        return next();
    }
    try {
        data = JSON.parse(data);
    } catch (e) {
        return res.pond(errors.badRequest('\'data\' contains an invalid value'));
    }
    if (typeof data !== 'object') {
        return res.pond(errors.badRequest('\'data\' contains an invalid value'));
    }
    req.query.data = data;
    next();
};

exports.findOne = function (options, req, res, next) {
    var id = options.id;
    if (!mongutils.objectId(id)) {
        return res.pond(errors.notFound());
    }
    var query = {
        _id: id
    };
    permitOnly(query, req.user, 'read', function (err) {
        if (err) {
            return next(err);
        }
        req.query = query;
        next();
    });
};

exports.update = function (options, req, res, next) {
    var id = options.id;
    if (!mongutils.objectId(id)) {
        return res.pond(errors.notFound());
    }
    var query = {
        _id: id
    };
    var model = options.model;
    model.findOne(query, function (err, found) {
        if (err) {
            return next(err);
        }
        if (!found) {
            return res.pond(errors.notFound());
        }
        req.found = found;
        permitOnly(query, req.user, 'update', function (err) {
            if (err) {
                return next(err);
            }
            req.query = query;
            exports.create(options, req, res, function (err) {
                if (err) {
                    return next(err);
                }
                next();
            });
        });
    });
};

exports.find = function (options, req, res, next) {
    var data = req.query.data;
    data.count = data.count || 20;
    if (data.count > 100) {
        return res.pond(errors.badRequest('\'data.count\' contains an invalid value'))
    }
    validateQuery(options, req, res, function (err) {
        if (err) {
            return next(err);
        }
        validateSort(options, req, res, function (err) {
            if (err) {
                return next(err);
            }
            validateCursor(options, req, res, function (err) {
                if (err) {
                    return next(err);
                }
                validateDirection(options, req, res, function (err) {
                    if (err) {
                        return next(err);
                    }
                    validateFields(options, req, res, next);
                });
            });
        });
    });
};

var validateDirection = function (options, req, res, next) {
    var data = req.query.data;
    if (!data.direction) {
        return next();
    }
    if (!data.cursor) {
        return res.pond(errors.badRequest('\'data.direction\' specified without a cursor'));
    }
    if (data.direction !== 1 && data.direction !== -1) {
        return res.pond(errors.badRequest('\'data.direction\' contains an invalid value'));
    }
    next();
};

var permitOnly = function (query, user, actions, next) {
    var restrict = function (next) {
        group('public', function (err, pub) {
            if (err) {
                return next(err);
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
                    if (group == pub.id) {
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
            next();
        });
    };
    if (!user) {
        return restrict(next);
    }
    grouped(user.groups, 'admin', function (err, yes) {
        if (err) {
            return next(err);
        }
        if (yes) {
            return next();
        }
        restrict(next);
    });
};

var validateQuery = function (options, req, res, next) {
    var data = req.query.data;
    var query = data.query;
    if (!query) {
        data.query = {};
        return permitOnly(data.query, req.user, 'read', next);
    }
    if (typeof query !== 'object') {
        return res.pond(errors.badRequest('\'data.query\' contains an invalid value'));
    }
    var o;
    var path;
    var filter;
    var model = options.model;
    var schema = model.schema;
    var paths = schema.paths;
    for (filter in query) {
        if (!query.hasOwnProperty(filter)) {
            continue;
        }
        if (filter === 'id') {
            continue;
        }
        path = paths[filter];
        if (!path) {
            return res.pond(errors.badRequest('\'data.query\' contains an invalid value'));
        }
        o = path.options || {};
        if (!o.searchable && !o.sortable) {
            return res.pond(errors.badRequest('\'data.query\' contains an invalid value'));
        }
    }
    if (query.id) {
        query._id = query.id;
        delete query.id;
    }
    permitOnly(query, req.user, 'read', next);
};

var validateSort = function (options, req, res, next) {
    var o;
    var path;
    var value;
    var sorter;
    var model = options.model;
    var schema = model.schema;
    var paths = schema.paths;
    var data = req.query.data;
    var sort = data.sort || {createdAt: -1, id: -1};
    if (typeof sort !== 'object') {
        return res.pond(errors.badRequest('\'data.sort\' contains an invalid value'));
    }
    var clone = {};
    for (sorter in sort) {
        if (!sort.hasOwnProperty(sorter)) {
            continue;
        }
        value = sort[sorter];
        if (value !== -1 && value !== 1) {
            return res.pond(errors.badRequest('\'data.sort\' contains an invalid value'));
        }
        if (sorter === 'id') {
            sorter = '_id';
            clone[sorter] = value;
            continue;
        }
        path = paths[sorter];
        if (!path) {
            return res.pond(errors.badRequest('\'data.sort\' contains an invalid value'));
        }
        o = path.options || {};
        if (!o.sortable) {
            return res.pond(errors.badRequest('\'data.sort\' contains an invalid value'));
        }
        clone[sorter] = value;
    }
    if (!clone.createdAt) {
        clone.createdAt = -1
    }
    if (!clone._id) {
        clone['_id'] = clone.createdAt;
    }
    data.sort = clone;
    validateCompounds(options, data, res, next);
};

// TODO: validate passing non-id values in place of id values
var validateCursor = function (options, req, res, next) {
    var data = req.query.data;
    var cursor = data.cursor;
    if (!cursor) {
        return next();
    }
    var path;
    var value;
    var model = options.model;
    var schema = model.schema;
    var paths = schema.paths;
    async.eachLimit(Object.keys(cursor), 1, function (field, validated) {
        if (field === 'id') {
            field = '_id';
            cursor._id = cursor.id;
            delete cursor.id;
        }
        path = paths[field];
        if (!path) {
            return validated(errors.badRequest('\'data.cursor\' contains an invalid value'));
        }
        value = cursor[field];
        if (!value) {
            return validated(errors.badRequest('\'data.cursor.%s\' + contains an invalid value', field));
        }
        var options = path.options || {};
        var o = {
            path: path,
            field: field,
            value: value,
            options: {}
        };
        var validator = options.validator;
        if (!validator) {
            return validated();
        }
        validator(o, function (err) {
            if (err) {
                return validated(errors.badRequest('data.cursor.%s', err.message));
            }
            validated();
        });
    }, function (err) {
        if (err) {
            return res.pond(err);
        }
        mongutils.cast(options.model, cursor);
        next();
    });
};

var validateFields = function (options, req, res, next) {
    var data = req.query.data;
    var fields = data.fields;
    if (!fields) {
        return next();
    }
    var field;
    var path;
    var value;
    var model = options.model;
    var schema = model.schema;
    var paths = schema.paths;
    for (field in fields) {
        if (!fields.hasOwnProperty(field)) {
            continue;
        }
        path = paths[field];
        if (!path) {
            return res.pond(errors.badRequest('\'fields\' contains an invalid value'));
        }
        value = fields[field];
        if (value !== 1) {
            return res.pond(errors.badRequest('\'fields\' contains an invalid value'));
        }
    }
    next();
};

var validateCompounds = function (options, data, res, next) {
    var i;
    var index;
    var compound;
    var sort = data.sort;
    var model = options.model;
    var schema = model.schema;
    var compounds = schema.compounds || [];
    var length = compounds.length;
    var first = mongutils.first(sort);
    if (sort[first] === -1) {
        sort = mongutils.invert(sort);
    }
    for (i = 0; i < length; i++) {
        compound = compounds[i];
        if (_.isEqual(sort, compound)) {
            index = compound;
            break;
        }
    }
    if (!index) {
        return res.pond(errors.badRequest('\'data.sort\' contains an invalid value'));
    }
    next();
};