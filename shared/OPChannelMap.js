var _ = require("lodash");

exports.Name2ID = {
    "UC": "CUSTOM",
    "UC-A": "CUSTOM",
    "APPL-OP": "CUSTOM",
    "OURPALM":   "CUSTOM",
    "OURPALM-A": "CUSTOM",
    "SAMSUNG": "CUSTOM",
    "HUNT": "CUSTOM",
    "CROSS": "CUSTOM",
    "MUMAYI": "CUSTOM",
    "WANDOUJIA": "CUSTOM",
    "PGYUAN": "CUSTOM",
    "DIYI": "CUSTOM",
    "FIVEONE": "CUSTOM",
    "PIPA": "CUSTOM",
    "PP": "CUSTOM",
    "DJ": "CUSTOM",
    "DJ-A": "CUSTOM",
    "KY": "CUSTOM",
    "MM": "CUSTOM",
    "JSCMCC": "CUSTOM",
    "UNICOM": "CUSTOM",
    "JIFENG": "CUSTOM",
    "BR": "CUSTOM",
    "3G": "CUSTOM",
    "TONGBU": "CUSTOM",
    "XIAOMI": "CUSTOM",
    "JINLI": "CUSTOM",
    "ZTE": "CUSTOM",
    "PAGE": "CUSTOM",

    "CUSTOM": "CUSTOM"
};


exports.ID2Name = _.invert(exports.Name2ID);
