"""Where drawn bytes come from: the operating system."""

import os


class OsSource:
    def draw(self, n):
        return os.urandom(n)
