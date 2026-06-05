"""
Text Generator — Serializes a SemanticModel back into SysML v2 text.

Supports two output modes:
  format=True  — formatted with indentation and line breaks
  format=False — compact single-line output
"""

from __future__ import annotations

from typing import Any


class TextGenerator:
    """Generate SysML v2 text from a SemanticModel dictionary."""

    def __init__(self, indent_size: int = 4):
        self.indent_size = indent_size

    # ------------------------------------------------------------------
    #  Public API
    # ------------------------------------------------------------------

    def generate(self, model: dict[str, Any], format: bool = True) -> str:
        """Serialize a SemanticModel to SysML v2 text.

        Args:
            model: SemanticModel dict (with elements, relationships, packages).
            format: If True, produce indented, multi-line output.

        Returns:
            Valid SysML v2 text string.
        """
        lines: list[str] = []

        # Packages
        for pkg in model.get("packages", []):
            lines.append(self._generate_package(pkg, model, indent=0, format=format))

        # Top-level elements (not owned by any package)
        top_elements = [
            e for e in model.get("elements", [])
            if e.get("ownerId") is None
        ]
        for elem in top_elements:
            lines.append(self.generate_element(elem, model, indent=0, format=format))

        # Top-level relationships
        for rel in model.get("relationships", []):
            owner = rel.get("ownerId")
            if owner is None:
                lines.append(self._generate_relationship(rel, indent=0, format=format))

        if format:
            return "\n".join(lines)
        return " ".join(lines)

    # ------------------------------------------------------------------
    #  Element generation
    # ------------------------------------------------------------------

    def generate_element(
        self,
        element: dict[str, Any],
        model: dict[str, Any] | None = None,
        indent: int = 0,
        format: bool = True,
    ) -> str:
        """Generate text for a single SemanticElement."""
        elem_type = element.get("type", "")
        props = element.get("properties", {})
        name = element.get("name", "")

        prefix = " " * indent if format else ""
        inner_indent = indent + self.indent_size if format else 0
        terminator = ";" if not format else ""

        # Package elements
        if elem_type == "Package":
            pkg_text = self._generate_package(element, model or {}, indent, format)
            return pkg_text

        # Definitions
        kw = self._definition_keyword(elem_type)
        if kw:
            # SuperTypes as :> clause in the header
            supertypes = props.get("superTypes", [])
            supertype_clause = ""
            if supertypes:
                supertype_clause = f" :> {', '.join(supertypes)}"
            body = self._generate_element_body(element, model or {}, inner_indent, format)
            if body:
                return f"{prefix}{kw} def {name}{supertype_clause} {{\n{body}\n{prefix}}}"
            return f"{prefix}{kw} def {name}{supertype_clause} {{ }}"

        # Usages
        ukw = self._usage_keyword(elem_type)
        if ukw:
            def_ref = props.get("definitionRef", "")
            if def_ref:
                return f"{prefix}{ukw} {name} : {def_ref};"
            return f"{prefix}{ukw} {name};"

        # Comments
        if elem_type == "Comment":
            body = props.get("body", element.get("description", ""))
            return f'{prefix}comment "{body}";'

        # Fallback
        return f"{prefix}// {elem_type} {name} {terminator}"

    # ------------------------------------------------------------------
    #  Relationship generation
    # ------------------------------------------------------------------

    def _generate_relationship(self, rel: dict[str, Any], indent: int = 0, format: bool = True) -> str:
        prefix = " " * indent if format else ""
        rel_type = rel.get("type", "")
        name = rel.get("name", "")
        source_id = rel.get("sourceId", "")
        target_id = rel.get("targetId", "")

        name_part = f" {name}" if name else ""

        if rel_type == "Connection":
            return f"{prefix}connect{name_part} {source_id} to {target_id};"
        elif rel_type == "Binding":
            return f"{prefix}binding{name_part} connect {source_id} to {target_id};"
        elif rel_type in ("ObjectFlow", "ControlFlow"):
            flow_kw = "flow" if rel_type == "ObjectFlow" else "control flow"
            return f"{prefix}{flow_kw}{name_part} from {source_id} to {target_id};"
        elif rel_type == "Satisfy":
            return f"{prefix}satisfy {source_id} to {target_id};"
        elif rel_type == "Verify":
            return f"{prefix}verify {source_id} to {target_id};"
        elif rel_type == "Subclassification":
            return f"{prefix}{source_id} :> {target_id};"
        elif rel_type == "Allocation":
            return f"{prefix}allocate {source_id} to {target_id};"
        elif rel_type == "Transition":
            return f"{prefix}transition{name_part} from {source_id} to {target_id};"
        return f"{prefix}// {rel_type} {source_id} -> {target_id};"

    # ------------------------------------------------------------------
    #  Internal helpers
    # ------------------------------------------------------------------

    def _definition_keyword(self, elem_type: str) -> str:
        """Map element type to the definition keyword (without 'def')."""
        mapping = {
            "PartDefinition": "part",
            "ItemDefinition": "item",
            "PortDefinition": "port",
            "InterfaceDefinition": "interface",
            "ActionDefinition": "action",
            "StateDefinition": "state",
            "EnumerationDefinition": "enumeration",
            "RequirementDefinition": "requirement",
            "ConstraintDefinition": "constraint",
            "AttributeDefinition": "attribute",
            "Actor": "actor",
            "UseCase": "use case",
        }
        return mapping.get(elem_type, "")

    def _usage_keyword(self, elem_type: str) -> str:
        mapping = {
            "PartUsage": "part",
            "ItemUsage": "item",
            "PortUsage": "port",
            "InterfaceUsage": "interface",
            "RequirementUsage": "requirement",
            "ConstraintUsage": "constraint",
            "ActionUsage": "action",
            "StateUsage": "state",
        }
        return mapping.get(elem_type, "")

    def _generate_element_body(
        self, element: dict[str, Any], model: dict[str, Any],
        indent: int, format: bool,
    ) -> str:
        """Generate the body content (features) for a definition."""
        props = element.get("properties", {})
        prefix = " " * indent if format else ""
        nl = "\n" if format else " "
        lines: list[str] = []

        # SuperTypes as :> clause
        supertypes = props.get("superTypes", [])
        if supertypes:
            lines.append(f"{prefix}:> {', '.join(supertypes)}" + (";" if not format else ""))

        # Attributes
        attributes = props.get("attributes", [])
        for attr in attributes:
            attr_name = attr.get("name", "")
            attr_type = attr.get("type", "")
            mult = attr.get("multiplicity", "")
            default = attr.get("defaultValue")
            mult_str = f"[{mult}]" if mult and mult != "1" else ""
            default_str = f" = {default}" if default else ""
            lines.append(f"{prefix}attribute {attr_name} : {attr_type}{mult_str}{default_str};")

        # Ports
        ports = props.get("ports", [])
        for port in ports:
            port_name = port.get("name", "")
            port_type = port.get("type", "")
            port_dir = port.get("direction", "")
            dir_prefix = f"{port_dir} " if port_dir else ""
            type_part = f" : {port_type}" if port_type else ""
            lines.append(f"{prefix}port {dir_prefix}{port_name}{type_part};")

        # Generic features
        features = props.get("features", [])
        for feat in features:
            feat_name = feat.get("name", "")
            feat_type = feat.get("type", "")
            lines.append(f"{prefix}feature {feat_name} : {feat_type};")

        # Constraint expression
        expr = props.get("expression", "")
        if expr:
            params = props.get("parameters", [])
            if params:
                param_str = ", ".join(f"{p.get('name', '')} : {p.get('type', '')}" for p in params)
                lines.append(f"{prefix}({param_str}) {{ {expr} }}")
            else:
                lines.append(f"{prefix}{{ {expr} }}")

        # Requirement-specific
        req_id = props.get("requirementId", "")
        if req_id:
            lines.insert(0, f'{prefix}id "{req_id}";')
        req_text = props.get("text", "")
        if req_text:
            lines.insert(1, f'{prefix}text "{req_text}";')

        return nl.join(lines)

    def _generate_package(
        self, pkg: dict[str, Any], model: dict[str, Any],
        indent: int, format: bool,
    ) -> str:
        """Generate text for a Package declaration."""
        name = pkg.get("name", "")
        element_ids = pkg.get("elementIds", [])
        prefix = " " * indent if format else ""
        inner_indent = indent + self.indent_size if format else 0
        nl = "\n" if format else " "

        # Find elements belonging to this package
        elements_map = {e["id"]: e for e in model.get("elements", [])}
        member_lines: list[str] = []

        for eid in element_ids:
            elem = elements_map.get(eid)
            if elem:
                text = self.generate_element(elem, model, inner_indent, format)
                member_lines.append(text)

        # Also include elements whose ownerId matches this package
        for elem in model.get("elements", []):
            if elem.get("ownerId") == pkg["id"] and elem["id"] not in element_ids:
                text = self.generate_element(elem, model, inner_indent, format)
                member_lines.append(text)

        if member_lines:
            return f"{prefix}package {name} {{\n{nl.join(member_lines)}\n{prefix}}}"
        return f"{prefix}package {name} {{ }}"
