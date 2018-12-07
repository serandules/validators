var locations = require('./locations');

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
