var errors = require('errors');

exports.json = function (req, res, next) {
    if (req.is('application/json')) {
        return next();
    }
    res.pond(errors.unsupportedMedia());
};