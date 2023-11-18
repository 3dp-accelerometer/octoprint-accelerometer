from logging import Logger
from typing import List

from octoprint.printer import PrinterInterface
from py3dpaxxel.octoprint.api import OctoApi as Py3dpAxxelOctoApi


class Py3dpAxxelOcto(Py3dpAxxelOctoApi):
    def __init__(self, printer: PrinterInterface, logger: Logger) -> None:
        self.printer = printer
        self.logger = logger

    def send_commands(self, commands: List[str]) -> int:
        self.printer.commands(commands)
        return 0
