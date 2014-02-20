var sheathControllers = angular.module('sheath.controllers', []);

Array.prototype.chunk = function(chunkSize) {
    var array=this;
    return [].concat.apply([],
        array.map(function(elem,i) {
            return i%chunkSize ? [] : [array.slice(i,i+chunkSize)];
        })
    );
};

Array.prototype.toMap = function(key) {
    var ret = {};
    for (var i=0;i<this.length;i++) {
        var obj = this[i];
        ret[obj[key]] = obj;
    }
    return ret;
};

function diffModel(m1, m2, fields) {
    var diff = {id: m1.id};
    for (var i=0;i<fields.length;i++) {
        var field = fields[i];
        if (m1[field] !== m2[field]) {
            diff[field] = m2[field];
        }
    }
    return diff;
}

sheathControllers.controller('basicStatsController', function ($scope, $http, $window) {
    var refreshInterval = 8000;
    $scope.refreshInterval = refreshInterval / 1000;

    function fetch120() {
        $http.get("/api/nodeInfo").
        success(function (data) {
            $scope.nodes = _.values(data.nodes);
        });
    }

    function fetch5() {
        $http.get("/api/basicStats").
        success(function (data) {
            if ($scope.userStats === undefined) {
                $scope.userStats = {
                    _clients: data.onlineUser.totalConnCount,
                    _onlineUsers: data.onlineUser.loginedCount,
                    _totalUsers: data.totalUsers,
                    _totalRoles: data.totalRoles
                };
            }
            else {
                $scope.userStats._clients = $scope.userStats.clients;
                $scope.userStats._onlineUsers = $scope.userStats.onlineUsers;
                $scope.userStats._totalUsers = $scope.userStats.totalUsers;
                $scope.userStats._totalRoles = $scope.userStats.totalRoles;
            }
            $scope.userStats.clients = data.onlineUser.totalConnCount;
            $scope.userStats.onlineUsers = data.onlineUser.loginedCount;
            $scope.userStats.totalUsers = data.totalUsers;
            $scope.userStats.totalRoles = data.totalRoles;
            $scope.userStats.loginList = data.onlineUser.loginedList.chunk(10);
        });
    }

    $scope.humanizeUpTime = function (minute) {
        return moment.duration(-minute, "minutes").humanize();
    };
    $scope.getToolTip = function (user) {
        return "<table>" +
            "<tr><td><b>等级</b></td><td>" + user.role.level +"</td>" + "</tr>" +
            "<tr><td><b>登陆时间</b></td><td>" + moment(user.loginTime).fromNow() +"</td>" + "</tr>" +
            "<tr><td><b>IP地址</b></td><td>" + user.address +"</td>" + "</tr>" +
            "</table>";
    };

    $scope.intervalID5 = $window.setInterval(function () {$scope.$apply(fetch5);}, refreshInterval);
    $scope.intervalID120 = $window.setInterval(function () {$scope.$apply(fetch120);}, 120 * 1000);

    $scope.$on('$destroy', function () {
        if ($scope.intervalID5) {
            $window.clearInterval($scope.intervalID5);
            delete $scope.intervalID5;
        }
        if ($scope.intervalID120) {
            $window.clearInterval($scope.intervalID120);
            delete $scope.intervalID120;
        }
    });

    fetch5();
    fetch120();
});

sheathControllers.controller('userListController', function ($scope, $http, ngTableParams, $routeParams) {
    $scope.query = null;
    var partitionId = $routeParams.partId;

    $http.get("/api/partitions").success(function (data) {
        $scope.partitions = data.partitions;
        _.each($scope.partitions, function (p) { p.selected = !partitionId || (partitionId === p.id); });

        $scope.tableParams = new ngTableParams({
            page: 1,
            count: 20
        }, {
            counts: [],
            groupBy: "partitionName",
            getData: function($defer, params) {
                var partitions = _.pluck(_.filter($scope.partitions, function (p) {return p.selected;}), "id");
                $http.post("/api/userList", {pageSize: params.count(), page: params.page(), hint:$scope.query, partitions: partitions})
                .success(function (data) {
                    params.total(data.totalRoles);
                    _.each(data.roles, function (r) {
                        var part = _.findWhere($scope.partitions, {id: r.partition});
                        if (part) {
                            r.partitionName = part.name;
                        }
                        else {
                            r.partitionName = "---";
                        }
                    });

                    $defer.resolve(data.roles);
                });
            }
        });
    });

    $scope.submit = function () {
        $scope.tableParams.reload();
    };
    $scope.edit = function (role) {
        role.editable = angular.copy(role);
    };
    $scope.save = function (role) {
        var editable = role.editable;
        delete role.editable;
        var diff = diffModel(role, editable, ["level", "energy", "golds", "coins", "contribs"]);

        if (_.size(diff) > 1) {
            $http.post("/api/updateRole", diff).success(function (data) {
                _.extend(role, data);
            })
            .error(function (err) {
                $scope.error = "更新用户数据失败: " + (err.message || "未知错误");
            });
        }
    };
});

sheathControllers.controller('userDetailController', function ($scope, $http, $routeParams, $timeout, $q, $modal, $filter, ngTableParams) {
    $scope.uid = $routeParams.uid;
    $scope.editorParams = {
        useWrapMode : false,
        showGutter: true,
        theme:'xcode',
        mode: 'json'
    };
    $scope.heroTableParams = new ngTableParams({
        page: 1,
        count: 20,
        sorting: {id: "asc"}
    }, {
        counts: [],
        getData: function ($defer, params) {
            if ($scope.heroes) {
                var orderedData = params.sorting() ?
                    $filter('orderBy')($scope.heroes, params.orderBy()) :
                    $scope.heroes;
                $defer.resolve(orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count()));
            }
            else {
                $defer.resolve([]);
            }
        }
    });
    $scope.itemTableParams = new ngTableParams({
        page: 1,
        count: 20,
        sorting: {id: "asc"}
    }, {
        counts: [],
        getData: function ($defer, params) {
            if ($scope.items) {
                var orderedData = params.sorting() ?
                    $filter('orderBy')($scope.items, params.orderBy()) :
                    $scope.items;
                $defer.resolve(orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count()));
            }
            else {
                $defer.resolve([]);
            }
        }
    });
    $scope.edit = function (item) {
        item.editable = angular.copy(item);
    };
    $scope.saveItem = function (item) {
        var editable = item.editable;
        delete item.editable;
        var diff = diffModel(item, editable, ["bound", "level", "refinement", "refineProgress"]);
        if (_.has(diff, "bound") && !diff.bound) {
            diff.bound = null;
        }
        if (_.size(diff) > 1) {
            $http.post("/api/updateItem", diff).success(function (data) {
                _.extend(item, data);
            })
            .error(function (err) {
                $scope.error = "更新用户数据失败: " + (err.message || "未知错误");
            });
        }
    };
    $scope.saveHero = function (hero) {
        var editable = hero.editable;
        delete hero.editable;
        var diff = diffModel(hero, editable, ["level", "exp"]);
        if (_.size(diff) > 1) {
            $http.post("/api/updateHero", diff).success(function (data) {
                _.extend(hero, data);
            })
            .error(function (err) {
                $scope.error = "更新用户数据失败: " + (err.message || "未知错误");
            });
        }
    };
    $scope.remove = function (item) {
        var req;
        if (item.itemDefId) {
            req = $http.post("/api/removeItem", {item: item.id}).error(function (data) {
                $scope.item_error = "删除道具失败，" + (data.message || "未知错误");
            });
        }
        else {
            req = $http.post("/api/removeHero", {hero: item.id}).error(function (data) {
                $scope.hero_error = "删除武将失败，" + (data.message || "未知错误");
            });
        }
        req.success(function (data) {
            var index = $scope.heroes.indexOf(item);
            if (index !== -1) {
                $scope.heroes.splice(index, 1);
                $scope.heroTableParams.total($scope.heroes.length);
                $scope.heroTableParams.reload();
                $scope.hero_error = null;
            }
            else {
                index = $scope.items.indexOf(item);
                $scope.items.splice(index, 1);
                $scope.itemTableParams.total($scope.heroes.length);
                $scope.itemTableParams.reload();
                $scope.item_error = null;
            }
        });
    };

    $scope.update = function () {
        var modified = angular.fromJson($scope.roleJson);
        var oldDataFields = _.keys($scope.roleData);
        for (var i=0;i<oldDataFields.length;i++) {
            var field = oldDataFields[i];
            if (modified[field] === $scope.roleData[field]) {
                delete modified[field];
            }
        }
        modified.id = $scope.roleData.id;
        if (_.size(modified) > 1) {
            $http.post("/api/updateRole", {diff: modified, rawObject: true}).success(function (data) {
                _.extend($scope.roleData, data);
                $scope.roleJson = angular.toJson($scope.roleData, true);
                $scope.info = "更新成功";
                $timeout(function () {$scope.info = null;}, 2000);
            })
            .error(function (err) {
                $scope.error = "更新用户数据失败: " + (err.message || "未知错误");
            });
        }
    };
    $scope.boundHeroName = function (item) {
        if (item.bound) {
            var hero = _.findWhere($scope.heroes, {id: item.bound});
            if (hero) {
                return $scope.heroDefs[hero.heroDefId].name;
            }
            else {
                var it = _.findWhere($scope.items, {id: item.bound});
                if (it) {
                    return "道具: " + $scope.itemDefs[it.itemDefId].name;
                }
            }
        }
        return "无";
    };
    $scope.openAddHero = function () {
        var modalIns = $modal.open({
            templateUrl: '/templates/modalAddHero',
            controller: 'addHeroController',
            backdrop: "static",
            resolve: {
                heroDefs: function () {return $scope.heroDefs;}
            }
        });
        modalIns.result.then(function (newHeroes) {
            $http.post("/api/addHero", {role: $scope.uid, heroes: newHeroes}).success(function (data) {
                $scope.heroes = $scope.heroes.concat(data.heroes);
                $scope.heroTableParams.total($scope.heroes.length);
                $scope.heroTableParams.reload();
                $scope.hero_error = null;
            })
            .error(function (data) {
                $scope.hero_error = "添加武将失败，" + (data.message || "未知错误");
            });
        });
    };
    $scope.openAddItem = function () {
        var modalIns = $modal.open({
            templateUrl: '/templates/modalAddItem',
            controller: 'addItemController',
            backdrop: "static",
            resolve: {
                itemDefs: function () {return $scope.itemDefs;}
            }
        });
        modalIns.result.then(function (newItems) {
            $http.post("/api/addItem", {role: $scope.uid, items: newItems}).success(function (data) {
                $scope.items = $scope.items.concat(data.items);
                $scope.itemTableParams.total($scope.items.length);
                $scope.itemTableParams.reload();
                $scope.item_error = null;
            })
            .error(function (data) {
                $scope.item_error = "添加道具失败，" + (data.message || "未知错误");
            });
        });
    };

    $q.all([$http.post("/api/getRole", {uid: $scope.uid}), $http.get("/api/itemDefs"), $http.get("/api/heroDefs")])
    .then(function (results) {
        $scope.itemDefs = results[1].data.items.toMap("id");
        $scope.heroDefs = results[2].data.heroes.toMap("id");

        var roleData = results[0].data;
        $scope.roleData = roleData.role;
        $scope.roleJson = angular.toJson(roleData.role, true);
        $scope.heroes = roleData.heroes;
        $scope.items = roleData.items;
        $scope.itemTableParams.total($scope.items.length);
        $scope.heroTableParams.total($scope.heroes.length);
        $scope.itemTableParams.reload();
        $scope.heroTableParams.reload();
    })
    .catch(function (data) {
        data = data.data || data;
        $scope.error = "查看用户失败，" + (data.message || "未知错误");
    });
});

sheathControllers.controller('addHeroController', function ($scope, $modalInstance, heroDefs) {
    var format = function (item) {return item.name;};

    $scope.selectOptions = {
        width: "100%",
        multiple: true,
        tokenSeparators: [",", " "],
        data: {results: _.values(heroDefs), text: "name"},
        formatSelection: format,
        formatResult: format,
        allowDuplicates: true
    };

    $scope.ok = function () {
        $modalInstance.close(_.pluck($scope.newHeroes, "id"));
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };
});

sheathControllers.controller('addItemController', function ($scope, $modalInstance, itemDefs) {
    var format = function (item) {return item.name;};

    $scope.selectOptions = {
        width: "100%",
        multiple: true,
        tokenSeparators: [",", " "],
        data: {results: _.values(itemDefs), text: "name"},
        formatSelection: format,
        formatResult: format,
        allowDuplicates: true
    };

    $scope.ok = function () {
        $modalInstance.close(_.pluck($scope.newItems, "id"));
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };
});

sheathControllers.controller('rewardController', function ($scope, $http) {
    $scope.getRoleByHint = function (val) {
        return $http.post("/api/findRoles", {hint: val}).then(function (res) {
            return _.pluck(res.data.roles, "name");
        });
    };
});

sheathControllers.controller('partitionListController', function ($scope, $modal, $http) {
    $http.get("/api/partitions").success(function (data) {
        $scope.partitions = data.partitions;
    });

    $scope.openAdd = function () {
        var modalInstance = $modal.open({
            templateUrl: '/templates/modalAddPartition',
            controller: 'addPartitionController',
            backdrop: "static"
        });

        modalInstance.result.then(function (newPart) {
            $http.post("/api/addPartitions", newPart).success(function (data) {
                $scope.partitions.push(data);
                $scope.error = null;
            })
            .error(function (data) {
                $scope.error = "添加分区 " + newPart.name + " 失败，" + (data.message || "未知错误");
            });
        });
    };

    $scope.removePartition = function (part) {
        $http.post("/api/removePartition", {id: part.id}).success(function (data) {
            $scope.partitions = _.reject($scope.partitions, function (p) {return p.id === data.id;});
            $scope.error = null;
        })
        .error(function (data) {
            $scope.error = "删除分区 " + part.name + " 失败，" + (data.message || "未知错误");
        });
    };
});

sheathControllers.controller('addPartitionController', function ($scope, $modalInstance) {
    $scope.newPartition = {
        openSince: new Date(),
        distro: "All",
        public: true
    };

    $scope.ok = function () {
        $scope.newPartition.openSince = moment($scope.newPartition.openSince);
        $scope.newPartition.openSince.seconds(0);
        $modalInstance.close($scope.newPartition);
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };

    $scope.openDate = function($event) {
        $event.preventDefault();
        $event.stopPropagation();

        $scope.dpOpened = true;
    };
});

sheathControllers.controller('adminController', function ($scope, $http, $timeout, $modal) {
    $http.post("/api/adminList").success(function (data) {
        $scope.items = data.admins;
        $scope.select($scope.items[0]);
    })
    .error(function (data) {
        $scope.error = data.message || "未知错误";
    });

    $scope.select = function (data) {
        $scope.selected = data;
        $scope.editable = angular.copy(data);
    };

    $scope.modify = function () {
        $http.post("/api/modifyAdmin", {id: $scope.editable.id, manRole: $scope.editable.manRole}).success(function (data) {
            var stock = _.findWhere($scope.items, {id: data.id});
            if (stock) {
                _.extend(stock, data);
                $scope.select(stock);
                $scope.info = "修改成功";
                $timeout(function () {$scope.info = null;}, 2000);
            }
        })
        .error(function (data) {
            $scope.error = data.message || "未知错误";
        });
    };

    $scope.delete = function () {
        $http.post("/api/removeAdmin", {id: $scope.editable.id}).success(function () {
            $scope.items = _.reject($scope.items, function (item) {
                return item.id === $scope.editable.id;
            });
            $scope.editable = null;
            if ($scope.items.length) {
                $scope.select($scope.items[0]);
            }
        })
        .error(function (data) {
            $scope.error = data.message || "未知错误";
        });
    };

    $scope.openAdd = function () {
        var modalInstance = $modal.open({
            templateUrl: 'templates/modalAddAdmin',
            controller: 'addAdminController',
            backdrop: "static"
        });

        modalInstance.result.then(function (newAdmin) {
            $http.post("/api/addAdmin", {userId: newAdmin}).success(function (data) {
                $scope.items.push(data);
                $scope.error = null;
                $scope.select(data);
            })
            .error(function (data) {
                $scope.error = "添加管理员错误。 " + (data.message || "未知错误");
            });
        });
    };
});

sheathControllers.controller('addAdminController', function ($scope, $http, $modalInstance) {
    $scope.getUserByHint = function (val) {
        return $http.post("/api/findUsers", {hint: val, notAdmin: true}).then(function (res) {
            return res.data.users;
        });
    };

    $scope.ok = function (userId) {
        $modalInstance.close(userId);
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };
});

sheathControllers.controller('importController', function ($scope, $http, $upload, $timeout) {
    $scope.upload = function ($files, tag) {
        var file = $files[0];
        $upload.upload({
            url: "/api/import",
            data: {tag: tag},
            file: file
        })
        .success(function (data) {
            $scope.error = null;
            $scope.info = "导入成功";
            $timeout(function () {$scope.info = null;}, 2000);
        })
        .error(function (err) {
            $scope.error = "上传文件失败: " + (err.message || "未知错误");
        });
    };
});

sheathControllers.controller('exportController', function ($scope, $http) {
    $http.get("/api/itemDefs").success(function (data) {
        $scope.items = data.items;
    })
    .error(function (err) {
        $scope.item_error = "获取道具错误: " + (err.message || "未知错误");
    });

    $http.get("/api/heroDefs").success(function (data) {
        $scope.heroes = data.heroes;
    })
    .error(function (err) {
        $scope.hero_error = "获取武将错误: " + (err.message || "未知错误");
    });

    $http.get("/api/treasures").success(function (data) {
        $scope.treasures = data.treasures;
    })
    .error(function (err) {
        $scope.trea_error = "获取奖励错误: " + (err.message || "未知错误");
    });

    $http.get("/api/balls").success(function (data) {
        $scope.balls = data.balls;
    })
    .error(function (err) {
        $scope.ball_error = "获取弹道错误: " + (err.message || "未知错误");
    });

    $http.get("/api/tasks").success(function (data) {
        $scope.tasks = data.tasks;
    })
    .error(function (err) {
        $scope.task_error = "获取任务错误: " + (err.message || "未知错误");
    });
});

sheathControllers.controller('storeController', function ($scope, $http) {
});

sheathControllers.controller('eventController', function ($scope, $http) {
});

sheathControllers.controller('statsController', function ($scope, $http) {
    $scope.retentionChartConfig = {
        title: {text: "留存"},
        options: {
            tooltip: {
                style: {
                    padding: 10,
                    fontWeight: 'bold'
                }
            }
        },
        loading: true
    };
});

sheathControllers.controller('settingsController', function ($scope, $http) {
    $scope.kickAll = function () {
        $http.post("/api/kickAll");
    };

    $scope.reloadTask = function () {
        $http.post("/api/reloadTask");
    };

    $scope.broadcast = function () {
        $http.post("/api/broadcast", {content: $scope.bdConent});
    };

    $scope.chat = function () {
        $http.post("/api/chat", {content: $scope.chatContent});
    };

    $scope.sendMail = function () {
        $http.post("/api/sendMail", {role: $scope.mailRoleId, content: $scope.mailContent});
    };
});
