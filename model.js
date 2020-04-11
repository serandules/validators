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
  ctx.queried = _.cloneDeep(query);
  if (!query) {
    search.query = {};
    return commons.permitOnly(ctx, search.query, {$in: ['*', 'read']}, done);
  }
  if (typeof query !== 'object') {
    return done(errors.badRequest('\'data.query\' contains an invalid value'));
  }
  var o;
  var path;
  var value;
  var schema = ctx.model.schema;
  var paths = schema.paths;
  var user = ctx.user;
  async.each(Object.keys(query), function (field, eachDone) {
    if (field === 'id') {
      return eachDone();
    }
    path = paths[field];
    if (!path) {
      return eachDone(errors.badRequest('\'data.query\' contains an invalid value'));
    }
    o = path.options || {};
    if (!o.searchable && !o.sortable) {
      return eachDone(errors.badRequest('\'data.query\' contains an invalid value'));
    }
    value = query[field];
    if (!value) {
      return eachDone(errors.badRequest('\'data.query\' contains an invalid value'));
    }

    var validator = o.validator;

    var validate = function (value, validated) {
      if (!value) {
        return validated();
      }
      var oo = {
        query: query,
        model: ctx.model,
        user: user,
        path: path,
        field: field,
        value: value,
        id: o.id,
        options: o
      };
      if (o.query) {
        return o.query(oo, function (err, updated) {
          if (err) {
            return validated(err);
          }
          query[field] = updated;
          validated();
        });
      }
      validator(oo, function (err, value) {
        if (err) {
          return validated();
        }
        oo.value = value;
        validated();
      });
    };

    var validateIn = function (val, validated) {
      if (!Array.isArray(val)) {
        return validated(errors.badRequest('\'data.query\' contains an invalid value'));
      }
      async.each(val, function (v, valid) {
        validate(v, valid);
      }, validated);
    };

    if (value.$in) {
      delete value.$lte;
      delete value.$gte;
      return validateIn(value.$in, eachDone);
    }

    if (!value.$lte && !value.$gte) {
      return validate(value, eachDone);
    }

    validate(value.$lte, function (err) {
      if (err) {
        return eachDone(err);
      }
      validate(value.$gte, eachDone);
    });
  }, function (err) {
    if (err) {
      return done(err);
    }
    if (query.id) {
      query._id = query.id;
      delete query.id;
    }
    commons.permitOnly(ctx, query, {$in: ['*', 'read']}, done);
  });
};

var validateSort = function (ctx, done) {
  var o;
  var path;
  var value;
  var sorter;
  var schema = ctx.model.schema;
  var paths = schema.paths;
  var search = ctx.search;
  var sort = search.sort || {updatedAt: -1, id: -1};
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
  if (!clone.updatedAt) {
    clone.updatedAt = -1
  }
  if (!clone._id) {
    clone['_id'] = clone.updatedAt;
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
    validator(o, function (err, value) {
      if (err) {
        return validated(errors.badRequest('data.cursor.%s', err.message));
      }
      o.value = value;
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
  var contexts = {};

  var user = ctx.user;

  var validateField = function (field, end) {
    var value;
    var path = paths[field];
    var options = path.options || {};

    var o = {
      model: ctx.model,
      user: user,
      path: path,
      field: field,
      value: data[field],
      valued: ctx.found && ctx.found[field],
      id: options.id,
      stream: streams[field],
      options: options,
      data: data,
      found: ctx.found,
      overrides: ctx.overrides
    };

    if (options.server) {
      value = options.value;
      if (!value) {
        return end();
      }
      value(o, function (err, value) {
        if (err) {
          return end(err);
        }
        encrypt(options, value, function (err, value) {
          if (err) {
            return end(err);
          }
          data[field] = value;
          end();
        });
      });
      return;
    }

    var hybrid = options.hybrid;

    var validateIt = function (validated) {
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
      validator(o, function (err, value) {
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
    };

    if (hybrid) {
      value = options.value;
      if (!value) {
        return end(new Error('!value'));
      }
      value(o, function (err, sv) {
        if (err) {
          return end(err);
        }
        var cv = data[field] || [];
        hybrid(o, sv, cv, function (err, values) {
          if (err) {
            return end(err);
          }
          o.value = values;
          validateIt(end);
        });
      });
      return;
    }

    if ((!o.value && o.value !== 0 && !o.stream) || (Array.isArray(o.value) && !o.value.length)) {
      value = options.value;
      if (value) {
        value(o, function (err, value) {
          if (err) {
            return end(err);
          }
          encrypt(options, value, function (err, value) {
            if (err) {
              return end(err);
            }
            data[field] = value;
            end();
          });
        });
        return;
      }
      if (!path.isRequired) {
        return end();
      }
      if (o.found && options.encrypted) {
        delete data[field];
        return end();
      }
      return end(unprocessableEntity('\'%s\' needs to be specified', field));
    }

    if (options.encrypted && o.valued && o.valued === o.value) {
      delete data[field];
      return end();
    }

    validateIt(end);
  };

  var findContext = function (field) {
    return contexts[field] || (contexts[field] = {
      after: []
    });
  };

  // TODO: remove fields which is not in schema
  async.eachLimit(Object.keys(paths), 1, function (field, validated) {
    var afterContext;
    var path = paths[field];
    var options = path.options || {};
    var after = options.after;

    if (after && paths[after]) {
      afterContext = findContext(after);
      if (!afterContext.done) {
        afterContext.after.push(field);
        return validated();
      }
    }

    var context = findContext(field);

    var finish = function (err) {
      if (err) {
        return validated(err);
      }
      var pending = context.after;
      async.each(pending, function (field, eachDone) {
        validateField(field, eachDone);
      }, validated);
    };

    validateField(field, function (err) {
      if (err) {
        return finish(err);
      }
      context.done = true;
      finish();
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
        user: user,
        path: path,
        model: ctx.model,
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
  var action = ctx.action || 'read';
  commons.permitOnly(ctx, query, {$in: ['*', action]}, function (err) {
    if (err) {
      return did(err);
    }
    ctx.query = query;
    ctx.action = action;
    did();
  });
};

exports.updatable = function (ctx, done) {
  if (ctx.found) {
    return done();
  }
  var action = ctx.action;
  ctx.action = 'update';
  exports.findOne(ctx, function (err) {
    if (err) {
      ctx.action = action;
      return done(err);
    }
    var user = ctx.user;
    if (!user) {
      ctx.action = action;
      return done(errors.unauthorized());
    }
    ctx.model.findOne(ctx.query, function (err, found) {
      ctx.action = action;
      if (err) {
        return done(err);
      }
      if (!found) {
        return done(errors.notFound());
      }
      ctx.found = utils.json(found);
      done();
    });
  });
};

exports.bumpable = function (ctx, done) {
  if (ctx.found) {
    return done();
  }
  var action = ctx.action;
  ctx.action = 'bumpup';
  exports.findOne(ctx, function (err) {
    if (err) {
      ctx.action = action;
      return done(err);
    }
    var user = ctx.user;
    if (!user) {
      ctx.action = action;
      return done(errors.unauthorized());
    }
    ctx.model.findOne(ctx.query, function (err, found) {
      ctx.action = action;
      if (err) {
        return done(err);
      }
      if (!found) {
        return done(errors.notFound());
      }
      ctx.found = utils.json(found);
      done();
    });
  });
};

exports.update = function (ctx, done) {
  var did = function () {
    done.apply(null, Array.prototype.slice.call(arguments));
  };
  exports.updatable(ctx, function (err) {
    if (err) {
      return did(err);
    }
    utils.visibles(ctx, ctx.data, function (err, data) {
      if (err) {
        return did(err);
      }
      ctx.data = data;
      exports.create(ctx, function (err) {
        if (err) {
          return done(err);
        }
        var schema = ctx.model.schema;
        var paths = schema.paths;
        var found = ctx.found;
        var args = Array.prototype.slice.call(arguments);
        async.eachLimit(Object.keys(paths), 1, function (field, processed) {
          var path = paths[field];
          var options = path.options || {};
          if (!options.encrypted && found[field] && !data[field]) {
            data[field] = null;
          }
          var verify = options.verify;
          if (!verify) {
            return processed();
          }
          if (found[field] === data[field]) {
            return processed();
          }
          var _ = data._ || found._;
          if (!_) {
            return processed();
          }
          var verified = _.verified;
          if (!verified) {
            return processed();
          }
          delete verified[field];
          processed();
        }, function (err) {
          if (err) {
            return done(err);
          }
          done.apply(null, args);
        });
      });
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
