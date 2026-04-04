# { "Depends": "py-genlayer:test" }

from genlayer import *


class HelloWorld(gl.Contract):
    message: str

    def __init__(self):
        self.message = "Hello GenLayer"

    @gl.public.view
    def get_message(self) -> str:
        return self.message

    @gl.public.write
    def set_message(self, new_message: str) -> None:
        self.message = new_message
