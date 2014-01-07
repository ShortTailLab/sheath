var Constants = require("./constants");

class HandlerBase {
    errorNext(err, next) {
        var result = {error: {code: Constants.UnknownError}};
        if (typeof err === "number")
            result.error.code = err;
        else if (err.__sheath__error__) {}
        result.error.code = err.code;
        if (typeof err.message === "string")
            result.error.message = err.message;
        next(null, result);
    }
}

module.exports = {
    HandlerBase: HandlerBase
};
