module.exports = {
    OK: 0,
    UnknownError: 101,
    InvalidRequest: 102,
    TIME_OUT: 103,
    NEED_AUTH: 104,
    ALREADY_CLAIMED: 105,
    LEVEL_TOO_LOW: 106,


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
        DO_NOT_OWN_ITEM: 7
    },


    InternalServerError: 500
};
