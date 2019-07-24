var util = require('util');
var fs = require('fs');
var mongoose = require('mongoose');
var async = require('async');
var _ = require('lodash');

var utils = require('utils');
var errors = require('errors');

var format = function () {
  return util.format.apply(util.format, Array.prototype.slice.call(arguments));
};

var unprocessableEntity = function () {
  var message = format.apply(format, Array.prototype.slice.call(arguments));
  return errors.unprocessableEntity(message);
};

exports.array = function (options) {
  options = options || {};
  return function (o, done) {
    var value = o.value;
    var field = o.field;
    var allowed = options.allowed;

    var keywords = ['$or', '$and'];

    var error = function () {
      return unprocessableEntity('\'%s\' contains an invalid value', field);
    };

    var validate = function (field, validated) {
      if (!field) {
        return validated(error());
      }
      if (field instanceof String || typeof field === 'string') {
        if (field.indexOf('$') === 0 && keywords.indexOf(field) === -1) {
          return validated(error());
        }
        if (allowed.indexOf(field) === -1) {
          return validated(error());
        }
        return validated(null, field);
      }
      var av = [];
      if (Array.isArray(field)) {
        async.each(field, function (val, eachDone) {
          validate(val, function (err, value) {
            if (err) {
              return eachDone(err);
            }
            av.push(value);
            eachDone();
          });
        }, function (err) {
          if (err) {
            return validated(err);
          }
          validated(null, {$and: av});
        });
        return;
      }
      var ov = {};
      async.each(Object.keys(field), function (key, eachDone) {
        validate(key, function (err, key) {
          if (err) {
            return eachDone(err);
          }
          ov[key] = field[key];
          eachDone();
        });
      }, function (err) {
        if (err) {
          return validated(err);
        }
        validated(null, ov);
      });
    };

    validate(value, function (err, value) {
      if (err) {
        return done(err);
      }
      done(null, {$elemMatch: value});
    });
  }
};
