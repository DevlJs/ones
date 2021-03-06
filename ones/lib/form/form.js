(function(window, ones, angular){
    'use strict';

    /**
     * ONES表单模块
     *
     * */
    angular.module("ones.formModule", [
            "ones.formFieldsModule"
        ])
        .service("ones.form.api", [function() {
            this.scope = {};
        }])
        .service("ones.form", [
            'Home.SchemaAPI',
            'ones.form_fields_factory',
            '$q',
            '$timeout',
            '$parse',
            '$routeParams',
            'RootFrameService',
            '$injector',
            'ones.form.api',
            function(schemaAPI, fields_factory, $q, $timeout, $parse, $routeParams, RootFrameService, $injector, form_api) {

                var self = this;
                this.config = {
                    app_info: ones.app_info,
                    columns : 1,
                    model_prefix: 'form_'+randomString(6)
                };

                /**
                 * 表单配置初始化
                 * */
                this.init = function($scope, config) {
                    angular.extend(this.config, config);

                    self.defer = $q.defer();

                    form_api.scope = this.scope = $scope;
                    this.parentScope = $scope.$parent;

                    this.data_model_fields = undefined;

                    // 是否是编辑表单
                    this.config.isEdit = this.config.id ? true : false;

                    this.config.form_name = this.scope.form_name = 'id_'+this.config.model_prefix;

                    this.model_config = this.config.model.config;
                    this.model_config.fields = this.model_config.fields || {};

                    angular.extend(this.config, this.model_config);

                    this.scope.edit_data_source = {};

                    this.parentScope.panel_title =
                        this.parentScope.panel_title || (
                            _('common.'+(this.config.isEdit ? 'Edit' : 'Add New')) + ' ' + _(ones.app_info.app+'.'+camelCaseSpace(this.model_config.module))
                        );

                    this.load_schema();

                    return self.defer;
                };

                /**
                 * 取得需编辑的数据
                 * */
                this.load_edit_data = function() {
                    this.config.resource.get({
                        id: this.config.id,
                        _df: this.data_model_fields
                    }).$promise.then(function(data){
                            self.scope.edit_data_source = data;
                            self.scope.$broadcast('form.dataLoaded', data);
                        });
                };


                /**
                 * 加载数据表结构
                 * */
                this.load_schema = function() {
                    var ablename = self.config.isEdit ? 'editable' : "addable";
                    schemaAPI.get_schema({
                        app: self.model_config.app,
                        table: self.model_config.table,
                        exclude_meta: true,
                        callback: function(result) {

                            result = result[self.model_config.table].structure || {};

                            if(!result) {
                                return false;
                            }

                            var schema = {};
                            angular.forEach(result, function(v) {
                                schema[v.field] = v;
                            });

                            //angular.extend(schema, self.model_config.fields);
                            angular.forEach(self.model_config.fields, function(item, field){
                                if(!(field in schema)) {
                                    schema[field] = item;
                                }
                            });

                            var fields_define = {};
                            angular.forEach(schema, function(config, field) {

                                //console.log(field, config);
                                if(field in self.model_config.fields) {
                                    config = angular.deep_extend(config, self.model_config.fields[field]);
                                }

                                if(field === '_data_model_fields_') {
                                    self.data_model_fields = config.value;
                                }

                                /**
                                 * 使用model中字段的配置覆盖schema配置
                                 * */
                                angular.deep_extend(config, self.model_config.fields ? self.model_config.fields[field] : {});


                                config.ng_model = config.ng_model ? config.ng_model : '';

                                self.model_config.fields = self.model_config.fields || {};


                                var field_config = self.model_config.fields[field] || {};

                                // label
                                if(!config.label) {
                                    config.label = _(ones.app_info.app+'.'+ camelCaseSpace(field));
                                }

                                field = field_config.map || field;

                                if(field == 'company_id') {
                                    return;
                                }

                                /**
                                 * addable, editable
                                 * */
                                if(field_config[ablename] === false
                                    || (self.model_config['un'+ablename]
                                    && self.model_config['un'+ablename].indexOf(field) >= 0)) {
                                    return;
                                }

                                /**
                                 * widget
                                 * */
                                config.widget = config.widget || 'text';
                                if(!field_config.widget) {
                                    if(['decimal', 'integer'].indexOf(config.type) >= 0) {
                                        config.widget = 'number';
                                    }
                                } else {
                                    config.widget = field_config.widget;
                                }


                                /**
                                 * ng_model
                                 * */
                                config.field_model = (config.ng_model || field_config.ng_model || field);
                                config['ng-model'] = self.config.model_prefix + '.' + config.field_model;

                                // ui event, ui.utils
                                config['ui-event'] = config['ui_event'] || undefined;

                                config['class'] = config['css_class'] || undefined;

                                config['id'] = config['id'] || self.config.model_prefix+"_"+field;
                                config['name'] = config.field_model;

                                config['required'] = config['required'] === false || config['blank'] === true ? false : 'required';

                                // 最大长度
                                config['maxlength'] = config.limit || undefined;

                                config['ensure-unique'] = config.ensureUnique || config['ensure-unique'] || undefined;

                                fields_define[field] = config;
                            });

                            // 扩展字段
                            if($routeParams.extra) {
                                var extra = parse_arguments($routeParams.extra);
                                angular.forEach(extra, function(value, field) {
                                    if(field in fields_define) {
                                        return;
                                    }

                                    fields_define[field] = {
                                        'ng-model': self.config.model_prefix + '.' + field,
                                        id: self.config.model_prefix+"_"+field,
                                        required: false,
                                        value: value,
                                        name: field,
                                        widget: 'hidden'
                                    };
                                });
                            }

                            /**
                             * 编辑模式取得数据
                             * */
                            if(self.config.isEdit) {
                                self.load_edit_data();
                            };


                            // 修改源数据
                            self.scope.$watch('edit_data_source', function(data) {
                                if(!data) return;
                                format_data_form_rest(data, fields_define, self.scope, $parse);
                            });

                            /*
                             * 扩展操作
                             * */
                            var ext_method = self.config.isEdit ? 'on_edit' : 'on_add';
                            if(typeof self.config.model[ext_method] === 'function') {
                                self.config.model[ext_method]({
                                    scope: self.scope,
                                    extra_params: self.config.opts.extra_params || {},
                                    config: self.config,
                                    fields_define: fields_define
                                });
                            }

                            /**
                             * 拼接最终HTML
                             * */
                            var html = sprintf(FORM_CONTAINER_TPL, {
                                form_name: self.config.form_name,
                                form_class: self.model_config.form_class || '',
                                html: fields_factory.make_fields(self.scope, fields_define, self.config)
                            });

                            self.defer.resolve(html);

                            self.makeSubmitAction(fields_define);
                         }
                    });
                };



                this.makeSubmitAction = function(fields_define) {

                    /**
                     * 提交
                     * @todo 覆盖默认方法
                     * */
                    self.parentScope.doFormSubmit = function() {
                        var form = self.scope[self.config.form_name];

                        if(!form.$valid) {
                            angular.forEach(form, function(v, k) {
                                if(k[0] == '$') {
                                    return;
                                }
                                if(!v.$valid) {
                                    v.$setDirty(true);
                                }
                            });

                            RootFrameService.alert(_('common.Please fill out the form correctly'));
                            return;
                        }

                        var callback = function(response_data) {

                            // message center
                            if(is_app_loaded('messageCenter')) {
                                var mc = $injector.get('ones.MessageCenter');
                                mc.emit('some_data_changed', {
                                    sign_id: ones.caches.getItem('company_sign_id'),
                                    user_id: ones.user_info.id,
                                    app: ones.app_info.app,
                                    module: ones.app_info.module
                                });
                            }


                            if(!response_data.error && !response_data.msg) {
                                RootFrameService.alert({
                                    type: 'success',
                                    content: _('common.Operation Success')
                                });
                            }

                            RootFrameService.close();
                        };
                        var get_params = self.config.isEdit ? {id: self.config.id} : {};
                        angular.extend(get_params, self.config.opts && self.config.opts.extra_params || {});

                        var data = angular.copy(self.scope[self.config.model_prefix]) || {};

                        //console.log(self.scope[self.config.model_prefix]);
                        data = post_data_format(data, fields_define, $injector);
                        //console.log(data);return;

                        //console.log(data); return;
                        //.toISOString().slice(0, 19).replace('T', ' ');
                        if(self.config.isEdit) {
                            self.config.resource.update(get_params, data).$promise.then(callback);
                        } else {
                            self.config.resource.save(get_params, data).$promise.then(callback);
                        }

                    };

                }
            }
        ])
        .directive('formView', [
            "$compile",
            "$timeout",
            "ones.form",
            "$filter",
            function($compile, $timeout, form, $filter){
                return {
                    restrict: "E",
                    replace: true,
                    transclusion: true,
                    scope: {
                        config: "="
                    },
                    compile: function(element, attrs, transclude) {
                        return {
                            pre: function ($scope, iElement, iAttrs, controller) {
                                form.init($scope, $scope.config).promise.then(function(html){
                                    angular.element(element).append($compile(html)($scope));
                                });
                            }
                        };
                    }
                };
            }
        ])

    ;

})(window, window.ones, window.angular);