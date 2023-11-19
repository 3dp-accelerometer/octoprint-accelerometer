from typing import Any, Dict, List, Literal, Callable, Optional

import flask
import octoprint.plugin
from octoprint.server.util.flask import OctoPrintFlaskRequest
from py3dpaxxel.cli.args import convert_axis_from_str
from py3dpaxxel.controller.api import Py3dpAxxel
from py3dpaxxel.sampling_tasks.series_argument_generator import RunArgsGenerator

from octoprint_accelerometer.record_step_series import RecordStepSeriesRunner


class Point3D:
    def __init__(self, x: int, y: int, z: int):
        self.x: int = x
        self.y: int = y
        self.z: int = z

    def __str__(self):
        return f"x={self.x} y={self.y} z={self.z}"


class OctoprintAccelerometerPlugin(octoprint.plugin.StartupPlugin,
                                   octoprint.plugin.SettingsPlugin,
                                   octoprint.plugin.AssetPlugin,
                                   octoprint.plugin.TemplatePlugin,
                                   octoprint.plugin.SimpleApiPlugin):
    OUTPUT_FILE_NAME_PREFIX: str = "axxel"

    # noinspection PyMissingConstructor
    def __init__(self):
        # following parameters are shared among settings and UI
        self.distance_x_mm: int = 0
        self.distance_y_mm: int = 0
        self.distance_z_mm: int = 0
        self.step_count: int = 0
        self.speed_x_mm_s: int = 0
        self.speed_y_mm_s: int = 0
        self.speed_z_mm_s: int = 0
        self.acceleration_x_mm_ss: int = 0
        self.acceleration_y_mm_ss: int = 0
        self.acceleration_z_mm_ss: int = 0
        self.anchor_point_coord_x_mm: int = 0
        self.anchor_point_coord_y_mm: int = 0
        self.anchor_point_coord_z_mm: int = 0
        self.sequence_count: int = 0
        self.go_start: bool = False
        self.return_start: bool = False
        self.auto_home: bool = False
        self.frequency_start: int = 0
        self.frequency_stop: int = 0
        self.frequency_step: int = 0
        self.zeta_start: int = 0
        self.zeta_stop: int = 0
        self.zeta_step: int = 0
        self.sensor_output_data_rate_hz: int = 0
        self.data_remove_before_run: bool = False
        self.do_sample_x: bool = False
        self.do_sample_y: bool = False
        self.do_sample_z: bool = False
        self.recording_timespan_s: float = 0
        self.sequence_separation_s: float = 0
        self.step_separation_s: float = 0
        self.do_dry_run: bool = False

        # other parameters shared with UI

        self.devices_seen: List[str] = []
        self.device: str = ""
        self.controller_fifo_overrun_error: bool = False
        self.controller_response_error: bool = False

        # following parameters are computed from above parameters

        self.axis_x_sampling_start: Point3D = Point3D(0, 0, 0)
        self.axis_y_sampling_start: Point3D = Point3D(0, 0, 0)
        self.axis_z_sampling_start: Point3D = Point3D(0, 0, 0)

        # recording runner: once constructed before invocation all properties shall be updated
        self.runner: Optional[RecordStepSeriesRunner] = None

    @staticmethod
    def get_devices() -> List[str]:
        return [k for k in Py3dpAxxel.get_devices_dict().keys()]

    @staticmethod
    def choose_device() -> str:
        devices = OctoprintAccelerometerPlugin.get_devices()
        return devices[0] if len(devices) > 0 else ""

    def get_api_commands(self):
        return dict(
            set_values=[],
            start_recording=[],
            abort_recording=[],
            start_data_processing=[])

    def on_api_command(self, command, data):
        if command == "set_values":
            self._update_members_from_api(data)
        elif command == "start_recording":
            self._start_recording()
        elif command == "abort_recording":
            self._abort_recording()
        elif command == "start_data_processing":
            self._start_data_processing()

    def on_api_get(self, request: OctoPrintFlaskRequest):
        known_args: Dict[str, Dict[str, Callable[[Dict[str, str]], Any]]] = {
            "q": {
                "estimate": self._estimate_duration,
                "parameters": self._get_parameter_dict,
            }}

        for argument, value in request.args.items():
            if argument in known_args.keys():
                if value in known_args[argument]:
                    return flask.jsonify({f"{value}": known_args[argument][value](request.args)})

        return flask.jsonify(known_requests=[(k, [k for k in v.keys()]) for k, v in known_args.items()])

    def get_template_vars(self):
        return dict(estimated_duration_s=self._estimate_duration())

    def get_template_configs(self):
        return [dict(type="settings", custom_bindings=True),
                dict(type="tab", custom_bindings=True)]

    def get_settings_defaults(self):
        profile: Dict[str, Any] = self._printer_profile_manager.get_current_or_default()
        width = profile["volume"]["width"]
        height = profile["volume"]["height"]
        depth = profile["volume"]["depth"]
        origin_center: bool = True if profile["volume"]["origin"] == "center" else False
        anchor_point = Point3D(0, 0, 50) if origin_center else Point3D(int(width // 2), int(depth // 2), int(height // 2))

        return dict(
            distance_x_mm=10,
            distance_y_mm=10,
            distance_z_mm=10,
            step_count=2,
            speed_x_mm_s=100,
            speed_y_mm_s=100,
            speed_z_mm_s=100,
            acceleration_x_mm_ss=1000,
            acceleration_y_mm_ss=1000,
            acceleration_z_mm_ss=1000,
            anchor_point_coord_x_mm=anchor_point.x,
            anchor_point_coord_y_mm=anchor_point.y,
            anchor_point_coord_z_mm=anchor_point.z,
            sequence_count=1,
            go_start=True,
            return_start=True,
            auto_home=True,
            frequency_start=10,
            frequency_stop=60,
            frequency_step=10,
            zeta_start=15,
            zeta_stop=15,
            zeta_step=5,
            sensor_output_data_rate_hz=800,
            data_remove_before_run=True,
            do_sample_x=True,
            do_sample_y=False,
            do_sample_z=False,
            recording_timespan_s=1.5,
            sequence_separation_s=0.1,
            step_separation_s=0.1,
            do_dry_run=False,
        )

    def on_settings_save(self, data):
        octoprint.plugin.SettingsPlugin.on_settings_save(self, data)
        self._update_members_from_settings()

    def on_after_startup(self):
        self._update_members_from_settings()
        self.devices_seen = self.get_devices()
        self.device = self.choose_device()
        self.runner = self._construct_new_step_series_runner()

    def get_assets(self):
        return {"js": ["js/octoprint_accelerometer.js"]}

    def get_update_information(self):
        # see https://docs.octoprint.org/en/master/bundledplugins/softwareupdate.html
        return {
            "octoprint_accelerometer": {
                "displayName": "Octoprint Accelerometer",
                "displayVersion": self._plugin_version,

                # version check: GitHub repository
                "type": "github_release",
                "user": "rubienr",
                "repo": "https://github.com/3dp-accelerometer/octoprint-accelerometer",
                "current": self._plugin_version,

                # update method: pip
                "pip": "https://github.com/3dp-accelerometer/octoprint-accelerometer/archive/{target_version}.zip",
            }
        }

    @staticmethod
    def _get_ui_exposed_parameters() -> List[str]:
        return ["distance_x_mm", "distance_y_mm", "distance_z_mm",
                "step_count",
                "speed_x_mm_s", "speed_y_mm_s", "speed_z_mm_s",
                "acceleration_x_mm_ss", "acceleration_y_mm_ss", "acceleration_z_mm_ss",
                "anchor_point_coord_x_mm", "anchor_point_coord_y_mm", "anchor_point_coord_z_mm",
                "sequence_count",
                "go_start", "return_start", "auto_home",
                "frequency_start", "frequency_stop", "frequency_step",
                "zeta_start", "zeta_stop", "zeta_step",
                "sensor_output_data_rate_hz",
                "data_remove_before_run",
                "do_sample_x", "do_sample_y", "do_sample_z",
                "recording_timespan_s", "sequence_separation_s", "step_separation_s",
                "devices_seen", "device", "do_dry_run"]

    def _update_member_from_str_value(self, parameter: str, value: str):
        if parameter in self._get_ui_exposed_parameters():
            old_value = getattr(self, parameter)
            value_type = type(old_value)
            setattr(self, parameter, value_type(value))
            new_value = getattr(self, parameter)
            self._logger.debug(f"xxx update {parameter}: {old_value} -> {new_value} from api")

    def _update_members_from_api(self, data: Dict[str, str]):
        for k, v in data.items():
            if hasattr(self, k):
                self._update_member_from_str_value(k, v)
        self._compute_start_points()

    def _update_members_from_settings(self) -> None:
        self._logger.debug("xxx update from settings ...")
        self.distance_x_mm = self._settings.get_int(["distance_x_mm"])
        self.distance_y_mm = self._settings.get_int(["distance_y_mm"])
        self.distance_z_mm = self._settings.get_int(["distance_z_mm"])
        self.step_count = self._settings.get_int(["step_count"])
        self.speed_x_mm_s = self._settings.get_int(["speed_x_mm_s"])
        self.speed_y_mm_s = self._settings.get_int(["speed_y_mm_s"])
        self.speed_z_mm_s = self._settings.get_int(["speed_z_mm_s"])
        self.acceleration_x_mm_ss = self._settings.get_int(["acceleration_x_mm_ss"])
        self.acceleration_y_mm_ss = self._settings.get_int(["acceleration_y_mm_ss"])
        self.acceleration_z_mm_ss = self._settings.get_int(["acceleration_z_mm_ss"])
        self.anchor_point_coord_x_mm = self._settings.get_int(["anchor_point_coord_x_mm"])
        self.anchor_point_coord_y_mm = self._settings.get_int(["anchor_point_coord_y_mm"])
        self.anchor_point_coord_z_mm = self._settings.get_int(["anchor_point_coord_z_mm"])
        self.sequence_count = self._settings.get_int(["sequence_count"])
        self.go_start = self._settings.get_boolean(["go_start"])
        self.return_start = self._settings.get_boolean(["return_start"])
        self.auto_home = self._settings.get_boolean(["auto_home"])
        self.frequency_start = self._settings.get_int(["frequency_start"])
        self.frequency_stop = self._settings.get_int(["frequency_stop"])
        self.frequency_step = self._settings.get_int(["frequency_step"])
        self.zeta_start = self._settings.get_int(["zeta_start"])
        self.zeta_stop = self._settings.get_int(["zeta_stop"])
        self.zeta_step = self._settings.get_int(["zeta_step"])
        self.sensor_output_data_rate_hz = self._settings.get_int(["sensor_output_data_rate_hz"])
        self.data_remove_before_run = self._settings.get_boolean(["data_remove_before_run"])
        self.do_sample_x = self._settings.get_boolean(["do_sample_x"])
        self.do_sample_y = self._settings.get_boolean(["do_sample_y"])
        self.do_sample_z = self._settings.get_boolean(["do_sample_z"])
        self.recording_timespan_s = self._settings.get_float(["recording_timespan_s"])
        self.sequence_separation_s = self._settings.get_float(["sequence_separation_s"])
        self.step_separation_s = self._settings.get_float(["step_separation_s"])
        self.do_dry_run = self._settings.get_float(["do_dry_run"])

        self._compute_start_points()

    def _compute_start_points(self) -> None:
        self.axis_x_sampling_start = Point3D(self.anchor_point_coord_x_mm - int(self.distance_x_mm // 2),
                                             self.anchor_point_coord_y_mm,
                                             self.anchor_point_coord_z_mm)
        self.axis_y_sampling_start = Point3D(self.anchor_point_coord_x_mm,
                                             self.anchor_point_coord_y_mm - int(self.distance_y_mm // 2),
                                             self.anchor_point_coord_z_mm)
        self.axis_z_sampling_start = Point3D(self.anchor_point_coord_x_mm,
                                             self.anchor_point_coord_y_mm,
                                             self.anchor_point_coord_z_mm + int(self.distance_z_mm // 2))

    def _estimate_duration(self, _args: Dict[str, str] = None) -> float:
        axs: List[Literal["x", "y", "z"]] = [ax for ax, enabled in [("x", self.do_sample_x), ("y", self.do_sample_y), ("z", self.do_sample_z)] if enabled]
        sequences_count = len(RunArgsGenerator(
            sequence_repeat_count=self.sequence_count,
            fx_start=self.frequency_start,
            fx_stop=self.frequency_stop,
            fx_step=self.frequency_step,
            zeta_start=self.zeta_start,
            zeta_stop=self.zeta_stop,
            zeta_step=self.zeta_step,
            axis=axs,
            out_file_prefix="").generate())

        duration_s = (sequences_count * self.recording_timespan_s +
                      (sequences_count - 1) * self.sequence_separation_s +
                      (self.step_count - 1) * sequences_count * self.step_separation_s)
        return duration_s

    def _get_parameter_dict(self, args: Dict[str, str] = None) -> Dict[str, str]:
        key_name: str = "v"
        requested_values: List[str] = []
        if args and key_name in args.keys() and args[key_name] is not None:
            requested_values.extend(args[key_name].split(","))

        # reply all parameters if no names were explicitly specified
        requested_values = self._get_ui_exposed_parameters() if len(requested_values) == 0 else requested_values

        params_dict: Dict[str, str] = dict()
        exposed_parameters = self._get_ui_exposed_parameters()

        for parameter_name in [pn for pn in requested_values if pn in exposed_parameters]:
            params_dict[parameter_name] = getattr(self, parameter_name)
        self._logger.debug(f"xxx supply with requested parameters: {params_dict}")
        return params_dict

    def _get_selected_axis_str(self) -> List[Literal["x", "y", "z"]]:
        return convert_axis_from_str(
            "" + "x" if self.do_sample_x else "" + "y" if self.do_sample_y else "" + "z" if self.do_sample_z else "")

    def _construct_new_step_series_runner(self) -> RecordStepSeriesRunner:
        return RecordStepSeriesRunner(
            logger=self._logger,
            printer=self._printer,
            controller_serial_device=self.device,
            controller_record_timelapse_s=self.recording_timespan_s,
            controller_decode_timeout_s=10.0,  # todo: either configurable or pull out from here
            sensor_odr_hz=self.sensor_output_data_rate_hz,
            gcode_start_point_mm=(self.anchor_point_coord_x_mm, self.anchor_point_coord_y_mm, self.anchor_point_coord_z_mm),
            gcode_axis=self._get_selected_axis_str(),
            gcode_distance_mm=self.distance_x_mm,
            gcode_step_count=self.step_count,
            gcode_sequence_count=self.sequence_count,
            frequency_start=self.frequency_start,
            frequency_stop=self.frequency_stop,
            frequency_step=self.frequency_step,
            zeta_start=self.zeta_start,
            zeta_stop=self.zeta_stop,
            zeta_step=self.zeta_step,
            output_file_prefix=self.OUTPUT_FILE_NAME_PREFIX,
            output_dir=self.get_plugin_data_folder(),
            do_dry_run=self.do_dry_run)

    def _start_recording(self):
        self.runner.controller_serial_device = self.device
        self.runner.controller_record_timelapse_s = self.recording_timespan_s
        self.runner.sensor_odr_hz = self.sensor_output_data_rate_hz

        # todo acceleration
        # todo speed

        self.runner.frequency_start = self.frequency_start
        self.runner.frequency_stop = self.frequency_stop
        self.runner.frequency_step = self.frequency_step

        self.runner.zeta_start = self.zeta_start
        self.runner.zeta_stop = self.zeta_stop
        self.runner.zeta_step = self.zeta_step

        self.runner.gcode_step_count = self.step_count
        self.runner.gcode_sequence_count = self.sequence_count
        self.runner.gcode_start_point_mm = (self.anchor_point_coord_x_mm, self.anchor_point_coord_y_mm, self.anchor_point_coord_z_mm)
        self.runner.gcode_axis = self._get_selected_axis_str()
        self.runner.gcode_distance_mm = self.distance_x_mm  # todo: x y z distances

        self.runner.do_dry_run = self.do_dry_run

        if not self.runner.is_running():
            self.runner.run()
        else:
            self._logger.warning("requested start recording but recording task is still running")

        # todo: receive thread event on finished

    def _abort_recording(self):
        self._logger.info("xxx abort recording stub ...")

    def _start_data_processing(self):
        self._logger.info("xxx start data processing stub ...")
