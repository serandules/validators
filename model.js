var log = require('logger')('validators:model');
var util = require('util');
var async = require('async');
var _ = require('lodash');

var commons = require('./commons');
var utils = require('utils');
var errors = require('errors');
var model = require('model');

var format = function () {
  return util.format.apply(util.format, Array.prototype.slice.call(arguments));
};

var encrypt = function (options, value, done) {
  if (!options.encrypted) {
    return done(null, value);
  }
  if (!value) {
    return done(null, value);
  }
  utils.encrypt(value, done);
};

var unprocessableEntity = function () {
  var message = format.apply(format, Array.prototype.slice.call(arguments));
  return errors.unprocessableEntity(message);
};

var validateDirection = function (ctx, done) {
  var search = ctx.search;
  if (!search.direction) {
    return done();
  }
  if (!search.cursor) {
    return done(errors.badRequest('\'data.direction\' specified without a cursor'));
  }
  if (search.direction !== 1 && search.direction !== -1) {
    return done(errors.badRequest('\'data.direction\' contains an invalid value'));
  }
  done();
};

var validateQuery = function (ctx, done) {
  var search = ctx.search;
  var query = search.query;
  if (!query) {
    search.query = {};
    return commons.permitOnly(ctx, search.query, 'read', done);
  }
  if (typeof query !== 'object') {
    return done(errors.badRequest('\'data.query\' contains an invalid value'));
  }
  var o;
  var path;
  var filter;
  var schema = ctx.model.schema;
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
      return done(errors.badRequest('\'data.query\' contains an invalid value'));
    }
    o = path.options || {};
    if (!o.searchable && !o.sortable) {
      return done(errors.badRequest('\'data.query\' contains an invalid value'));
    }
  }
  if (query.id) {
    query._id = query.id;
    delete query.id;
  }
  commons.permitOnly(ctx, query, 'read', done);
};

var validateSort = function (ctx, done) {
  var o;
  var path;
  var value;
  var sorter;
  var schema = ctx.model.schema;
  var paths = schema.paths;
  var search = ctx.search;
  var sort = search.sort || {createdAt: -1, id: -1};
  if (typeof sort !== 'object') {
    return done(errors.badRequest('\'data.sort\' contains an invalid value'));
  }
  var clone = {};
  for (sorter in sort) {
    if (!sort.hasOwnProperty(sorter)) {
      continue;
    }
    value = sort[sorter];
    if (value !== -1 && value !== 1) {
      return done(errors.badRequest('\'data.sort\' contains an invalid value'));
    }
    if (sorter === 'id') {
      sorter = '_id';
      clone[sorter] = value;
      continue;
    }
    path = paths[sorter];
    if (!path) {
      return done(errors.badRequest('\'data.sort\' contains an invalid value'));
    }
    o = path.options || {};
    if (!o.sortable) {
      return done(errors.badRequest('\'data.sort\' contains an invalid value'));
    }
    clone[sorter] = value;
  }
  if (!clone.createdAt) {
    clone.createdAt = -1
  }
  if (!clone._id) {
    clone['_id'] = clone.createdAt;
  }
  search.sort = clone;
  validateCompounds(ctx, done);
};

// TODO: validate passing non-id values in place of id values
var validateCursor = function (ctx, done) {
  var search = ctx.search;
  var cursor = search.cursor;
  if (!cursor) {
    return done();
  }
  var path;
  var value;
  var schema = ctx.model.schema;
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
      return done(err);
    }
    model.cast(ctx.model, cursor);
    done();
  });
};

var validateFields = function (ctx, done) {
  var search = ctx.search;
  var fields = search.fields;
  if (!fields) {
    return done();
  }
  var field;
  var path;
  var value;
  var schema = ctx.model.schema;
  var paths = schema.paths;
  for (field in fields) {
    if (!fields.hasOwnProperty(field)) {
      continue;
    }
    path = paths[field];
    if (!path) {
      return done(errors.badRequest('\'fields\' contains an invalid value'));
    }
    value = fields[field];
    if (value !== 1) {
      return done(errors.badRequest('\'fields\' contains an invalid value'));
    }
  }
  done();
};

var validateCompounds = function (ctx, done) {
  var i;
  var index;
  var compound;
  var search = ctx.search;
  var sort = search.sort;
  var schema = ctx.model.schema;
  var compounds = schema.compounds || [];
  var length = compounds.length;
  var first = model.first(sort);
  if (sort[first] === -1) {
    sort = model.invert(sort);
  }
  for (i = 0; i < length; i++) {
    compound = compounds[i];
    if (_.isEqual(sort, compound)) {
      index = compound;
      break;
    }
  }
  if (!index) {
    return done(errors.badRequest('\'data.sort\' contains an invalid value'));
  }
  done();
};

exports.create = function (ctx, done) {
  var did = function () {
    ctx.validated = true;
    done.apply(null, Array.prototype.slice.call(arguments));
  };
  var data = ctx.data;
  var schema = ctx.model.schema;
  var paths = schema.paths;
  var streams = ctx.streams || {};
  // TODO: remove fields which is not in schema
  async.eachLimit(Object.keys(paths), 1, function (field, validated) {
    var value;
    var path = paths[field];
    var options = path.options || {};
    var o = {
      model: model,
      user: ctx.user,
      path: path,
      field: field,
      value: data[field],
      valued: ctx.found && ctx.found[field],
      id: options.id,
      stream: streams[field],
      options: options,
      data: data,
      found: ctx.found
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
        encrypt(options, value, function (err, value) {
          if (err) {
            return validated(err);
          }
          data[field] = value;
          validated();
        });
      });
      return;
    }
    var hybrid = options.hybrid;
    if (hybrid) {
      value = options.value;
      if (!value) {
        return validated();
      }
      value(o, function (err, sv) {
        if (err) {
          return validated(err);
        }
        var cv = data[field] || [];
        encrypt(options, sv, function (err, sv) {
          if (err) {
            return validated(err);
          }
          hybrid(sv, cv, function (err, values) {
            if (err) {
              return validated(err);
            }
            data[field] = values;
            validated();
          });
        });
      });
      return;
    }
    if ((!o.value && o.value !== 0 && !o.stream) || (Array.isArray(o.value) && !o.value.length)) {
      value = options.value;
      if (value) {
        value(o, function (err, value) {
          if (err) {
            return validated(err);
          }
          encrypt(options, value, function (err, value) {
            if (err) {
              return validated(err);
            }
            data[field] = value;
            validated();
          });
        });
        return;
      }
      if (!path.isRequired) {
        return validated();
      }
      if (o.found && options.encrypted) {
        delete data[field];
        return validated();
      }
      return validated(unprocessableEntity('\'%s\' needs to be specified', field));
    }
    if (options.encrypted && o.valued && o.valued === o.value) {
      delete data[field];
      return validated();
    }
    var validator = options.validator;
    if (!validator) {
      encrypt(options, o.value, function (err, value) {
        if (err) {
          return validated(err);
        }
        data[field] = value;
        validated();
      });
      return;
    }
    validator(o, function (err) {
      if (err) {
        return validated(err);
      }
      encrypt(options, o.value, function (err, value) {
        if (err) {
          return validated(err);
        }
        data[field] = value;
        validated();
      });
    });
  }, function (err) {
    if (err) {
      return did(err);
    }
    async.eachLimit(Object.keys(paths), 1, function (field, validated) {
      var path = paths[field];
      var options = path.options || {};
      var requir = options.require;
      if (!requir) {
        return validated();
      }
      var o = {
        user: ctx.user,
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
        return did(err);
      }
      did();
    });
  });
};

exports.findOne = function (ctx, done) {
  var did = function () {
    ctx.validated = true;
    done.apply(null, Array.prototype.slice.call(arguments));
  };
  var id = ctx.id;
  if (!model.objectId(id)) {
    return did(errors.notFound());
  }
  var query = {
    _id: id
  };
  commons.permitOnly(ctx, query, 'read', function (err) {
    if (err) {
      return did(err);
    }
    ctx.query = query;
    did();
  });
};

exports.update = function (ctx, done) {
  var did = function () {
    ctx.validated = true;
    done.apply(null, Array.prototype.slice.call(arguments));
  };
  var id = ctx.id;
  if (!model.objectId(id)) {
    return did(errors.notFound());
  }
  var user = ctx.user;
  if (!user) {
    return did(errors.unauthorized());
  }
  var query = {
    _id: id
  };
  commons.permitOnly(ctx, query, 'update', function (err) {
    if (err) {
      return did(err);
    }
    ctx.query = query;
    ctx.model.findOne(query, function (err, found) {
      if (err) {
        return did(err);
      }
      if (!found) {
        return did(errors.notFound());
      }
      ctx.found = found;
      exports.create(ctx, did);
    });
  });
};

exports.find = function (ctx, done) {
  var did = function () {
    ctx.validated = true;
    done.apply(null, Array.prototype.slice.call(arguments));
  };
  var search = ctx.search;
  search.count = ctx.count || search.count || 20;
  if (search.count > 100) {
    return did(errors.badRequest('\'data.count\' contains an invalid value'))
  }
  validateQuery(ctx, function (err) {
    if (err) {
      return did(err);
    }
    validateSort(ctx, function (err) {
      if (err) {
        return did(err);
      }
      validateCursor(ctx, function (err) {
        if (err) {
          return did(err);
        }
        validateDirection(ctx, function (err) {
          if (err) {
            return did(err);
          }
          validateFields(ctx, did);
        });
      });
    });
  });
};

exports.remove = function (ctx, done) {
  var did = function () {
    ctx.validated = true;
    done.apply(null, Array.prototype.slice.call(arguments));
  };
  return exports.findOne(ctx, did);
};
