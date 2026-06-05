"""
Parser error types — SysML2SyntaxError with line/column/context.
"""

from dataclasses import dataclass


@dataclass
class SysML2SyntaxError(Exception):
    """Raised when SysML v2 text contains a syntax error.

    Attributes:
        message: Human-readable error description.
        line: 1-based line number where the error occurred.
        column: 1-based column number where the error occurred.
        context: The surrounding text for diagnostic display.
    """

    message: str
    line: int | None = None
    column: int | None = None
    context: str = ""

    def __str__(self) -> str:
        parts = [self.message]
        if self.line is not None:
            loc = f"line {self.line}"
            if self.column is not None:
                loc += f", column {self.column}"
            parts.append(f"at {loc}")
        if self.context:
            parts.append(f"\n{self.context}")
        return " ".join(parts)
