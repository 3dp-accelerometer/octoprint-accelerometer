from typing import Any, Dict

import octoprint.plugin


class Point2D:
    def __init__(self, x: int, y: int):
        self.x = x
        self.y = y

    def __str__(self):
        return f"x={self.x} y={self.y}"


class OctoprintAccelerometerPlugin(octoprint.plugin.StartupPlugin,
                                   octoprint.plugin.SettingsPlugin,
                                   octoprint.plugin.AssetPlugin,
                                   octoprint.plugin.TemplatePlugin):

    def get_template_configs(self):
        return [dict(type="settings", custom_bindings=False)]

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
            sensor_ourput_data_rate_hz=800,
            data_remove_before_run=True,
            do_sample_x=True,
            do_sample_y=True,
            do_sample_z=False,
        )

    def on_after_startup(self):
        if self._printer_profile_manager:
            profile: Dict[str, Any] = self._printer_profile_manager.get_current_or_default()
            x_width: float = profile["volume"]["width"]
            y_width: float = profile["volume"]["depth"]
            distance_mm = self._settings.get_int(["distance_mm"])

            origin_center: bool = True if profile["volume"]["origin"] == "center" else False
            anchor_point = Point2D(int(x_width // 2), int(y_width // 2)) if origin_center else Point2D(0, 0)
            start_point_x_sampling = Point2D(anchor_point.x - int(distance_mm // 2), anchor_point.y)
            start_point_y_sampling = Point2D(anchor_point.x, anchor_point.y - int(distance_mm // 2))
            self._logger.info(f"start points: "
                              f"x_sampling={{{start_point_x_sampling}}} "
                              f"y_sampling={{{start_point_y_sampling}}}")

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
