# coding=utf-8
from setuptools import setup

########################################################################################################################
plugin_identifier = "octoprint_accelerometer"
plugin_package = "octoprint_accelerometer"
plugin_name = "Accelerometer"
plugin_version = "0.1.1"
plugin_description = """OctoPrint plugin for the 3DP Accelerometer (github.com/3dp-accelerometer)"""
plugin_author = "Raoul Rubien"
plugin_author_email = "rubienr@sbox.tugraz.at"
plugin_url = "https://github.com/3dp-accelerometer/octoprint-accelerometer"
plugin_license = "Apache-2.0"
plugin_requires = [
    "py3dpaxxel[data-decomposition] @ git+https://github.com/3dp-accelerometer/py3dpaxxel.git@v0.1.10",
]

# Additional package data to install for this plugin. The sub folders "templates", "static" and "translations" will
# already be installed automatically if they exist. Note that if you add something here you'll also need to update
# MANIFEST.in to match to ensure that python setup.py sdist produces a source distribution that contains all your
# files. This is sadly due to how python's setup.py works, see also http://stackoverflow.com/a/14159430/2028598
plugin_additional_data = []

# Any additional python packages you need to install with your plugin that are not contained in <plugin_package>.*
plugin_additional_packages = []

# Any python packages within <plugin_package>.* you do NOT want to install with your plugin
plugin_ignored_packages = []

# Additional parameters for the call to setuptools.setup. If your plugin wants to register additional entry points,
# define dependency links or other things like that, this is the place to go. Will be merged recursively with the
# default setup parameters as provided by octoprint_setuptools.create_plugin_setup_parameters using
# octoprint.util.dict_merge.
#
# Example:
#     plugin_requires = ["someDependency==dev"]
#     additional_setup_parameters = {"dependency_links": ["https://github.com/someUser/someRepo/archive/master.zip#egg=someDependency-dev"]}
# "python_requires": ">=3,<4" blocks installation on Python 2 systems, to prevent confused users and provide a helpful error.
# Remove it if you would like to support Python 2 as well as 3 (not recommended).
additional_setup_parameters = {"python_requires": ">=3.9,<4"}

########################################################################################################################

try:
    import octoprint_setuptools
except (Exception,):
    print(
        "Could not import OctoPrint's setuptools, are you sure you are running that under "
        "the same python installation that OctoPrint is installed under?"
    )
    import sys

    sys.exit(-1)

setup_parameters = octoprint_setuptools.create_plugin_setup_parameters(
    identifier=plugin_identifier,
    package=plugin_package,
    name=plugin_name,
    version=plugin_version,
    description=plugin_description,
    author=plugin_author,
    mail=plugin_author_email,
    url=plugin_url,
    license=plugin_license,
    requires=plugin_requires,
    additional_packages=plugin_additional_packages,
    ignored_packages=plugin_ignored_packages,
    additional_data=plugin_additional_data,
)

if len(additional_setup_parameters):
    from octoprint.util import dict_merge

    setup_parameters = dict_merge(setup_parameters, additional_setup_parameters)

setup(**setup_parameters)
