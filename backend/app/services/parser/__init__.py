"""
SysML v2 Parser -- text <-> AST <-> SemanticModel bidirectional conversion.

Exports:
    SysML2Parser      -- main parser class (Lark LALR(1) wrapper)
    SysML2SyntaxError -- exception with line/column info
    ASTBuilder        -- ParseTree -> ASTNode converter
    ModelBuilder      -- ASTNode -> SemanticModel converter
    TextGenerator     -- SemanticModel -> .sysml2 text generator
"""

from .errors import SysML2SyntaxError
from .parser import SysML2Parser
from .ast_builder import ASTBuilder
from .model_builder import ModelBuilder
from .text_generator import TextGenerator

__all__ = [
    "SysML2Parser",
    "SysML2SyntaxError",
    "ASTBuilder",
    "ModelBuilder",
    "TextGenerator",
]
