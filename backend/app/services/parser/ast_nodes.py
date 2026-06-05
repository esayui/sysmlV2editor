"""
AST node dataclasses for the SysML v2 parser.

Each node corresponds to a SysML v2 language construct.  All nodes
inherit from ``ASTNode`` which carries an optional ``SourceLocation``.

Reference: detailed-design.md §4.1.5
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# =============================================================================
#  Source Location
# =============================================================================


@dataclass
class SourceLocation:
    """1-based line/column range in the source text."""

    line: int
    column: int
    end_line: int
    end_column: int


# =============================================================================
#  Base Node
# =============================================================================


class ASTNode:
    """Base class for all AST nodes.

    Not a dataclass so that child dataclasses can have required fields
    without MRO field-ordering conflicts.  The ``location`` attribute is
    set separately after construction (see ``ast_builder._set_loc``).
    """

    location: Optional[SourceLocation] = None


# =============================================================================
#  Organisation
# =============================================================================


@dataclass
class PackageDecl(ASTNode):
    name: str
    members: list[ASTNode] = field(default_factory=list)


# =============================================================================
#  Structure — Definitions
# =============================================================================


@dataclass
class PartDef(ASTNode):
    name: str
    short_name: Optional[str] = None
    supertypes: list[str] = field(default_factory=list)
    features: list[ASTNode] = field(default_factory=list)
    body: list[ASTNode] = field(default_factory=list)


@dataclass
class ItemDef(ASTNode):
    name: str
    short_name: Optional[str] = None
    supertypes: list[str] = field(default_factory=list)
    features: list[ASTNode] = field(default_factory=list)
    body: list[ASTNode] = field(default_factory=list)


@dataclass
class PortDef(ASTNode):
    name: str
    direction: str = ""  # 'in' | 'out' | 'inout' | '' (no direction)
    type_ref: Optional[str] = None
    features: list[ASTNode] = field(default_factory=list)


@dataclass
class InterfaceDef(ASTNode):
    name: str
    short_name: Optional[str] = None
    supertypes: list[str] = field(default_factory=list)
    features: list[ASTNode] = field(default_factory=list)


@dataclass
class AttributeDef(ASTNode):
    name: str
    type_ref: Optional[str] = None
    multiplicity: Optional[str] = None
    default_value: Optional[str] = None


@dataclass
class EnumerationDef(ASTNode):
    name: str
    supertypes: list[str] = field(default_factory=list)
    features: list[ASTNode] = field(default_factory=list)


# =============================================================================
#  Structure — Usages
# =============================================================================


@dataclass
class PartUsage(ASTNode):
    name: str
    definition_ref: str = ""  # qualified name of the referenced PartDef
    features: list[ASTNode] = field(default_factory=list)


@dataclass
class ItemUsage(ASTNode):
    name: str
    definition_ref: str = ""
    features: list[ASTNode] = field(default_factory=list)


@dataclass
class PortUsage(ASTNode):
    name: str
    definition_ref: str = ""
    features: list[ASTNode] = field(default_factory=list)


@dataclass
class InterfaceUsage(ASTNode):
    name: str
    definition_ref: str = ""
    features: list[ASTNode] = field(default_factory=list)


# =============================================================================
#  Behaviour — Definitions
# =============================================================================


@dataclass
class ActionDef(ASTNode):
    name: str
    supertypes: list[str] = field(default_factory=list)
    features: list[ASTNode] = field(default_factory=list)


@dataclass
class ActionUsage(ASTNode):
    name: str
    definition_ref: str = ""
    features: list[ASTNode] = field(default_factory=list)


@dataclass
class StateDef(ASTNode):
    name: str
    supertypes: list[str] = field(default_factory=list)
    features: list[ASTNode] = field(default_factory=list)


@dataclass
class StateUsage(ASTNode):
    name: str
    definition_ref: str = ""
    features: list[ASTNode] = field(default_factory=list)


@dataclass
class TransitionDef(ASTNode):
    name: Optional[str] = None
    source: str = ""  # qualified name
    target: str = ""  # qualified name


@dataclass
class ActorDef(ASTNode):
    name: str
    supertypes: list[str] = field(default_factory=list)
    features: list[ASTNode] = field(default_factory=list)


@dataclass
class UseCaseDef(ASTNode):
    name: str
    supertypes: list[str] = field(default_factory=list)
    features: list[ASTNode] = field(default_factory=list)


# =============================================================================
#  Requirement — Definitions & Usages
# =============================================================================


@dataclass
class RequirementDef(ASTNode):
    name: str
    requirement_id: Optional[str] = None
    text: str = ""
    attributes: dict[str, str] = field(default_factory=dict)
    features: list[ASTNode] = field(default_factory=list)


@dataclass
class RequirementUsage(ASTNode):
    name: str
    definition_ref: str = ""
    features: list[ASTNode] = field(default_factory=list)


@dataclass
class StakeholderRequirementDef(ASTNode):
    name: str
    requirement_id: Optional[str] = None
    text: str = ""
    attributes: dict[str, str] = field(default_factory=dict)


# =============================================================================
#  Constraint — Definitions & Usages
# =============================================================================


@dataclass
class ConstraintDef(ASTNode):
    name: str
    parameters: list[dict] = field(default_factory=list)
    expression: str = ""


@dataclass
class ConstraintUsage(ASTNode):
    name: str
    definition_ref: str = ""
    features: list[ASTNode] = field(default_factory=list)


# =============================================================================
#  Relationships
# =============================================================================


@dataclass
class ConnectionDef(ASTNode):
    name: Optional[str] = None
    source: str = ""  # qualified name
    target: str = ""  # qualified name
    connection_type: str = "Connection"


@dataclass
class BindingDef(ASTNode):
    name: Optional[str] = None
    source: str = ""
    target: str = ""
    connection_type: str = "Binding"


@dataclass
class FlowDef(ASTNode):
    name: Optional[str] = None
    source: str = ""
    target: str = ""
    connection_type: str = "Flow"


@dataclass
class SatisfyRelation(ASTNode):
    source: str = ""  # qualified name of the claim/satisfying element
    target: str = ""  # qualified name of the requirement


@dataclass
class VerifyRelation(ASTNode):
    source: str = ""
    target: str = ""


@dataclass
class Subclassification(ASTNode):
    subtype: str = ""
    supertype: str = ""


@dataclass
class Allocation(ASTNode):
    source: str = ""
    target: str = ""


# =============================================================================
#  Misc
# =============================================================================


@dataclass
class CommentNode(ASTNode):
    name: Optional[str] = None
    body: str = ""


@dataclass
class PackageMember(ASTNode):
    """Wrapper for top-level members that may appear in a model/package."""

    element: ASTNode
