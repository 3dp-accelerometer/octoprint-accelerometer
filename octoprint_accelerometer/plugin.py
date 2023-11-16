from typing import Any, Dict, List, Literal, Callable

import flask
import octoprint.plugin
from octoprint.server.util.flask import OctoPrintFlaskRequest
from py3dpaxxel.sampling_tasks.series_argument_generator import RunArgsGenerator


class Point3D:
    def __init__(self, x: int, y: int, z: int):
        self.x = x
        self.y = y
        self.z = z

    def __str__(self):
        return f"x={self.x} y={self.y} z={self.z}"


class OctoprintAccelerometerPlugin(octoprint.plugin.StartupPlugin,
                                   octoprint.plugin.SettingsPlugin,
                                   octoprint.plugin.AssetPlugin,
                                   octoprint.plugin.TemplatePlugin,
                                   octoprint.plugin.SimpleApiPlugin):

    # noinspection PyMissingConstructor
    def __init__(self):
        self.distance_mm: int = 0
        self.repetitions_count: int = 0
        self.runs_count: int = 0
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
        self.steps_separation_s: float = 0

        self.anchor_point_x: int = 0
        self.anchor_point_y: int = 0
        self.anchor_point_z: int = 0

        self.axis_x_sampling_start: Point3D = Point3D(0, 0, 0)
        self.axis_y_sampling_start: Point3D = Point3D(0, 0, 0)
        self.axis_z_sampling_start: Point3D = Point3D(0, 0, 0)

        pass

    def get_api_commands(self):
        return dict(
            set_values=[],
            start_recording=[],
            start_data_processing=[])

    def on_api_command(self, command, data):
        if command == "set_values":
            self._update_members_from_api(data)
        elif command == "start_recording":
            self._start_recording()
        elif command == "start_data_processing":
            self._start_data_processing()

    def on_api_get(self, request: OctoPrintFlaskRequest):
        known_args: Dict[str, Dict[str, Callable[[], str]]] = {"q": {"estimate": self._estimate_duration}}

        for argument, value in request.args.items():
            if argument in known_args.keys():
                if value in known_args[argument]:
                    return flask.jsonify(estimated=known_args[argument][value]())

        return flask.jsonify(known_requests=[(k, [k for k in v.keys()]) for k, v in known_args.items()])

    def get_template_vars(self):
        return dict(estimated_duration_s=self._estimate_duration())

    def get_template_configs(self):
        return [dict(type="settings", custom_bindings=False),
                dict(type="tab", custom_bindings=True)]

    def get_settings_defaults(self):
        return dict(
            distance_mm=10,
            repetitions_count=2,
            runs_count=1,
            go_start=True,
            return_start=True,
            auto_home=True,
            frequency_start=10,
            frequency_stop=60,
            frequency_step=10,
            zeta_start=10,
            zeta_stop=60,
            zeta_step=10,
            sensor_output_data_rate_hz=800,
            data_remove_before_run=True,
            do_sample_x=True,
            do_sample_y=True,
            do_sample_z=False,
            recording_timespan_s=1.5,
            steps_separation_s=0.1,
        )

    def on_settings_save(self, data):
        octoprint.plugin.SettingsPlugin.on_settings_save(self, data)
        self._update_members_from_settings()

    def on_after_startup(self):
        self._update_members_from_settings()
        self._logger.info(f"start points: "
                          f"x_sampling={{{self.axis_x_sampling_start}}} "
                          f"y_sampling={{{self.axis_y_sampling_start}}} "
                          f"z_sampling={{{self.axis_z_sampling_start}}}")

    def get_assets(self):
        # core UI here assets
        return {
            "js": ["js/octoprint_accelerometer.js"],
            # "css": ["css/octoprint_accelerometer.css"],
            # "less": ["less/octoprint_accelerometer.less"]
        }

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

    def _update_member_from_str_value(self, parameter: str, value: str):
        self._logger.info(f"xxx update {parameter}={value} from api ...")
        if parameter in ["distance_mm", "repetitions_count", "runs_count",
                         "go_start", "return_start", "auto_home",
                         "frequency_start", "frequency_stop", "frequency_step",
                         "zeta_start", "zeta_stop", "zeta_step",
                         "sensor_output_data_rate_hz",
                         "data_remove_before_run",
                         "do_sample_x", "do_sample_y", "do_sample_z",
                         "recording_timespan_s", "steps_separation_s"]:
            old_value = getattr(self, parameter)
            value_type = type(old_value)
            setattr(self, parameter, value_type(value))
            new_value = getattr(self, parameter)
            self._logger.info(f"xxx update {parameter}: {old_value} -> {new_value} from api ... done")

    def _update_members_from_api(self, data: Dict[str, str]):
        for k, v in data.items():
            if hasattr(self, k):
                self._update_member_from_str_value(k, v)
        self._compute_start_points()

    def _update_members_from_settings(self) -> None:
        self._logger.info("xxx update from settings ...")
        self.distance_mm = self._settings.get_int(["distance_mm"])
        self.repetitions_count = self._settings.get_int(["repetitions_count"])
        self.runs_count = self._settings.get_int(["runs_count"])
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
        self.steps_separation_s = self._settings.get_float(["steps_separation_s"])

        self._compute_start_points()

    def _compute_start_points(self) -> None:
        profile: Dict[str, Any] = self._printer_profile_manager.get_current_or_default()
        width = profile["volume"]["width"]
        # height = profile["volume"]["height"]
        depth = profile["volume"]["depth"]
        distance_mm = 10

        # todo: limit check if start/end point within volume
        # todo: profile with inverted axis require inverted start/stop points an distance as well
        origin_center: bool = True if profile["volume"]["origin"] == "center" else False
        self.anchor_point = Point3D(int(width // 2), int(depth // 2), distance_mm + 20) if origin_center else Point3D(0, 0, distance_mm + 20)

        self.axis_x_sampling_start = Point3D(self.anchor_point_x - int(self.distance_mm // 2), self.anchor_point_y, self.anchor_point_z)
        self.axis_y_sampling_start = Point3D(self.anchor_point_x, self.anchor_point_y - int(self.distance_mm // 2), self.anchor_point_z)
        self.axis_z_sampling_start = Point3D(self.anchor_point_x, self.anchor_point_y, self.anchor_point_z + int(self.distance_mm // 2))

    def _estimate_duration(self) -> str:
        axs: List[Literal["x", "y"]] = [ax for ax, enabled in [("x", self.do_sample_x), ("y", self.do_sample_y)] if enabled]
        # axs: List[Literal["x", "y"]] = [ax for ax, enabled in [("x", self.do_sample_x), ("y", self.do_sample_y), ("z", self.do_sample_z)] if enabled]
        steps = RunArgsGenerator(
            runs=self.runs_count,
            fx_start=self.frequency_start,
            fx_stop=self.frequency_stop,
            fx_step=self.frequency_step,
            zeta_start=self.zeta_start,
            zeta_stop=self.zeta_stop,
            zeta_step=self.zeta_step,
            axis=axs,
            file_prefix="").generate()
        duration_s = len(steps) * len(axs) * (self.recording_timespan_s + self.steps_separation_s) * self.runs_count
        return (f"estimated gross sampling duration: {int(duration_s)}s "
                f"({len(axs)} axes * {len(steps)} steps "
                f"* ({self.recording_timespan_s}s recording + {self.steps_separation_s}s separation) "
                f"* {self.runs_count} reruns)")

    def _start_recording(self):
        self._logger.info("xxx start recording stub ....")

    def _start_data_processing(self):
        self._logger.info("xxx start data processing stub ....")
