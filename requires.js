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

exports.realEstateUsage = function (options) {
  options = options || {};
  return function (o, done) {
    var options = o.options;
    var field = options.field || o.field;
    var data = o.data;
    if (data.residential || data.commercial) {
      return done()
    }
    done(unprocessableEntity('residential or commercial needs to be specified'));
  };
};

exports.realEstateSize = function (options) {
  options = options || {};
  return function (o, done) {
    var options = o.options;
    var field = options.field || o.field;
    var data = o.data;
    if (data.extent || data.area) {
      return done()
    }
    done(unprocessableEntity('extent or area needs to be specified'));
  };
};

exports.realEstateOffer = function (options) {
  options = options || {};
  return function (o, done) {
    var options = o.options;
    var field = options.field || o.field;
    var data = o.data;
    if (data.sell || data.rent) {
      return done()
    }
    done(unprocessableEntity('sell or rent needs to be specified'));
  };
};

exports.realEstateFloors = function (options) {
  options = options || {};
  return function (o, done) {
    var options = o.options;
    var field = options.field || o.field;
    var data = o.data;
    if (['land', 'room'].indexOf(data.type) !== -1) {
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
    var engine = data.engine;
    if (['none', 'other'].indexOf(engine) !== -1) {
      return done()
    }
    done(unprocessableEntity('\'%s\' needs to be specified', field));
  };
};
