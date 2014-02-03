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

sheathControllers.controller('basicStatsController', function ($scope, $http, $window) {
    var refreshInterval = 8000;
    $scope.refreshInterval = refreshInterval;

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
            $scope.userStats.onlineUsers = data.onlineUser.loginedList.chunk(10);
            $scope.userStats.totalUsers = data.totalUsers;
            $scope.userStats.totalRoles = data.totalRoles;
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
            count: 50
        }, {
            counts: [],
            groupBy: "partitionName",
            getData: function($defer, params) {
                var partitions = _.pluck(_.filter($scope.partitions, function (p) {return p.selected;}), "id");
                console.log(partitions);
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

        var diff = {id: role.id};
        var fields = ["level", "energy", "golds", "coins", "contribs"];
        for (var i=0;i<fields.length;i++) {
            var field = fields[i];
            if (role[field] !== editable[field]) {
                diff[field] = editable[field];
            }
        }

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

sheathControllers.controller('userDetailController', function ($scope, $http, $routeParams, $timeout, $q) {
    $scope.uid = $routeParams.uid;
    $scope.editorParams = {
        useWrapMode : false,
        showGutter: true,
        theme:'xcode',
        mode: 'json'
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
        }
        return "无";
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
    })
    .catch(function (data) {
        data = data.data || data;
        $scope.error = "查看用户失败，" + (data.message || "未知错误");
    });
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
});

sheathControllers.controller('storeController', function ($scope, $http) {
});

sheathControllers.controller('eventController', function ($scope, $http) {
});

sheathControllers.controller('settingsController', function ($scope, $http) {
    $scope.kickAll = function () {
        $http.post("/api/kickAll");
    };

    $scope.broadcast = function () {
        $http.post("/api/broadcast");
    };

    $scope.chat = function () {
        $http.post("/api/chat");
    };
});
