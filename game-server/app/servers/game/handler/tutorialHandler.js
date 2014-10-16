var models = require("../../../../../shared/models");
var base = require("../../../../../shared/base");
var Constants = require("../../../../../shared/constants");
var wrapSession = require("../../../utils/monkeyPatch").wrapSession;
var Promise = require("bluebird");
var _ = require("lodash");
var fs = require("fs");
var AhoCorasick = require('aho-corasick.js');
var logger;

var patternTrie = null;

module.exports = function (app) {
    return new TutorialHandler(app);
};

function readLines(input, func, end) {
    var remaining = '';

    input.on('data', function(data) {
        remaining += data;
        var index = remaining.indexOf('\n');
        while (index > -1) {
            var line = remaining.substring(0, index);
            remaining = remaining.substring(index + 1);
            func(line);
            index = remaining.indexOf('\n');
        }
    });

    input.on('end', function() {
        if (remaining.length > 0) {
            func(remaining);
        }
        end();
    });
}

class TutorialHandler extends base.HandlerBase {
    constructor(app) {
        this.app = app;
        logger = require('../../../utils/rethinkLogger').getLogger(app);

        if (!patternTrie) {
            patternTrie = new AhoCorasick.TrieNode();
            var input = fs.createReadStream(app.getBase() + "/config/data/reject.txt");
            readLines(input, function (data) {
                data = data.trim();
                if (data) {
                    patternTrie.add(data);
                }
            }, function () {
                AhoCorasick.add_suffix_links(patternTrie);
            });
        }
    }

    testNameValid(name) {
        var valid = true;
        AhoCorasick.search(name, patternTrie, function(word) {
            if (word) valid = false;
        });
        return valid;
    }

    setName(msg, session, next) {
        wrapSession(session);

        var newName = msg.name;
        var role = session.get("role");
        if (role.tutorial !== 1) {
            return this.errorNext(Constants.TutorialFailed.TutorialStateError, next);
        }
        if (!newName || newName.length < 2 || newName.length >= 20 || !this.testNameValid(newName)) {
            return this.errorNext(Constants.NameInvalid, next);
        }

        role.name = newName;
        role.tutorial = 3;
        session.set("role", role);

        this.safe(Promise.join(session.push("role"), models.Role.get(role.id).update({tutorial: 2, name: newName}).run())
        .then(() => {
            next(null, {ok: true, tutorial: 2});
        }), next);
    }

    pickHero(msg, session, next) {
        wrapSession(session);

        var heroId = msg.heroId;

        var newRoleConf = this.app.get("roleBootstrap");
        var role = session.get("role");
        var newHero;

        if (role.tutorial !== 2) {
            return this.errorNext(Constants.TutorialFailed.TutorialStateError, next);
        }
        if (!heroId || !_.contains(newRoleConf.initialHeroCandidates, heroId)) {
            return this.errorNext(Constants.InvalidRequest, next);
        }

        this.safe(new models.Hero({heroDefId: heroId, owner: role.id}).save()
        .then(function (_newHero) {
            newHero = _newHero;
            role.tutorial = 3;
            role.team[0] = newHero.id;
            session.set("role", role);
            return [models.Role.get(role.id).update({tutorial: 3, team: role.team}).run(), session.push("role")];
        })
        .then(() => {
            next(null, {newHero: newHero.toClientObj(), tutorial: 3});
        }), next);
    }
}
