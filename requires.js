var util = require('util');
var errors = require('errors');
var locations = require('./locations');

var format = function () {
  return util.format.apply(util.format, Array.prototype.slice.call(arguments));
};

var unprocessableEntity = function () {
  var message = format.apply(format, Array.prototype.slice.call(arguments));
  return errors.unprocessableEntity(message);
};


exports.district = function (options) {
  options = options || {};
  return function (o, done) {
    return locations.district(o, done);
  };
};

exports.province = function (options) {
  options = options || {};
  return function (o, done) {
    return locations.province(o, done);
  };
};

exports.state = function (options) {
  options = options || {};
  return function (o, done) {
    return locations.state(o, done);
  };
};

exports.contacts = function (options) {
  options = options || {};
  return function (o, done) {
    var options = o.options;
    var field = options.field || o.field;
    var data = o.data;
    if (data.email || (data.phones && data.phones.length) || data.viber || data.whatsapp || data.messenger || data.skype) {
      return done()
    }
    done(unprocessableEntity('\'%s\' needs to be specified', field));
  };
};

exports.engine = function (options) {
  options = options || {};
  return function (o, done) {
    var options = o.options;
    var field = options.field || o.field;
    var data = o.data;
    var fuel = data.fuel;
    if (['none', 'other', 'electric'].indexOf(fuel) !== -1) {
      return done()
    }
    done(unprocessableEntity('\'%s\' needs to be specified', field));
  };
};

exports.driveType = function (options) {
  options = options || {};
  return function (o, done) {
    var options = o.options;
    var field = options.field || o.field;
    var data = o.data;
    var driveType = data.driveType;
    if (driveType === 'other') {
      return done()
    }
    done(unprocessableEntity('\'%s\' needs to be specified', field));
  };
};
