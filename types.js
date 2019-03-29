var util = require('util');
var fs = require('fs');
var mongoose = require('mongoose');
var async = require('async');
var _ = require('lodash');

var commons = require('./commons');
var errors = require('errors');

var format = function () {
  return util.format.apply(util.format, Array.prototype.slice.call(arguments));
};

var unprocessableEntity = function () {
  var message = format.apply(format, Array.prototype.slice.call(arguments));
  return errors.unprocessableEntity(message);
};

exports.stream = function (options) {
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

exports.binary = function (options) {
  options = options || {};
  return function (o, done) {
    var value = o.value;
    var stream = o.stream && o.stream[0];
    var path = o.path;
    var required = path.isRequired;
    var field = options.field || o.field;
    if (stream && value) {
      return done(unprocessableEntity('\'%s\' contains multiple values', field));
    }
    if (required && !(stream || value)) {
      return done(unprocessableEntity('\'%s\' needs to be specified', field));
    }
    var validateData = function (done) {
      var validator = exports.string({
        field: field
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
    var validateStream = function (done) {
      var validator = exports.stream({
        field: field
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
      return validateStream(done);
    }
    if (!stream) {
      return validateData(done);
    }
    validateStream(function (err) {
      if (err) {
        return done(err);
      }
      validateData(done);
    });
  };
};

exports.binaries = function (options) {
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
      var validator = exports.array({
        max: max,
        min: min,
        validator: exports.string({
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
      var validator = exports.array({
        max: max,
        min: min,
        validator: exports.stream({
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
          return done(unprocessableEntity('\'%s\' needs to contain more values', field));
        }
        done();
      });
    });
  };
};

exports.array = function (options) {
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
      return done(unprocessableEntity('\'%s\' needs to contain more values', field));
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

exports.groups = function (options) {
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
      return done(unprocessableEntity('\'%s\' needs to contain more values', field));
    }
    async.each(groups, function (v, validated) {
      var validator = exports.ref();
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
      commons.permitOnly({user: o.user}, query, {$in: ['*', 'read']}, function (err) {
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

exports.ref = function (options) {
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

exports.boolean = function (options) {
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

exports.url = function (options) {
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

exports.cors = function (options) {
  options = options || {
    url: exports.url(options)
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

var binaryTypes = [
  'image'
];

exports.binaryType = function (options) {
  options = options || {};
  return function (o, done) {
    var media = o.value;
    var field = options.field || o.field;
    if (!media) {
      return done(unprocessableEntity('\'%s\' needs to be specified', field));
    }
    if (binaryTypes.indexOf(media) === -1) {
      return done(unprocessableEntity('\'%s\' contains an invalid value', field));
    }
    done();
  };
};

exports.name = function (options) {
  options = options || {};
  return function (o, done) {
    done()
  };
};

exports.title = function (options) {
  options = options || {};
  return function (o, done) {
    done();
  };
};

exports.color = function (options) {
  options = options || {};
  return function (o, done) {
    done();
  };
};

exports.currency = function (options) {
  options = options || {};
  return function (o, done) {
    done();
  };
};

exports.contacts = function (options) {
  options = options || {};
  return function (o, done) {
    var contacts = o.value;
    var field = options.field || o.field;
    if (!contacts) {
      return done(unprocessableEntity('\'%s\' needs to be specified', field));
    }
    var diff = _.difference(Object.keys(contacts), [
      'email',
      'phones',
      'messenger',
      'skype',
      'viber',
      'whatsapp'
    ]);
    if (diff.length) {
      return done(unprocessableEntity('\'%s\' contains an invalid value', field));
    }
    var validate = function (field, validator, done) {
      var val = contacts[field];
      if (!val) {
        return done();
      }
      validator({
        field: field,
        value: val
      }, done);
    };
    var validatePhones = function (phones, done) {
      if (!phones) {
        return done();
      }
      if (!Array.isArray(phones)) {
        return done(unprocessableEntity('\'%s.phones\' contains an invalid value', field));
      }
      async.each(phones, function (phone, eachDone) {
        if (!phone) {
          return eachDone(unprocessableEntity('\'%s.phones\' contains an invalid value', field));
        }
        exports.phone()({
          field: 'phones',
          value: phone
        }, eachDone);
      }, done);
    };
    var validatePhone = function (phone, done) {
      if (!phone) {
        return done();
      }
      validatePhones([phone], done);
    };
    validate('email', exports.email(), function (err) {
      if (err) {
        return done(unprocessableEntity('\'%s.email\' contains an invalid value', field));
      }
      validatePhones(contacts.phones,function (err) {
        if (err) {
          return done(unprocessableEntity('\'%s.phones\' contains an invalid value', field));
        }
        validate('messenger', exports.string({length: 50}), function (err) {
          if (err) {
            return done(unprocessableEntity('\'%s.messenger\' contains an invalid value', field));
          }
          validate('skype', exports.string({length: 50}), function (err) {
            if (err) {
              return done(unprocessableEntity('\'%s.skype\' contains an invalid value', field));
            }
            validatePhone(contacts.viber, function (err) {
              if (err) {
                return done(unprocessableEntity('\'%s.viber\' contains an invalid value', field));
              }
              validatePhone(contacts.whatsapp, function (err) {
                if (err) {
                  return done(unprocessableEntity('\'%s.whatsapp\' contains an invalid value', field));
                }
                done();
              });
            });
          });
        });
      });
    });
  };
};

exports.date = function (options) {
  options = options || {};
  return function (o, done) {
    var date = o.value;
    var field = options.field || o.field;
    if (!date) {
      return done(unprocessableEntity('\'%s\' needs to be specified', field));
    }
    if (date instanceof Date) {
      return done();
    }
    var at;
    var type = typeof date;
    if (type === 'number' || date instanceof Number) {
      at = new Date(date);
    } else if (type === 'string' || date instanceof String) {
      at = Date.parse(date);
    }
    if (!at) {
      return done(unprocessableEntity('\'%s\' needs to be a valid date', field));
    }
    done();
  };
};

exports.email = function (options) {
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

exports.phone = function (options) {
  options = options || {};
  return function (o, done) {
    var phone = o.value;
    var field = options.field || o.field;
    if (!phone) {
      return done(unprocessableEntity('\'%s\' needs to be specified', field));
    }
    if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
      return done(unprocessableEntity('\'%s\' needs to be a valid phone number', field));
    }
    done();
  };
};

exports.password = function (options) {
  options = options || {};

  var block = function (o, done) {
    if (!options.block) {
      return done(null, {});
    }
    options.block(o, done);
  };

  return function (o, done) {
    block(o, function (err, blocked) {
      if (err) {
        return done(err);
      }

      var password = o.value;
      var field = options.field || o.field;
      if (!password) {
        return done(unprocessableEntity('\'%s\' needs to be specified', field));
      }
      if (password.length < 6) {
        return done(unprocessableEntity('\'%s\' should at least be 6 characters', field));
      }
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
    });
  };
};

exports.birthday = function (options) {
  options = options || {};
  return function (o, done) {
    done();
  };
};

exports.addresses = function (options) {
  options = options || {};
  return function (o, done) {
    done();
  };
};

exports.phones = function (options) {
  options = options || {};
  return function (o, done) {
    var phones = o.value;
    async.each(phones, function (phone, validated) {
      exports.phone({
        field: (options.field || o.field) + '[*]'
      })({value: phone}, validated);
    }, done);
  };
};

exports.socials = function (options) {
  options = options || {};
  return function (o, done) {
    done();
  };
};

exports.country = function (options) {
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

exports.permissions = function (options) {
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

exports.visibility = function (options) {
  options = options || {};
  return function (o, done) {
    var user = o.user;
    if (!user) {
      return done(errors.serverError());
    }
    var actions = options.actions;
    var visibility = o.value;
    var id = o.id;
    var field = options.field || o.field;


    var model = o.model;
    var schema = model.schema;
    var paths = schema.paths;
    Object.keys(visibility).every(function (vfield) {
      if (vfield !== '*' && !paths[vfield]) {
        done(unprocessableEntity('\'%s\' contains an invalid value', field));
        return;
      }
      var entry = visibility[vfield];
      if (typeof entry !== 'object') {
        done(unprocessableEntity('\'%s.%s\' contains an invalid value', field, vfield));
        return;
      }
      Object.keys(entry).every(function (entryKey) {
        if (entryKey !== 'user' && entryKey !== 'group') {
          done(unprocessableEntity('\'%s.%s\' contains an invalid value', field, vfield));
          return;
        }
        var ids = entry[entryKey];
        if (Array.isArray(ids)) {
          done(unprocessableEntity('\'%s.%s.%s\' contains an invalid value', field, vfield, entryKey));
          return;
        }
        ids.every(function (id, i) {
          if (!mongoose.Types.ObjectId.isValid(id)) {
            return done(unprocessableEntity('\'%s.%s.%s[%s]\' contains an invalid value', field, vfield, entryKey, i));
          }
        });
      });
    });
    done();
  };
};

exports.tags = function (options) {
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

exports.string = function (options) {
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

exports.number = function (options) {
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
