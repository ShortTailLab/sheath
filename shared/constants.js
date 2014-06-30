module.exports = {
    OK: 0,
    UnknownError: 101,
    InvalidRequest: 102,
    TIME_OUT: 103,
    NEED_AUTH: 104,
    ALREADY_CLAIMED: 105,
    LEVEL_TOO_LOW: 106,
    NO_COINS: 107,
    NO_GOLDS: 108,
    NO_CONTRIBS: 109,
    NO_ENERGY: 110,
    NO_ROOM: 111,
    NO_IRONS: 112,

    Role_Do_Not_Exist: 112,
    Mail_Do_Not_Exist: 113,

    NameInvalid: 114,


    LoginFailed: {
        ID_PASSWORD_MISMATCH: 1,
        NO_USER: 2,
        AlreadyLoggedIn: 3
    },
    PartitionFailed: {
        PARTITION_DO_NOT_EXIST: 5,
        PARTITION_FULL: 6,
        PARTITION_NOT_OPEN: 7
    },
    EquipmentFailed: {
        DO_NOT_OWN_ITEM: 8,
        LEVEL_MAX: 9,
        NO_ENFORCEMENT_STONE: 10,
        NO_MATERIAL: 11,
        NO_SLOT: 12,
        ALREADY_BOUND: 14,
        CANNOT_BIND_GEM_TYPE: 15
    },
    HeroFailed: {
        DO_NOT_OWN_HERO: 60,
        ALREADY_EQUIPPED: 61,
        CANNOT_EQUIP_WEAPON_TYPE: 62,
        STORAGE_MAX: 63,
        NO_FREE_REFRESH: 64,
        NO_PAID_REFRESH: 65,
        NOT_IN_BAR: 66,
        NOT_ENOUGH_SOULS: 67,
        ALREADY_HAVE_HERO: 68,
        NO_HERO: 69,
        REFINE_MAX: 70
    },
    TaskFailed: {
        NO_TASK: 90,
        TASK_NOT_DONE: 91
    },
    RoleFailed: {
        DO_NOT_OWN_HERO: 110,
        NO_FORMATION: 111,
        FORMATION_LEVEL_MAX: 112,
        NO_BOOK: 113
    },
    StageFailed: {
        NO_LEVEL: 120,
        Invalid_End: 121,
        LevelRequired: 122
    },
    StoreFailed: {
        NO_REFRESH: 160,
        NO_PURCHASE: 161,
        NO_ITEM: 162
    },
    ChatFailed: {
        NO_CHANNEL: 190,
        NOT_IN_CHANNEL: 191
    },
    TutorialFailed: {
        TutorialStateError: 301
    },


    InternalServerError: 500
};
