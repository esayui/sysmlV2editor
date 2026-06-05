"""
SysML v2 Parser — Top-level API for parsing SysML v2 text.

Provides the ``SysML2Parser`` class that wraps a Lark LALR(1) parser
and offers convenience methods for:
  - ``parse(text) -> lark.Tree``
  - ``parse_to_model(text) -> SemanticModel``
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import lark
from lark import Tree

from .errors import SysML2SyntaxError
from .ast_builder import ASTBuilder
from .model_builder import ModelBuilder
from .text_generator import TextGenerator


# Path to the consolidated grammar file (relative to this file)
_GRAMMAR_DIR = Path(__file__).resolve().parent / "grammar"
_GRAMMAR_FILE = _GRAMMAR_DIR / "sysml2.lark"


class SysML2Parser:
    """SysML v2 text parser backed by a Lark LALR(1) grammar.

    Usage::

        parser = SysML2Parser()
        tree = parser.parse("part def Vehicle { attribute mass: Real; }")
        model = parser.parse_to_model("part def Vehicle { ... }")

    Raises:
        SysML2SyntaxError: On any syntax error, with line/column details.
    """

    def __init__(self, grammar_path: str | None = None):
        """Initialise the parser.

        Args:
            grammar_path: Path to a ``.lark`` grammar file.  If *None*,
                the built-in ``sysml2.lark`` is used.
        """
        path = grammar_path or str(_GRAMMAR_FILE)
        self._lark: lark.Lark = lark.Lark.open(
            path,
            parser="lalr",
            propagate_positions=True,
            maybe_placeholders=False,
        )
        self._ast_builder = ASTBuilder()
        self._model_builder = ModelBuilder()
        self._text_generator = TextGenerator()

    # ------------------------------------------------------------------
    #  Parse → Tree
    # ------------------------------------------------------------------

    def parse(self, text: str) -> Tree:
        """Parse SysML v2 text and return the raw Lark parse tree.

        Args:
            text: SysML v2 source text.

        Returns:
            A ``lark.Tree`` whose root node is ``model``.

        Raises:
            SysML2SyntaxError: When the text contains a syntax error.
        """
        try:
            return self._lark.parse(text)
        except lark.UnexpectedToken as exc:
            raise self._convert_error(exc) from exc
        except lark.UnexpectedCharacters as exc:
            raise self._convert_error(exc) from exc
        except lark.UnexpectedEOF as exc:
            raise self._convert_error(exc) from exc
        except SysML2SyntaxError:
            raise
        except Exception as exc:
            raise SysML2SyntaxError(
                message=f"Parser error: {exc}",
                line=None,
                column=None,
                context="",
            ) from exc

    # ------------------------------------------------------------------
    #  Parse → SemanticModel
    # ------------------------------------------------------------------

    def parse_to_model(self, text: str) -> dict[str, Any]:
        """Parse text and build a SemanticModel in one step.

        Equivalent to::

            tree = parser.parse(text)
            nodes = ASTBuilder().build(tree)
            model = ModelBuilder().build(nodes)

        Args:
            text: SysML v2 source text.

        Returns:
            SemanticModel dictionary (JSON-serializable).
        """
        tree = self.parse(text)
        self._ast_builder.set_source(text)
        ast_nodes = self._ast_builder.build(tree)
        return self._model_builder.build(ast_nodes)

    # ------------------------------------------------------------------
    #  SemanticModel → Text
    # ------------------------------------------------------------------

    def generate_text(self, model: dict[str, Any], format: bool = True) -> str:
        """Serialize a SemanticModel back to SysML v2 text.

        Args:
            model: SemanticModel dictionary.
            format: If True, produce indented, multi-line output.

        Returns:
            SysML v2 text string.
        """
        return self._text_generator.generate(model, format=format)

    # ------------------------------------------------------------------
    #  Error conversion
    # ------------------------------------------------------------------

    @staticmethod
    def _convert_error(exc: Exception) -> SysML2SyntaxError:
        """Map a Lark exception to a ``SysML2SyntaxError``."""
        if isinstance(exc, lark.UnexpectedToken):
            token = exc.token
            line = getattr(token, "line", None)
            column = getattr(token, "column", None)
            context = str(exc)
            # Build a more descriptive message
            expected = getattr(exc, "expected", None)
            if expected:
                msg = f"Unexpected token '{token}'. Expected one of: {', '.join(expected)}"
            else:
                msg = f"Unexpected token '{token}'"
            return SysML2SyntaxError(
                message=msg,
                line=line,
                column=column,
                context=context,
            )
        elif isinstance(exc, lark.UnexpectedCharacters):
            line = getattr(exc, "line", None)
            column = getattr(exc, "column", None)
            context = str(exc)
            allowed = getattr(exc, "allowed", None)
            if allowed:
                msg = f"No terminal matches '{exc.char}'. Expected one of: {', '.join(sorted(allowed))}"
            else:
                msg = f"Unexpected character '{exc.char}'"
            return SysML2SyntaxError(
                message=msg,
                line=line,
                column=column,
                context=context,
            )
        elif isinstance(exc, lark.UnexpectedEOF):
            expected = getattr(exc, "expected", None)
            if expected:
                msg = f"Unexpected end of file. Expected: {', '.join(expected)}"
            else:
                msg = "Unexpected end of file"
            return SysML2SyntaxError(
                message=msg,
                line=None,
                column=None,
                context=str(exc),
            )
        return SysML2SyntaxError(
            message=str(exc),
            line=None,
            column=None,
            context="",
        )
