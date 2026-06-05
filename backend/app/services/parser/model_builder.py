"""
Model Builder — Converts a list of ASTNodes into a SemanticModel dictionary.

The SemanticModel is the standard internal representation (JSON-serializable)
defined in detailed-design.md §5.1.

Key responsibilities:
- Assign UUIDs to every element and relationship.
- Compute qualified names by recursing through parent namespaces.
- Resolve owner references based on AST containment.
- Distinguish elements (definitions, usages) from relationships.
"""

from __future__ import annotations

import uuid
from typing import Any

from .ast_nodes import (
    ASTNode,
    PackageDecl,
    PartDef,
    ItemDef,
    PortDef,
    InterfaceDef,
    AttributeDef,
    EnumerationDef,
    ActionDef,
    ActionUsage,
    StateDef,
    StateUsage,
    TransitionDef,
    ActorDef,
    UseCaseDef,
    RequirementDef,
    RequirementUsage,
    StakeholderRequirementDef,
    ConstraintDef,
    ConstraintUsage,
    PartUsage,
    ItemUsage,
    PortUsage,
    InterfaceUsage,
    ConnectionDef,
    BindingDef,
    FlowDef,
    SatisfyRelation,
    VerifyRelation,
    Subclassification,
    Allocation,
    CommentNode,
)


# ---------------------------------------------------------------------------
#  Type mapping: AST node class → SemanticModel element type string
# ---------------------------------------------------------------------------

_NODE_TYPE_MAP: dict[type, str] = {
    PartDef: "PartDefinition",
    ItemDef: "ItemDefinition",
    PortDef: "PortDefinition",
    InterfaceDef: "InterfaceDefinition",
    AttributeDef: "AttributeDefinition",
    EnumerationDef: "EnumerationDefinition",
    ActionDef: "ActionDefinition",
    StateDef: "StateDefinition",
    ActionUsage: "ActionUsage",
    StateUsage: "StateUsage",
    RequirementDef: "RequirementDefinition",
    RequirementUsage: "RequirementUsage",
    StakeholderRequirementDef: "StakeholderRequirement",
    ConstraintDef: "ConstraintDefinition",
    ConstraintUsage: "ConstraintUsage",
    PartUsage: "PartUsage",
    ItemUsage: "ItemUsage",
    PortUsage: "PortUsage",
    InterfaceUsage: "InterfaceUsage",
    CommentNode: "Comment",
    # Usages that fall through to generic
    ActorDef: "Actor",
    UseCaseDef: "UseCase",
    TransitionDef: "Transition",
}

_RELATIONSHIP_TYPE_MAP: dict[type, str] = {
    ConnectionDef: "Connection",
    BindingDef: "Binding",
    FlowDef: "ObjectFlow",  # SysML v2 uses ObjectFlow for flows
    SatisfyRelation: "Satisfy",
    VerifyRelation: "Verify",
    Subclassification: "Subclassification",
    Allocation: "Allocation",
    TransitionDef: "Transition",
}


# =============================================================================
#  Model Builder
# =============================================================================


class ModelBuilder:
    """Build a SemanticModel from AST nodes."""

    def __init__(self):
        self._elements: list[dict[str, Any]] = []
        self._relationships: list[dict[str, Any]] = []
        self._packages: list[dict[str, Any]] = []

    # ------------------------------------------------------------------
    #  Public API
    # ------------------------------------------------------------------

    def build(self, ast_nodes: list[ASTNode]) -> dict[str, Any]:
        """Convert a flat list of ASTNodes into a SemanticModel dict."""
        self._elements.clear()
        self._relationships.clear()
        self._packages.clear()

        for node in ast_nodes:
            self._process_node(node, owner_id=None, parent_qname="")

        return {
            "id": str(uuid.uuid4()),
            "name": "Unnamed",
            "elements": list(self._elements),
            "relationships": list(self._relationships),
            "packages": list(self._packages),
        }

    # ------------------------------------------------------------------
    #  Node dispatch
    # ------------------------------------------------------------------

    def _process_node(self, node: ASTNode, owner_id: str | None, parent_qname: str):
        """Dispatch an AST node to the appropriate handler."""
        if isinstance(node, PackageDecl):
            self._process_package(node, owner_id, parent_qname)
        elif isinstance(node, (PartDef, ItemDef, InterfaceDef, ActionDef, StateDef,
                                EnumerationDef, RequirementDef, StakeholderRequirementDef,
                                ConstraintDef, AttributeDef, PortDef,
                                ActorDef, UseCaseDef)):
            self._process_definition(node, owner_id, parent_qname)
        elif isinstance(node, (PartUsage, ItemUsage, PortUsage, InterfaceUsage,
                                RequirementUsage, ConstraintUsage, ActionUsage,
                                StateUsage)):
            self._process_usage(node, owner_id, parent_qname)
        elif isinstance(node, (ConnectionDef, BindingDef, FlowDef, SatisfyRelation,
                                VerifyRelation, Subclassification, Allocation)):
            self._process_relationship(node, owner_id)
        elif isinstance(node, TransitionDef):
            self._process_relationship(node, owner_id)
        elif isinstance(node, CommentNode):
            self._process_comment(node, owner_id, parent_qname)

    # ------------------------------------------------------------------
    #  Package
    # ------------------------------------------------------------------

    def _process_package(self, pkg: PackageDecl, owner_id: str | None, parent_qname: str):
        pkg_id = str(uuid.uuid4())
        qname = f"{parent_qname}::{pkg.name}" if parent_qname else pkg.name

        pkg_dict = {
            "id": pkg_id,
            "name": pkg.name,
            "qualifiedName": qname,
            "ownerId": owner_id,
            "elementIds": [],
        }
        self._packages.append(pkg_dict)

        # Process members with the package as owner
        for member in pkg.members:
            self._process_node(member, owner_id=pkg_id, parent_qname=qname)
            # Collect element IDs of direct children
            if isinstance(member, (PartDef, ItemDef, InterfaceDef, ActionDef, StateDef,
                                    EnumerationDef, RequirementDef, ConstraintDef,
                                    AttributeDef, PortDef, PartUsage, ItemUsage, PortUsage,
                                    InterfaceUsage, RequirementUsage, ConstraintUsage,
                                    ActionUsage, StateUsage, ActorDef, UseCaseDef,
                                    CommentNode)):
                # Find the element we just added (it's the last one)
                if self._elements:
                    pkg_dict["elementIds"].append(self._elements[-1]["id"])

    # ------------------------------------------------------------------
    #  Definition
    # ------------------------------------------------------------------

    def _process_definition(self, node: ASTNode, owner_id: str | None, parent_qname: str):
        elem_id = str(uuid.uuid4())
        qname = f"{parent_qname}::{node.name}" if parent_qname else node.name
        elem_type = _NODE_TYPE_MAP.get(type(node), "PartDefinition")

        properties: dict[str, Any] = {}

        if isinstance(node, PartDef):
            properties = {
                "isAbstract": False,
                "superTypes": node.supertypes,
                "attributes": [
                    self._feature_to_property(f)
                    for f in node.features
                    if isinstance(f, AttributeDef)
                ],
                "ports": [
                    self._feature_to_property(f)
                    for f in node.features
                    if isinstance(f, PortDef)
                ],
            }
        elif isinstance(node, ItemDef):
            properties = {
                "isAbstract": False,
                "superTypes": node.supertypes,
                "attributes": [
                    self._feature_to_property(f)
                    for f in node.features
                    if isinstance(f, AttributeDef)
                ],
                "ports": [
                    self._feature_to_property(f)
                    for f in node.features
                    if isinstance(f, PortDef)
                ],
            }
        elif isinstance(node, PortDef):
            properties = {
                "direction": node.direction,
                "type": node.type_ref or "",
            }
        elif isinstance(node, InterfaceDef):
            properties = {
                "superTypes": node.supertypes,
                "features": [self._feature_to_property(f) for f in node.features],
            }
        elif isinstance(node, AttributeDef):
            properties = {
                "type": node.type_ref or "",
                "multiplicity": node.multiplicity or "1",
                "defaultValue": node.default_value,
            }
        elif isinstance(node, ActionDef):
            properties = {
                "superTypes": node.supertypes,
                "features": [self._feature_to_property(f) for f in node.features],
            }
        elif isinstance(node, StateDef):
            properties = {
                "superTypes": node.supertypes,
                "features": [self._feature_to_property(f) for f in node.features],
            }
        elif isinstance(node, EnumerationDef):
            properties = {
                "superTypes": node.supertypes,
            }
        elif isinstance(node, RequirementDef):
            properties = {
                "requirementId": node.requirement_id or "",
                "text": node.text,
                "attributes": node.attributes,
                "category": "functional",
                "priority": "medium",
                "verifiedBy": [],
            }
        elif isinstance(node, StakeholderRequirementDef):
            properties = {
                "requirementId": node.requirement_id or "",
                "text": node.text,
                "attributes": node.attributes,
            }
        elif isinstance(node, ConstraintDef):
            properties = {
                "expression": node.expression,
                "parameters": node.parameters,
            }

        element = {
            "id": elem_id,
            "name": node.name,
            "qualifiedName": qname,
            "type": elem_type,
            "shortName": None,
            "ownerId": owner_id,
            "description": "",
            "properties": properties,
        }
        self._elements.append(element)

        # Recursively process features that should be owned elements
        for feature in getattr(node, "features", []):
            if isinstance(feature, (AttributeDef, PortDef, PartUsage, ItemUsage,
                                     ActionUsage, StateUsage)):
                self._process_node(feature, owner_id=elem_id, parent_qname=qname)

    # ------------------------------------------------------------------
    #  Usage
    # ------------------------------------------------------------------

    def _process_usage(self, node: ASTNode, owner_id: str | None, parent_qname: str):
        elem_id = str(uuid.uuid4())
        qname = f"{parent_qname}::{node.name}" if parent_qname else node.name
        elem_type = _NODE_TYPE_MAP.get(type(node), "PartUsage")

        def_ref = getattr(node, "definition_ref", "")

        element = {
            "id": elem_id,
            "name": node.name,
            "qualifiedName": qname,
            "type": elem_type,
            "shortName": None,
            "ownerId": owner_id,
            "description": "",
            "properties": {
                "definitionRef": def_ref,
            },
        }
        self._elements.append(element)

        for feature in getattr(node, "features", []):
            if isinstance(feature, (AttributeDef, PortDef)):
                self._process_node(feature, owner_id=elem_id, parent_qname=qname)

    # ------------------------------------------------------------------
    #  Relationship
    # ------------------------------------------------------------------

    def _process_relationship(self, node: ASTNode, owner_id: str | None):
        rel_id = str(uuid.uuid4())
        rel_type = _RELATIONSHIP_TYPE_MAP.get(type(node), "Connection")

        rel: dict[str, Any] = {
            "id": rel_id,
            "type": rel_type,
            "sourceId": "",
            "targetId": "",
            "properties": {},
        }

        if isinstance(node, ConnectionDef):
            rel["name"] = node.name
            rel["sourceId"] = node.source
            rel["targetId"] = node.target
        elif isinstance(node, BindingDef):
            rel["name"] = node.name
            rel["sourceId"] = node.source
            rel["targetId"] = node.target
        elif isinstance(node, FlowDef):
            rel["name"] = node.name
            rel["sourceId"] = node.source
            rel["targetId"] = node.target
        elif isinstance(node, SatisfyRelation):
            rel["sourceId"] = node.source
            rel["targetId"] = node.target
        elif isinstance(node, VerifyRelation):
            rel["sourceId"] = node.source
            rel["targetId"] = node.target
        elif isinstance(node, Subclassification):
            rel["sourceId"] = node.subtype
            rel["targetId"] = node.supertype
        elif isinstance(node, Allocation):
            rel["sourceId"] = node.source
            rel["targetId"] = node.target
        elif isinstance(node, TransitionDef):
            rel["name"] = node.name
            rel["sourceId"] = node.source
            rel["targetId"] = node.target

        self._relationships.append(rel)

    # ------------------------------------------------------------------
    #  Comment
    # ------------------------------------------------------------------

    def _process_comment(self, node: CommentNode, owner_id: str | None, parent_qname: str):
        elem_id = str(uuid.uuid4())
        comment_name = node.name or f"comment_{elem_id[:8]}"
        qname = f"{parent_qname}::{comment_name}" if parent_qname else comment_name

        element = {
            "id": elem_id,
            "name": comment_name,
            "qualifiedName": qname,
            "type": "Comment",
            "shortName": None,
            "ownerId": owner_id,
            "description": node.body,
            "properties": {
                "body": node.body,
            },
        }
        self._elements.append(element)

    # ------------------------------------------------------------------
    #  Feature helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _feature_to_property(feature: ASTNode) -> dict[str, Any]:
        """Convert a feature AST node to an element-like property dict."""
        if isinstance(feature, AttributeDef):
            return {
                "name": feature.name,
                "type": feature.type_ref or "",
                "multiplicity": feature.multiplicity or "1",
                "defaultValue": feature.default_value,
            }
        if isinstance(feature, PortDef):
            return {
                "name": feature.name,
                "direction": feature.direction or "inout",
                "type": feature.type_ref or "",
            }
        return {"name": getattr(feature, "name", ""), "type": ""}
