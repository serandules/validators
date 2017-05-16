var util = require('util');
var async = require('async');
var mongoose = require('mongoose');
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

exports.types.string = function (options) {
    return function (o, string, done) {
        o = options.field || o
        if (!string) {
            return done(unprocessableEntity('\'%s\' needs to be specified', o));
        }
        if (typeof string !== 'string' && !(string instanceof String)) {
            return done(unprocessableEntity('\'%s\' needs to be a string', o));
        }
        if (options.enum) {
            if (options.enum.indexOf(string) !== -1) {
                return done()
            }
            return done(unprocessableEntity('\'%s\' contains an invalid value', o));
        }
        if (string.length > options.length) {
            return done(unprocessableEntity('\'%s\' exceeds the allowed length', o));
        }
        return done();
    };
};

exports.types.number = function (options) {
    return function (o, number, done) {
        o = options.field || o
        if (!number) {
            return done(unprocessableEntity('\'%s\' needs to be specified', o));
        }
        if (typeof number !== 'number' && !(number instanceof Number)) {
            return done(unprocessableEntity('\'%s\' needs to be a number', o));
        }
        if (options.enum) {
            if (options.enum.indexOf(number) !== -1) {
                return done()
            }
            return done(unprocessableEntity('\'%s\' contains an invalid value', o));
        }
        if (number.length > options.length) {
            return done(unprocessableEntity('\'%s\' exceeds the allowed length', o));
        }
        return done();
    };
};

exports.types.array = function (options) {
    return function (o, array, done) {
        options.max = options.max || 10;
        options.min = options.min || 0;
        o = options.field || o
        if (!array) {
            return done(unprocessableEntity('\'%s\' needs to be specified', o));
        }
        if (!Array.isArray(array)) {
            return done(unprocessableEntity('\'%s\' needs to be an array', o));
        }
        if (options.max < array.length) {
            return done(unprocessableEntity('\'%s\' exceeds the allowed length', o));
        }
        if (options.min > array.length) {
            return done(unprocessableEntity('\'%s\' needs to contain more items', o));
        }
        async.each(array, function (v, validated) {
            options.validator(o + '[*]', v, validated)
        }, done);
    };
};

exports.types.ref = function (options) {
    return function (o, ref, done) {
        done()
    };
};

exports.types.url = function (options) {
    return function (o, url, done) {
        if (!url || url.length > 2000 || (url.indexOf('http://') === -1 && url.indexOf('https://') === -1)) {
            return done(unprocessableEntity('\'%s\' contains an invalid value', o));
        }
        done();
    };
};

exports.types.name = function (options) {
    return function (o, name, done) {
        done()
    };
};

exports.types.email = function (options) {
    return function (o, email, done) {
        if (!email) {
            return done(unprocessableEntity('\'%s\' needs to be specified', o));
        }
        var at = email.indexOf('@');
        var dot = email.lastIndexOf('.');
        if (at === -1 || dot === -1 || dot < at) {
            return done(unprocessableEntity('\'%s\' needs to be a valid email address', o));
        }
        done()
    };
};

exports.types.password = function (options) {
    return function (o, password, done) {
        if (!password) {
            return done(unprocessableEntity('\'%s\' needs to be specified', o));
        }
        if (password.length < 6) {
            return done(unprocessableEntity('\'%s\' should at least be 6 characters', o));
        }
        var blocked = options.blocked || {};
        var pass = password.toLowerCase();
        var field;
        for (field in blocked) {
            if (!blocked.hasOwnProperty(field)) {
                continue;
            }
            if (pass !== blocked[field].toLowerCase()) {
                continue;
            }
            return done(unprocessableEntity('\'%s\' should not be equivalent to the \'%s\'', o, field));
        }
        if (!/[0-9]/.test(password)) {
            return done(unprocessableEntity('\'%s\' should contain at least one number', o));
        }
        if (!/[a-z]/.test(password)) {
            return done(unprocessableEntity('\'%s\' should contain at one lower case letter', o));
        }
        if (!/[A-Z]/.test(password)) {
            return done(unprocessableEntity('\'%s\' should contain at one upper case letter', o));
        }
        done();
    };
};

exports.types.birthday = function (options) {
    return function (o, birthday, done) {
        done()
    };
};

exports.types.addresses = function (options) {
    return function (o, addresses, done) {
        done()
    };
};

exports.types.phones = function (options) {
    return function (o, phones, done) {
        done()
    };
};

exports.types.socials = function (options) {
    return function (o, socials, done) {
        done()
    };
};

exports.json = function (req, res, done) {
    if (req.is('application/json')) {
        return done();
    }
    done(errors.unsupportedMedia());
};

exports.pre = function (model, req, res, next) {
    exports.json(req, res, function (err) {
        if (err) {
            return notify(res, err);
        }
        var data = req.body;
        var schema = model.schema;
        var paths = schema.paths;
        async.eachLimit(Object.keys(paths), 1, function (path, validated) {
            var o = paths[path];
            var value = data[path];
            if (!value) {
                return validated(o.isRequired ? unprocessableEntity('\'%s\' needs to be specified', path) : null);
            }
            var options = o.options || {};
            var validator = options.validator;
            if (!validator) {
                return validated();
            }
            validator(path, value, validated)
        }, function (err) {
            if (!err) {
                return next();
            }
            notify(res, err);
        });
    });
};