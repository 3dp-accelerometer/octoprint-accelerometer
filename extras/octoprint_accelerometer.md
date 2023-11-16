---
layout: plugin

id: octoprint_accelerometer
title: Octoprint Accelerometer
description: OctoPrint plugin for the 3DP Accelerometer
authors:
- Raoul Rubien
license: Apache-2.0
date: 2023-11-23

homepage: https://github.com/3dp-accelerometer
source: https://github.com/3dp-accelerometer/octoprint-accelerometer
archive: https://github.com/rubienr/https://github.com/3dp-accelerometer/octoprint-accelerometer/archive/master.zip

# Set this to true if your plugin uses the dependency_links setup parameter to include
# library versions not yet published on PyPi. SHOULD ONLY BE USED IF THERE IS NO OTHER OPTION!
#follow_dependency_links: false

tags:
- accelerometer
- sensor
- input_shaping

screenshots:
- url: https://github.com/3dp-accelerometer/octoprint-accelerometer/tree/main/extras/assets/img/settings-01.png
  alt: settings overview
  caption: Settings
- url: https://github.com/3dp-accelerometer/octoprint-accelerometer/tree/main/extras/assets/img/controller-01.png
  alt: required hardware
  caption: Hardware
- url: https://github.com/3dp-accelerometer/octoprint-accelerometer/tree/main/extras/assets/img/data-flow-01.png
  alt: data flow
  caption: Data Flow

# TODO
# featuredimage: url of a featured image for your plugin, /assets/img/...

# TODO
# You only need the following if your plugin requires specific OctoPrint versions or
# specific operating systems to function - you can safely remove the whole
# "compatibility" block if this is not the case.

compatibility:

  # List of compatible versions
  #
  # A single version number will be interpretated as a minimum version requirement,
  # e.g. "1.3.1" will show the plugin as compatible to OctoPrint versions 1.3.1 and up.
  # More sophisticated version requirements can be modelled too by using PEP440
  # compatible version specifiers.
  #
  # You can also remove the whole "octoprint" block. Removing it will default to all
  # OctoPrint versions being supported.

  octoprint:
  - 1.9.0

  # List of compatible operating systems
  #
  # Valid values:
  #
  # - windows
  # - linux
  # - macos
  # - freebsd
  #
  # There are also two OS groups defined that get expanded on usage:
  #
  # - posix: linux, macos and freebsd
  # - nix: linux and freebsd
  #
  # You can also remove the whole "os" block. Removing it will default to all
  # operating systems being supported.

  os:
  - linux
  - windows
  - macos
  - freebsd

  python: ">=3,<4"

---

# OctoPrint Accelerometer
Measure your printers' resonance without printing any test object.
This plugin helps to measure the resonance for the [Input Shaping](https://marlinfw.org/docs/gcode/M593.html).

## How does it work?
OctoPrint Accelerometer uses a [microcontroller](https://github.com/3dp-accelerometer) to fetch samples from an ordinary acceleration sensor.
All the samples are then Fast Fourier transformed and plotted so that dominant frequencies can be easily spotted.
This plugin encapsulates the controller API and provides a simple UI to configure all required parameters.

The controller asserts that no sample is lost and that all samples are taken with an equidistant separation.

![controller](https://github.com/3dp-accelerometer/octoprint-accelerometer/tree/main/extras/assets/img/controller-01.png)

## Setup

1. Open the OctoPrint Web Interface
2. Open the Settings using the 🔧 (wrench) icon in the top right header
3. Open the Plugin Manager in the selection menu on the left-side
4. Click on the "+ Get More" button
5. Search for OctoPrint Accelerometer
6. Click Install on the OctoPrint Accelerometer Plugin
7. Restart OctoPrint once Installation is completed
8. The full installation guide/quickstart can be found here: [QuickStart Guide](https://github.com/3dp-accelerometer/controller)

## Configuration

Once you have successfully installed OctoPrint Accelerometer plugin,
you should configure the settings. To configure the settings:

1. Open the OctoPrint Web Interface
2. Open the Settings using the 🔧 (wrench) icon in the top right header
3. Scroll down to the Plugin Settings in selection menu on the left-side and select "Accelerometer"
4. Follow the setup guide on the official [GitHub](https://github.com/3dp-accelerometer/controller) page.

## Pictures

![](https://github.com/3dp-accelerometer/octoprint-accelerometer/tree/main/extras/assets/img/data-flow-01.png)
