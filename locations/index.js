var util = require('util');
var errors = require('errors');

var format = function () {
    return util.format.apply(util.format, Array.prototype.slice.call(arguments));
};

var unprocessableEntity = function () {
    var message = format.apply(format, Array.prototype.slice.call(arguments));
    return errors.unprocessableEntity(message);
};

exports.district = function (o, done) {
    var options = o.options;
    var field = options.field || o.field;
    var data = o.data;
    var district = o.value;
    var country = data.country;
    if (country !== 'LK') {
        return done();
    }
    if (!district) {
        return done(unprocessableEntity('\'%s\' needs to be specified', field));
    }
    done();
};

exports.province = function (o, done) {
    var options = o.options;
    var field = options.field || o.field;
    var data = o.data;
    var province = o.value;
    var country = data.country;
    if (country !== 'LK') {
        return done();
    }
    if (!province) {
        return done(unprocessableEntity('\'%s\' needs to be specified', field));
    }
    done();
};

exports.state = function (o, done) {
    var options = o.options;
    var field = options.field || o.field;
    var data = o.data;
    var state = o.value;
    var country = data.country;
    if (country !== 'LK') {
        return done();
    }
    if (state) {
        return done(unprocessableEntity('\'%s\' contains an invalid value', field));
    }
    done();
};
