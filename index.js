var log = require('logger')('validators:index');
var util = require('util');
var fs = require('fs');
var async = require('async');
var stream = require('stream');
var _ = require('lodash');
var tmp = require('tmp');
var mongoose = require('mongoose');
// var formida = require('formida');
var formidable = require('formidable')

var serand = require('serand');
var errors = require('errors');

var format = function () {
    return util.format.apply(util.format, Array.prototype.slice.call(arguments));
};

var unprocessableEntity = function () {
    var message = format.apply(format, Array.prototype.slice.call(arguments));
    return errors.unprocessableEntity(message);
};

var notify = function (res, err) {
    if (err instanceof serand.Error) {
        return res.pond(err);
    }
    res.pond(errors.serverError());
};

exports.types = {};

exports.contents = {};

exports.types.string = function (options) {
    options = options || {}
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
    options = options || {}
    return function (o, done) {
        var number = o.value;
        var field = options.field || o.field;
        if (!number) {
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
        return done();
    };
};

exports.types.stream = function (options) {
    options = options || {}
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
    options = options || {}
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
    options = options || {}
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
                path: o.path,
                field: field + '[*]',
                value: v,
                options: o.options
            }, validated)
        }, done);
    };
};

exports.types.ref = function (options) {
    options = options || {}
    return function (o, done) {
        var ref = o.value;
        var field = options.field || o.field;
        if (!mongoose.Types.ObjectId.isValid(ref)) {
            return done(unprocessableEntity('\'%s\' needs to be a valid reference', field));
        }
        done()
    };
};

exports.types.boolean = function (options) {
    options = options || {}
    return function (o, done) {
        var boolean = o.value;
        var field = options.field || o.field;
        if (!boolean) {
            return done(unprocessableEntity('\'%s\' needs to be specified', field));
        }
        if (typeof boolean !== 'boolean' && !(boolean instanceof Boolean)) {
            return done(unprocessableEntity('\'%s\' needs to be a boolean', field));
        }
        done()
    };
};

exports.types.url = function (options) {
    options = options || {}
    return function (o, done) {
        var url = o.value;
        var field = options.field || o.field;
        if (!url || url.length > 2000 || (url.indexOf('http://') === -1 && url.indexOf('https://') === -1)) {
            return done(unprocessableEntity('\'%s\' contains an invalid value', field));
        }
        done();
    };
};

exports.types.name = function (options) {
    options = options || {}
    return function (o, done) {
        done()
    };
};

exports.types.title = function (options) {
    options = options || {}
    return function (o, done) {
        done()
    };
};

exports.types.color = function (options) {
    options = options || {}
    return function (o, done) {
        done()
    };
};

exports.types.currency = function (options) {
    options = options || {}
    return function (o, done) {
        done()
    };
};

exports.types.contacts = function (options) {
    options = options || {}
    return function (o, done) {
        done()
    };
};

exports.types.date = function (options) {
    options = options || {}
    return function (o, done) {
        done()
    };
};

exports.types.email = function (options) {
    options = options || {}
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
        done()
    };
};

exports.types.password = function (options) {
    options = options || {}
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
    options = options || {}
    return function (o, done) {
        done()
    };
};

exports.types.addresses = function (options) {
    options = options || {}
    return function (o, done) {
        done()
    };
};

exports.types.phones = function (options) {
    options = options || {}
    return function (o, done) {
        done()
    };
};

exports.types.socials = function (options) {
    options = options || {}
    return function (o, done) {
        done()
    };
};

exports.contents.json = function (req, res, done) {
    if (req.is('application/json')) {
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
        //log.debug('received >>> %s', rec);
        //log.debug('expected >>> %s', exp);
    });
    form.on('field', function (name, value) {
        if (name !== 'data') {
            return;
        }
        log.debug('%s %s', name, value);
        req.body = JSON.parse(value);
    });
    form.on('file', function (name, file) {
        log.debug('name: %s', name);
        log.debug('file: %s', file);
        var streams = req.streams[name] || (req.streams[name] = []);
        streams.push(file);
    });
    form.on('error', function (err) {
        log.debug(err);
        done(errors.badRequest());
    });
    form.on('aborted', function () {
        log.debug('request was aborted');
        done();
    });
    form.on('end', function () {
        log.debug('form end');
        done();
    });
    form.parse(req);
};

exports.pre = function (options, req, res, next) {
    var content = options.content || 'json';
    var validate = exports.contents[content];
    validate(req, res, function (err) {
        if (err) {
            return notify(res, err);
        }
        var model = options.model;
        var data = req.body;
        var schema = model.schema;
        var paths = schema.paths;
        var streams = req.streams || {};
        // TODO: remove fields which is not in schema
        async.eachLimit(Object.keys(paths), 1, function (field, validated) {
            var path = paths[field];
            var options = path.options || {};
            if (options.server) {
                return validated();
            }
            var o = {
                path: path,
                field: field,
                value: data[field],
                stream: streams[field],
                options: {}
            };
            if (!o.value && !o.stream) {
                return validated(path.isRequired ? unprocessableEntity('\'%s\' needs to be specified', field) : null);
            }
            var validator = options.validator;
            if (!validator) {
                return validated();
            }
            validator(o, validated);
        }, function (err) {
            if (!err) {
                return next();
            }
            notify(res, err);
        });
    });
};