var _ = require("lodash");

var makeErrorObject = function (errorId, errorMessage) {
    return {
        code: errorId,
        message: errorMessage,
        __sheath__error__: true
    };
};

module.exports = {
    OK: 0,
    UnknownError: 1,
    InvalidRequest: 2,
    TIME_OUT: 3,
    NEED_AUTH: 4,
    ALREADY_CLAIMED: 5,
    LEVEL_TOO_LOW: 6,
    NO_COINS: 7,
    NO_GOLDS: 8,
    NO_CONTRIBS: 9,
    NO_ENERGY: 10,
    NO_ROOM: 11,
    NO_IRONS: 12,
    Role_Do_Not_Exist: 13,
    Mail_Do_Not_Exist: 14,
    NameInvalid: 15,

    LoginFailed: {
        ID_PASSWORD_MISMATCH: 100,
        NO_USER: 101,
        AlreadyLoggedIn: 102
    },
    PartitionFailed: {
        PARTITION_DO_NOT_EXIST: 200,
        PARTITION_FULL: 201,
        PARTITION_NOT_OPEN: 202
    },
    EquipmentFailed: {
        DO_NOT_OWN_ITEM: 300,
        LEVEL_MAX: 301,
        NO_ENFORCEMENT_STONE: 302,
        NO_MATERIAL: 303,
        NO_SLOT: 304,
        ALREADY_BOUND: 305,
        CANNOT_BIND_GEM_TYPE: 306,
        NOT_ENOUGH_FRAGMENT: 307
    },
    HeroFailed: {
        DO_NOT_OWN_HERO: 400,
        ALREADY_EQUIPPED: 401,
        CANNOT_EQUIP_WEAPON_TYPE: 402,
        STORAGE_MAX: 403,
        NO_FREE_REFRESH: 404,
        NO_PAID_REFRESH: 405,
        NOT_IN_BAR: 406,
        NOT_ENOUGH_SOULS: 407,
        ALREADY_HAVE_HERO: 408,
        NO_HERO: 409,
        REFINE_MAX: 410,
        REFINE_LEVEL_NOT_MATCH: 411,
        NO_MATERIAL_ITEM: 412,
        NO_MATERIAL_HERO: 413
    },
    TaskFailed: {
        NO_TASK: 500,
        TASK_NOT_DONE: 501
    },
    RoleFailed: {
        DO_NOT_OWN_HERO: 600,
        NO_FORMATION: 601,
        FORMATION_LEVEL_MAX: 602,
        NO_BOOK: 603
    },
    StageFailed: {
        NO_LEVEL: 700,
        Invalid_End: 701,
        LevelRequired: makeErrorObject(702, "use level too low")
    },
    StoreFailed: {
        NO_REFRESH: 800,
        NO_PURCHASE: 801,
        NO_ITEM: 802
    },
    ChatFailed: {
        NO_CHANNEL: 900,
        NOT_IN_CHANNEL: 901
    },
    TutorialFailed: {
        TutorialStateError: 1000
    },

    InternalServerError: 55555
};

var iterateObject = function (errors) {
    _.forEach(errors, function (value, key) {
        if (_.isNumber(value)) {
            errors[key] = makeErrorObject(value, key);
        }
        else if (_.isObject(value) && _.isUndefined(value.code) && _.isUndefined(value.message)) {
            iterateObject(value);
        }
    });
};

iterateObject(module.exports);
