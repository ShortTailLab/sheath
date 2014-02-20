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
    Role_Do_Not_Exist: 109,
    Mail_Do_Not_Exist: 110,
    Already_Claimed: 111,


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
        QUALITY_TOO_LOW: 13,
        ALREADY_BOUND: 14,
        CANNOT_BIND_GEM_TYPE: 15
    },
    HeroFailed: {
        DO_NOT_OWN_HERO: 60,
        ALREADY_EQUIPPED: 61,
        CANNOT_EQUIP_WEAPON_TYPE: 62,
        STORAGE_MAX: 63
    },
    TaskFailed: {
        NO_TASK: 90,
        TASK_NOT_DONE: 91
    },


    InternalServerError: 500
};
