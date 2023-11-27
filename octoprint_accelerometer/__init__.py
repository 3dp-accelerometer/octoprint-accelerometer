# coding=utf-8
from __future__ import absolute_import

from octoprint_accelerometer import plugin

__plugin_pythoncompat__ = ">=3,<4"


def __plugin_load__():
    implementation: plugin.OctoprintAccelerometerPlugin = plugin.OctoprintAccelerometerPlugin()
    global __plugin_implementation__
    __plugin_implementation__ = implementation

    global __plugin_hooks__
    __plugin_hooks__ = {
        "octoprint.server.http.routes": __plugin_implementation__.route_hook,
        "octoprint.plugin.softwareupdate.check_config": implementation.get_update_information,
    }
