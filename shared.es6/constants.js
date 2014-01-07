module.exports = {
    OK: 0,
    UnknownError: 1,
    InvalidRequest: 2,
    TimeOut: 3,
    NeedAuth: 4,


    LoginFailed: {
        ID_PASSWORD_MISMATCH: 1,
        NO_USER: 2,
        AlreadyLoggedIn: 3
    },
    PartitionFailed: {
        PARTITION_DO_NOT_EXIST: 5,
        PARTITION_FULL: 6
    },
    EquipmentFailed: {
        DO_NOT_OWN_ITEM: 7
    },
    ALREADY_CLAIMED: 8,


    InternalServerError: 500
};
