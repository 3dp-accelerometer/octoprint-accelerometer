/*
 * View model for Octoprint Accelerometer
 *
 * Author: Raoul Rubien
 * License: Apache-2.0
 */
$(function() {

    // ----- GET/POST API

    PLUGIN_NAME = "octoprint_accelerometer";

    function requestGet(request, optional = "") {
        return OctoPrint.simpleApiGet(PLUGIN_NAME +"?q="+ request + optional);
    };

    function requestCommandPost (command, payload) {
        return OctoPrint.simpleApiCommand(PLUGIN_NAME, command, payload);
    };

    function pluginGetEstimate() { return requestGet("estimate"); }
    function pluginGetAllParameters() { return requestGet("parameters"); }
    function pluginGetParameters(names_list) { return requestGet("parameters", "&v=" + names_list); }

    function pluginDoStartRecording() { return requestCommandPost("start_recording", {}); };
    function pluginDoAbortRecording() { return requestCommandPost("abort_recording", {}); };
    function pluginDoSetValues(values_dict) { return requestCommandPost("set_values", values_dict); };

    // ----- helper

    function secondsToReadableString(seconds) {
        minutes = Math.floor(seconds / 60);
        seconds = Number(seconds - (minutes  * 60)).toFixed(1);
        if (minutes >  0) { minutes = minutes + "m "; } else { minutes = ""; }
        if (seconds >  0) { seconds = seconds + "s"; } else { seconds = ""; }
        return minutes + seconds;
    };

    function effectiveSteps(start, stop, increment) {
        return Math.floor((stop - start) / increment);
    };

    // ----- tab view model

    function AccelerometerTabViewModel(parameters) {
        let self = this;

        self.login_state = parameters[0];
        self.access = parameters[1];
        self.settings = parameters[2];
        self.printer_state = parameters[3];

        // variables shared among plugin, settings and UI
        self.ui_estimated_recording_duration_text = ko.observable();
        self.ui_do_sample_x = ko.observable();
        self.ui_do_sample_y = ko.observable();
        self.ui_do_sample_z = ko.observable();
        self.ui_step_count = ko.observable();
        self.ui_sequence_count = ko.observable();
        self.ui_distance_x_mm = ko.observable();
        self.ui_distance_y_mm = ko.observable();
        self.ui_distance_z_mm = ko.observable();
        self.ui_speed_x_mm_s = ko.observable();
        self.ui_speed_y_mm_s = ko.observable();
        self.ui_speed_z_mm_s = ko.observable();
        self.ui_acceleration_x_mm_ss = ko.observable();
        self.ui_acceleration_y_mm_ss = ko.observable();
        self.ui_acceleration_z_mm_ss = ko.observable();
        self.ui_frequency_start = ko.observable();
        self.ui_frequency_stop = ko.observable();
        self.ui_frequency_step = ko.observable();
        self.ui_zeta_start = ko.observable();
        self.ui_zeta_stop = ko.observable();
        self.ui_zeta_step = ko.observable();
        self.ui_recording_timespan_s = ko.observable();
        self.ui_sequence_separation_s = ko.observable();
        self.ui_step_separation_s = ko.observable();
        self.ui_sensor_output_data_rate_hz = ko.observable();
        self.ui_auto_home = ko.observable();
        self.ui_go_start = ko.observable();
        self.ui_return_start = ko.observable();
        self.ui_data_remove_before_run = ko.observable();
        self.ui_do_dry_run = ko.observable();

        // variables shared among plugin and UI
        self.ui_devices_seen = ko.observable();
        self.ui_device = ko.observable();

        // variables shared with UI
        self.ui_frequency_step_total_count = ko.observable();
        self.ui_zeta_step_total_count = ko.observable();

        self.onStartupComplete = function () {
            self.plugin_settings = self.settings.settings.plugins.octoprint_accelerometer;

            // on settings changed: subscribe UI observables on their respective settings observable
            let settings_observables = [
                // observable, observable name (as in plugin; without ui_ prefix), observer
                [self.plugin_settings.do_sample_x, "do_sample_x", self.ui_do_sample_x],
                [self.plugin_settings.do_sample_y, "do_sample_y", self.ui_do_sample_y],
                [self.plugin_settings.do_sample_z, "do_sample_z", self.ui_do_sample_z],
                [self.plugin_settings.step_count, "step_count", self.ui_step_count],
                [self.plugin_settings.sequence_count, "sequence_count", self.ui_sequence_count],
                [self.plugin_settings.distance_x_mm, "distance_x_mm", self.ui_distance_x_mm],
                [self.plugin_settings.distance_y_mm, "distance_y_mm", self.ui_distance_y_mm],
                [self.plugin_settings.distance_z_mm, "distance_z_mm", self.ui_distance_z_mm],
                [self.plugin_settings.speed_x_mm_s, "speed_x_mm_s", self.ui_speed_x_mm_s],
                [self.plugin_settings.speed_y_mm_s, "speed_y_mm_s", self.ui_speed_y_mm_s],
                [self.plugin_settings.speed_z_mm_s, "speed_z_mm_s", self.ui_speed_z_mm_s],
                [self.plugin_settings.acceleration_x_mm_ss, "acceleration_x_mm_ss", self.ui_acceleration_x_mm_ss],
                [self.plugin_settings.acceleration_y_mm_ss, "acceleration_y_mm_ss", self.ui_acceleration_y_mm_ss],
                [self.plugin_settings.acceleration_z_mm_ss, "acceleration_z_mm_ss", self.ui_acceleration_z_mm_ss],
                [self.plugin_settings.frequency_start, "frequency_start", self.ui_frequency_start],
                [self.plugin_settings.frequency_stop, "frequency_stop", self.ui_frequency_stop],
                [self.plugin_settings.frequency_step, "frequency_step", self.ui_frequency_step],
                [self.plugin_settings.zeta_start, "zeta_start", self.ui_zeta_start],
                [self.plugin_settings.zeta_stop, "zeta_stop", self.ui_zeta_stop],
                [self.plugin_settings.zeta_step, "zeta_step", self.ui_zeta_step],
                [self.plugin_settings.recording_timespan_s, "recording_timespan_s", self.ui_recording_timespan_s],
                [self.plugin_settings.sequence_separation_s, "sequence_separation_s", self.ui_sequence_separation_s],
                [self.plugin_settings.step_separation_s, "step_separation_s", self.ui_step_separation_s],
                [self.plugin_settings.sensor_output_data_rate_hz, "sensor_output_data_rate_hz", self.ui_sensor_output_data_rate_hz],
                [self.plugin_settings.auto_home, "auto_home", self.ui_auto_home],
                [self.plugin_settings.go_start, "go_start", self.ui_go_start],
                [self.plugin_settings.return_start, "return_start", self.ui_return_start],
                [self.plugin_settings.data_remove_before_run, "data_remove_before_run", self.ui_data_remove_before_run],
                [self.plugin_settings.do_dry_run, "do_dry_run", self.ui_do_dry_run],
            ];

            for (let index = 0; index < settings_observables.length; ++index) {
                let observable = settings_observables[index][0];
                let observable_name = settings_observables[index][1];
                let observer = settings_observables[index][2];
                observable.subscribe(
                    function (new_value){
                        observer(new_value);
                        self.updatePluginValuesFromUi([observable_name]);
                        self.requestPluginEstimation();

                });
            }

            // on UI parameter changed: subscribe on UI observable changes and send the respective parameter update to the plugin
            let observables = [
                // observable, observable name (as in plugin, without ui_ prefix)
                [self.ui_do_sample_x, "do_sample_x"],
                [self.ui_do_sample_y, "do_sample_y"],
                [self.ui_do_sample_z, "do_sample_z"],
                [self.ui_step_count, "step_count"],
                [self.ui_sequence_count, "sequence_count"],
                [self.ui_distance_x_mm, "distance_x_mm"],
                [self.ui_distance_y_mm, "distance_y_mm"],
                [self.ui_distance_z_mm, "distance_z_mm"],
                [self.ui_speed_x_mm_s, "speed_x_mm_s"],
                [self.ui_speed_y_mm_s, "speed_y_mm_s"],
                [self.ui_speed_z_mm_s, "speed_z_mm_s"],
                [self.ui_acceleration_x_mm_ss, "acceleration_x_mm_ss"],
                [self.ui_acceleration_y_mm_ss, "acceleration_y_mm_ss"],
                [self.ui_acceleration_z_mm_ss, "acceleration_z_mm_ss"],
                [self.ui_frequency_start, "frequency_start"],
                [self.ui_frequency_stop, "frequency_stop"],
                [self.ui_frequency_step, "frequency_step"],
                [self.ui_zeta_start, "zeta_start"],
                [self.ui_zeta_stop, "zeta_stop"],
                [self.ui_zeta_step, "zeta_step"],
                [self.ui_recording_timespan_s, "recording_timespan_s"],
                [self.ui_sequence_separation_s, "sequence_separation_s"],
                [self.ui_step_separation_s, "step_separation_s"],
                [self.ui_sensor_output_data_rate_hz, "sensor_output_data_rate_hz"],
                [self.ui_auto_home, "auto_home"],
                [self.ui_go_start, "go_start"],
                [self.ui_return_start, "return_start"],
                [self.ui_data_remove_before_run, "data_remove_before_run"],
                [self.ui_do_dry_run, "do_dry_run"],
            ];

            for (let index = 0; index < observables.length; ++index) {
                let observable = observables[index][0];
                let observable_name = observables[index][1]
                observable.subscribe(function () {
                    self.updatePluginValuesFromUi([observable_name]);
                    self.requestPluginEstimation();
                });
            }

            // initially fetch data from plugin
            let getPluginData = function () {
                if (!self.login_state.hasPermission(self.access.permissions.CONNECTION)) { return; }
                self.requestPluginEstimation();
                self.requestAllParameters();
            }
            getPluginData();
        };

        self.startRecording = function () {
            if (self.printer_state.isOperational() &&
               !self.printer_state.isPrinting() &&
               !self.printer_state.isCancelling() &&
               !self.printer_state.isPausing() &&
                self.login_state.hasPermission(self.access.permissions.PRINT))
            {
                pluginDoStartRecording();
            }
        };

        self.abortRecording = function () {
            if (self.login_state.hasPermission(self.access.permissions.CONNECTION))
            {
                pluginDoAbortRecording();
            }
        };

        // ----- plugin API

        self.updatePluginValuesFromUi = function (values_list = []) {
            let all_values =
                {"do_sample_x": function () { return self.ui_do_sample_x(); },
                 "do_sample_y": function () { return self.ui_do_sample_y(); },
                 "do_sample_z": function () { return self.ui_do_sample_z(); },
                 "step_count": function () { return self.ui_step_count(); },
                 "sequence_count": function () { return self.ui_sequence_count(); },
                 "distance_x_mm": function () { return self.ui_distance_x_mm(); },
                 "distance_y_mm": function () { return self.ui_distance_y_mm(); },
                 "distance_z_mm": function () { return self.ui_distance_z_mm(); },
                 "speed_x_mm_s": function () { return self.ui_speed_x_mm_s(); },
                 "speed_y_mm_s": function () { return self.ui_speed_y_mm_s(); },
                 "speed_z_mm_s": function () { return self.ui_speed_z_mm_s(); },
                 "acceleration_x_mm_ss": function () { return self.ui_acceleration_x_mm_ss(); },
                 "acceleration_y_mm_ss": function () { return self.ui_acceleration_y_mm_ss(); },
                 "acceleration_z_mm_ss": function () { return self.ui_acceleration_z_mm_ss(); },
                 "frequency_start": function () { return self.ui_frequency_start(); },
                 "frequency_stop": function () { return self.ui_frequency_stop(); },
                 "frequency_step": function () { return self.ui_frequency_step(); },
                 "zeta_start": function () { return self.ui_zeta_start(); },
                 "zeta_stop": function () { return self.ui_zeta_stop(); },
                 "zeta_step": function () { return self.ui_zeta_step(); },
                 "recording_timespan_s": function () { return self.ui_recording_timespan_s(); },
                 "sequence_separation_s": function () { return self.ui_sequence_separation_s(); },
                 "step_separation_s": function () { return self.ui_step_separation_s(); },
                 "sensor_output_data_rate_hz": function () { return self.ui_sensor_output_data_rate_hz(); },
                 "auto_home": function () { return self.ui_auto_home(); },
                 "go_start": function () { return self.ui_go_start(); },
                 "return_start": function () { return self.ui_return_start(); },
                 "data_remove_before_run": function () { return self.ui_data_remove_before_run(); },
                 "do_dry_run": function () { return self.ui_do_dry_run(); },
                 };

            if (values_list.length == 0) { pluginDoSetValues(all_values); }
            else {
                let values_dict = {};
                for (let index = 0; index < values_list.length; ++index) {
                    let value = values_list[index];
                    values_dict[value] = all_values[value]();
                }
                pluginDoSetValues(values_dict);
            }
        };

        self.requestPluginEstimation = function () { pluginGetEstimate().done(self.updateUiFromGetResponse); };

        self.requestAllParameters = function () { pluginGetAllParameters().done(self.updateUiFromGetResponse); };

        self.updateUiFromGetResponse = function (response) {
            self.ui_frequency_step_total_count(
                effectiveSteps(self.ui_frequency_start(), self.ui_frequency_stop(), self.ui_frequency_step()));
            self.ui_zeta_step_total_count(
                effectiveSteps(self.ui_zeta_start(), self.ui_zeta_stop(), self.ui_zeta_step()));

            if (Object.hasOwn(response, "estimate")) {
                self.ui_estimated_recording_duration_text(secondsToReadableString(response.estimate));
            }

            if (Object.hasOwn(response, "parameters")) {
                let do_sample_x = response.parameters.do_sample_x;
                let do_sample_y = response.parameters.do_sample_y;
                let do_sample_z = response.parameters.do_sample_z;
                let step_count = response.parameters.step_count;
                let sequence_count = response.parameters.sequence_count;
                let distance_x_mm = response.parameters.distance_x_mm;
                let distance_y_mm = response.parameters.distance_y_mm;
                let distance_z_mm = response.parameters.distance_z_mm;
                let speed_x_mm_s = response.parameters.speed_x_mm_s;
                let speed_y_mm_s = response.parameters.speed_y_mm_s;
                let speed_z_mm_s = response.parameters.speed_z_mm_s;
                let acceleration_x_mm_ss = response.parameters.acceleration_x_mm_ss;
                let acceleration_y_mm_ss = response.parameters.acceleration_y_mm_ss;
                let acceleration_z_mm_ss = response.parameters.acceleration_z_mm_ss;
                let frequency_start = response.parameters.frequency_start;
                let frequency_stop = response.parameters.frequency_stop;
                let frequency_step = response.parameters.frequency_step;
                let zeta_start = response.parameters.zeta_start;
                let zeta_stop = response.parameters.zeta_stop;
                let zeta_step = response.parameters.zeta_step;
                let recording_timespan_s = response.parameters.recording_timespan_s;
                let sequence_separation_s = response.parameters.sequence_separation_s;
                let step_separation_s = response.parameters.step_separation_s;
                let devices_seen = response.parameters.devices_seen;
                let device = response.parameters.device;
                let auto_home = response.parameters.auto_home;
                let go_start = response.parameters.go_start;
                let return_start = response.parameters.return_start;
                let data_remove_before_run = response.parameters.data_remove_before_run;
                let do_dry_run = response.parameters.do_dry_run;

                if (do_sample_x) { self.ui_do_sample_x(do_sample_x); }
                if (do_sample_y) { self.ui_do_sample_y(do_sample_y); }
                if (do_sample_z) { self.ui_do_sample_z(do_sample_z); }
                if (step_count) { self.ui_step_count(step_count); }
                if (sequence_count) { self.ui_sequence_count(sequence_count); }
                if (distance_x_mm) { self.ui_distance_x_mm(distance_x_mm); }
                if (distance_y_mm) { self.ui_distance_y_mm(distance_y_mm); }
                if (distance_z_mm) { self.ui_distance_z_mm(distance_z_mm); }
                if (speed_x_mm_s) { self.ui_speed_x_mm_s(speed_x_mm_s); }
                if (speed_y_mm_s) { self.ui_speed_y_mm_s(speed_y_mm_s); }
                if (speed_z_mm_s) { self.ui_speed_z_mm_s(speed_z_mm_s); }
                if (acceleration_x_mm_ss) { self.ui_acceleration_x_mm_ss(acceleration_x_mm_ss); }
                if (acceleration_y_mm_ss) { self.ui_acceleration_y_mm_ss(acceleration_y_mm_ss); }
                if (acceleration_z_mm_ss) { self.ui_acceleration_z_mm_ss(acceleration_z_mm_ss); }
                if (frequency_start) { self.ui_frequency_start(frequency_start); }
                if (frequency_stop) { self.ui_frequency_stop(frequency_stop); }
                if (frequency_step) { self.ui_frequency_step(frequency_step); }
                if (zeta_start) { self.ui_zeta_start(zeta_start); }
                if (zeta_stop) { self.ui_zeta_stop(zeta_stop); }
                if (zeta_step) { self.ui_zeta_step(zeta_step); }
                if (recording_timespan_s) { self.ui_recording_timespan_s(recording_timespan_s); }
                if (sequence_separation_s) { self.ui_sequence_separation_s(sequence_separation_s); }
                if (step_separation_s) { self.ui_step_separation_s(step_separation_s); }
                if (auto_home) { self.ui_auto_home(auto_home); }
                if (go_start) { self.ui_go_start(go_start); }
                if (return_start) { self.ui_return_start(return_start); }
                if (data_remove_before_run) { self.ui_data_remove_before_run(data_remove_before_run); }
                if (do_dry_run) { self.ui_do_dry_run(do_dry_run); }
                if (devices_seen) { self.ui_devices_seen(devices_seen); } else { self.ui_devices_seen([]); }
                if (device) { self.ui_device(device); } else { self.ui_device("-"); }
            }
        };

    };

    // ----- settings view model

    function AccelerometerSettingsViewModel(parameters) {
        let self = this;

        self.settings_view_model = parameters[0];

        self.ui_frequency_step_total_count = ko.observable();
        self.ui_zeta_step_total_count = ko.observable();
        self.ui_estimated_recording_duration_text = ko.observable();

        self.requestPluginEstimation = function () { pluginGetEstimate().done(self.updateUiFromGetResponse); };

        self.updateUiFromGetResponse = function (response) {
            if (Object.hasOwn(response, "estimate")) {
                self.ui_estimated_recording_duration_text(secondsToReadableString(response.estimate));
            }
        };

        self.onStartupComplete = function () {
            let updateFrequencySteps = function () {
                self.ui_frequency_step_total_count(
                    effectiveSteps(
                    self.settings_view_model.settings.plugins.octoprint_accelerometer.frequency_start(),
                    self.settings_view_model.settings.plugins.octoprint_accelerometer.frequency_stop(),
                    self.settings_view_model.settings.plugins.octoprint_accelerometer.frequency_step()));
            };

            let updateZetaSteps = function () {
                self.ui_zeta_step_total_count(
                    effectiveSteps(
                        self.settings_view_model.settings.plugins.octoprint_accelerometer.zeta_start(),
                        self.settings_view_model.settings.plugins.octoprint_accelerometer.zeta_stop(),
                        self.settings_view_model.settings.plugins.octoprint_accelerometer.zeta_step()));
            };

            self.settings_view_model.settings.plugins.octoprint_accelerometer.frequency_start.subscribe(
                function() { updateFrequencySteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.frequency_stop.subscribe(
                function() { updateFrequencySteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.frequency_step.subscribe(
                function() { updateFrequencySteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.zeta_start.subscribe(
                function() { updateZetaSteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.zeta_stop.subscribe(
                function() { updateZetaSteps(); self.requestPluginEstimation(); });
            self.settings_view_model.settings.plugins.octoprint_accelerometer.zeta_step.subscribe(
                function() { updateZetaSteps(); self.requestPluginEstimation(); });

            self.settings_view_model.settings.plugins.octoprint_accelerometer.do_sample_x.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.do_sample_y.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.do_sample_z.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.recording_timespan_s.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.sequence_separation_s.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.step_separation_s.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.sequence_count.subscribe(self.requestPluginEstimation);
            self.settings_view_model.settings.plugins.octoprint_accelerometer.step_count.subscribe(self.requestPluginEstimation);

            self.requestPluginEstimation();
            updateFrequencySteps();
            updateZetaSteps();
        };
    };

    // ----- register view models

    OCTOPRINT_VIEWMODELS.push({
        construct: AccelerometerTabViewModel,
        name: "accelerometerTabViewModel",
        dependencies: ["loginStateViewModel",
                       "accessViewModel",
                       "settingsViewModel",
                       "printerStateViewModel"],
        elements: ["#tab_plugin_octoprint_accelerometer"]
    });

    OCTOPRINT_VIEWMODELS.push({
        construct: AccelerometerSettingsViewModel,
        name: "accelerometerSettingsViewModel",
        dependencies: ["settingsViewModel"],
        elements: ["#settings_plugin_octoprint_accelerometer"]
    });
});
