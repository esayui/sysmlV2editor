"""
Model Validator — completeness and consistency checks.

Implements the interface specified in detailed-design.md §4.3.

Depends on:
    - M-BE-02 Model Manager (for model access and queries)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from app.services.model_manager import ModelManager, ElementNotFoundError


# =============================================================================
#  Data classes
# =============================================================================


@dataclass
class ValidationIssue:
    """A single validation finding (error or warning).

    Attributes:
        code: Error / warning code (e.g. ``'E001'``, ``'W002'``).
        message: Human-readable description.
        element_id: Related element UUID, if applicable.
        severity: ``'error'`` or ``'warning'``.
        source_location: Reference into the source text, if applicable.
    """

    code: str
    message: str
    element_id: str | None = None
    severity: str = "error"
    source_location: str | None = None

    def to_dict(self) -> dict:
        """Return a JSON-serializable dictionary representation."""
        return {
            "code": self.code,
            "message": self.message,
            "element_id": self.element_id,
            "severity": self.severity,
            "source_location": self.source_location,
        }


@dataclass
class ValidationResult:
    """Aggregated validation results.

    *is_valid* is ``True`` only when there are no blocking errors.
    Warnings do not affect *is_valid*.

    Attributes:
        is_valid: ``True`` when there are no blocking errors.
        errors: Blocking issues (E001-E999).
        warnings: Non-blocking issues (W001-W999).
    """

    is_valid: bool = True
    errors: list[ValidationIssue] = field(default_factory=list)
    warnings: list[ValidationIssue] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Return a JSON-serializable dictionary representation."""
        return {
            "isValid": self.is_valid,
            "errors": [i.to_dict() for i in self.errors],
            "warnings": [i.to_dict() for i in self.warnings],
        }


# =============================================================================
#  Rule-auxiliary constants
# =============================================================================

# Element types that are "design elements" (should have requirement trace).
_DESIGN_TYPES: frozenset[str] = frozenset(
    {
        "PartDefinition",
        "PartUsage",
        "ItemDefinition",
        "ItemUsage",
        "ActionDefinition",
        "ActionUsage",
    }
)

# Relationship types that count as requirement-trace links.
_REQUIREMENT_LINK_TYPES: frozenset[str] = frozenset({"Satisfy", "Verify"})


# =============================================================================
#  Validator
# =============================================================================


class ModelValidator:
    """Model validator — checks completeness and consistency.

    Usage::

        mm = ModelManager()
        mm.create_model("Test")
        # ... add elements and relationships ...

        validator = ModelValidator(mm)
        result = validator.validate()
        print(result.is_valid, len(result.errors), len(result.warnings))
    """

    # ------------------------------------------------------------------
    #  Construction
    # ------------------------------------------------------------------

    def __init__(self, model_manager: ModelManager):
        """Initialise with a reference to the ModelManager.

        Args:
            model_manager: The :class:`ModelManager` whose model will be
                validated.
        """
        self.mm: ModelManager = model_manager
        self._rules: list[tuple[str, str, Callable[[], list[ValidationIssue]]]] = []
        self._register_default_rules()

    # ------------------------------------------------------------------
    #  Rule registration
    # ------------------------------------------------------------------

    def _register_default_rules(self) -> None:
        """Register the 9 built-in validation rules (E001-E005, W001-W004)."""
        # ---- Completeness checks (Error) ----
        self.register_rule("E001", "error", self._check_empty_name)
        self.register_rule("E002", "error", self._check_duplicate_qname)
        self.register_rule("E003", "error", self._check_dangling_references)
        self.register_rule("E004", "error", self._check_relationship_source)
        self.register_rule("E005", "error", self._check_relationship_target)

        # ---- Consistency checks (Warning) ----
        self.register_rule("W001", "warning", self._check_no_description)
        self.register_rule("W002", "warning", self._check_partdef_no_ports)
        self.register_rule("W003", "warning", self._check_orphan_element)
        self.register_rule("W004", "warning", self._check_missing_requirement_trace)

    def register_rule(
        self,
        code: str,
        severity: str,
        check_fn: Callable[[], list[ValidationIssue]],
    ) -> None:
        """Register a custom validation rule.

        Args:
            code: Error code (e.g. ``"E001"``, ``"W002"``).
            severity: ``"error"`` or ``"warning"``.
            check_fn: A callable that receives no arguments and returns a
                list of :class:`ValidationIssue` objects.
        """
        self._rules.append((code, severity, check_fn))

    # ------------------------------------------------------------------
    #  Public API
    # ------------------------------------------------------------------

    def validate(self) -> ValidationResult:
        """Execute all registered validation rules against the entire model.

        Returns:
            A :class:`ValidationResult` with aggregated errors and warnings.
        """
        result = ValidationResult()

        if self.mm.model is None:
            return result

        for _code, _severity, check_fn in self._rules:
            for issue in check_fn():
                if issue.severity == "error":
                    result.errors.append(issue)
                    result.is_valid = False
                else:
                    result.warnings.append(issue)

        return result

    def validate_element(self, element_id: str) -> ValidationResult:
        """Execute element-level checks for a single element.

        Only rules that can be evaluated against a single element are
        applied (E001-E003 for errors, W001-W004 for warnings; system-level
        E004/E005 are excluded).

        Args:
            element_id: UUID of the element to validate.

        Returns:
            A :class:`ValidationResult` with issues specific to this element.
        """
        result = ValidationResult()

        if self.mm.model is None:
            return result

        # ---- Error-level element rules ----
        for issue in self._check_empty_name_for_element(element_id):
            result.errors.append(issue)
            result.is_valid = False
        for issue in self._check_duplicate_qname_for_element(element_id):
            result.errors.append(issue)
            result.is_valid = False
        for issue in self._check_dangling_ref_for_element(element_id):
            result.errors.append(issue)
            result.is_valid = False

        # ---- Warning-level element rules ----
        for issue in self._check_no_description_for_element(element_id):
            result.warnings.append(issue)
        for issue in self._check_partdef_no_ports_for_element(element_id):
            result.warnings.append(issue)
        for issue in self._check_orphan_for_element(element_id):
            result.warnings.append(issue)
        for issue in self._check_requirement_trace_for_element(element_id):
            result.warnings.append(issue)

        return result

    # ==================================================================
    #  Rule implementations — full-model scan
    # ==================================================================

    # ------------------------------------------------------------------
    #  E001: Empty element name
    # ------------------------------------------------------------------

    def _check_empty_name(self) -> list[ValidationIssue]:
        """Check every element for an empty or blank name."""
        issues: list[ValidationIssue] = []
        for elem in self.mm.model["elements"]:  # type: ignore[index]
            name = elem.get("name") or ""
            if not name.strip():
                issues.append(
                    ValidationIssue(
                        code="E001",
                        message=f"Element name is empty or blank (id: {elem['id']})",
                        element_id=elem["id"],
                        severity="error",
                    )
                )
        return issues

    # ------------------------------------------------------------------
    #  E002: Duplicate qualified name
    # ------------------------------------------------------------------

    def _check_duplicate_qname(self) -> list[ValidationIssue]:
        """Check for elements that share the same qualified name."""
        issues: list[ValidationIssue] = []
        qname_map: dict[str, list[str]] = {}

        for elem in self.mm.model["elements"]:  # type: ignore[index]
            qname = elem.get("qualifiedName") or ""
            if qname:
                qname_map.setdefault(qname, []).append(elem["id"])

        for qname, ids in qname_map.items():
            if len(ids) > 1:
                for eid in ids:
                    issues.append(
                        ValidationIssue(
                            code="E002",
                            message=(
                                f"Duplicate qualified name '{qname}' "
                                f"(id: {eid})"
                            ),
                            element_id=eid,
                            severity="error",
                        )
                    )
        return issues

    # ------------------------------------------------------------------
    #  E003: Dangling references (via ModelManager helper)
    # ------------------------------------------------------------------

    def _check_dangling_references(self) -> list[ValidationIssue]:
        """Check for dangling references using
        :meth:`ModelManager.get_dangling_references`."""
        issues: list[ValidationIssue] = []
        dangling_ids = self.mm.get_dangling_references()

        element_ids: set[str] = {
            e["id"] for e in self.mm.model["elements"]  # type: ignore[index]
        }

        for did in dangling_ids:
            if did in element_ids:
                issues.append(
                    ValidationIssue(
                        code="E003",
                        message=(
                            "Element has dangling definition reference "
                            f"(id: {did})"
                        ),
                        element_id=did,
                        severity="error",
                    )
                )
            else:
                issues.append(
                    ValidationIssue(
                        code="E003",
                        message=(
                            "Relationship has dangling endpoint reference "
                            f"(id: {did})"
                        ),
                        element_id=did,
                        severity="error",
                    )
                )
        return issues

    # ------------------------------------------------------------------
    #  E004: Relationship source not found
    # ------------------------------------------------------------------

    def _check_relationship_source(self) -> list[ValidationIssue]:
        """Check that every relationship's *sourceId* refers to an existing
        element (matched by UUID, qualified name, or simple name)."""
        issues: list[ValidationIssue] = []
        elements = self.mm.model["elements"]  # type: ignore[index]
        element_ids: set[str] = {e["id"] for e in elements}
        qname_set: set[str] = {e.get("qualifiedName", "") for e in elements}
        name_set: set[str] = {e.get("name", "") for e in elements}

        for rel in self.mm.model.get("relationships", []):  # type: ignore[union-attr]
            src = rel.get("sourceId", "")
            if (
                src
                and src not in element_ids
                and src not in qname_set
                and src not in name_set
            ):
                issues.append(
                    ValidationIssue(
                        code="E004",
                        message=(
                            f"Relationship source '{src}' not found "
                            f"(rel id: {rel['id']})"
                        ),
                        element_id=rel["id"],
                        severity="error",
                    )
                )
        return issues

    # ------------------------------------------------------------------
    #  E005: Relationship target not found
    # ------------------------------------------------------------------

    def _check_relationship_target(self) -> list[ValidationIssue]:
        """Check that every relationship's *targetId* refers to an existing
        element (matched by UUID, qualified name, or simple name)."""
        issues: list[ValidationIssue] = []
        elements = self.mm.model["elements"]  # type: ignore[index]
        element_ids: set[str] = {e["id"] for e in elements}
        qname_set: set[str] = {e.get("qualifiedName", "") for e in elements}
        name_set: set[str] = {e.get("name", "") for e in elements}

        for rel in self.mm.model.get("relationships", []):  # type: ignore[union-attr]
            tgt = rel.get("targetId", "")
            if (
                tgt
                and tgt not in element_ids
                and tgt not in qname_set
                and tgt not in name_set
            ):
                issues.append(
                    ValidationIssue(
                        code="E005",
                        message=(
                            f"Relationship target '{tgt}' not found "
                            f"(rel id: {rel['id']})"
                        ),
                        element_id=rel["id"],
                        severity="error",
                    )
                )
        return issues

    # ------------------------------------------------------------------
    #  W001: No description (non-Comment elements)
    # ------------------------------------------------------------------

    def _check_no_description(self) -> list[ValidationIssue]:
        """Warn when a non-Comment element has no description."""
        issues: list[ValidationIssue] = []
        for elem in self.mm.model["elements"]:  # type: ignore[index]
            if elem.get("type") == "Comment":
                continue
            desc = elem.get("description")
            if not desc or not str(desc).strip():
                issues.append(
                    ValidationIssue(
                        code="W001",
                        message=(
                            "Element has no description "
                            f"(name: {elem.get('name', '')}, id: {elem['id']})"
                        ),
                        element_id=elem["id"],
                        severity="warning",
                    )
                )
        return issues

    # ------------------------------------------------------------------
    #  W002: PartDef has no ports
    # ------------------------------------------------------------------

    def _check_partdef_no_ports(self) -> list[ValidationIssue]:
        """Warn when a PartDefinition element has no port definitions."""
        issues: list[ValidationIssue] = []
        for elem in self.mm.model["elements"]:  # type: ignore[index]
            if elem.get("type") != "PartDefinition":
                continue
            if self._element_has_ports(elem["id"]):
                continue
            issues.append(
                ValidationIssue(
                    code="W002",
                    message=(
                        "PartDefinition has no ports "
                        f"(name: {elem.get('name', '')}, id: {elem['id']})"
                    ),
                    element_id=elem["id"],
                    severity="warning",
                )
            )
        return issues

    def _element_has_ports(self, element_id: str) -> bool:
        """Return ``True`` if the element has ports via properties or children."""
        try:
            elem = self.mm.get_element(element_id)
        except ElementNotFoundError:
            return False

        # Check properties.ports list
        props = elem.get("properties", {})
        ports = props.get("ports", [])
        if isinstance(ports, list) and len(ports) > 0:
            return True

        # Check for child elements with port-related types
        for e in self.mm.model["elements"]:  # type: ignore[index]
            if e.get("ownerId") == element_id and e.get("type") in (
                "PortDefinition",
                "PortUsage",
            ):
                return True

        return False

    # ------------------------------------------------------------------
    #  W003: Orphan element (no relationships)
    # ------------------------------------------------------------------

    def _check_orphan_element(self) -> list[ValidationIssue]:
        """Warn when an element participates in zero relationships."""
        issues: list[ValidationIssue] = []
        for elem in self.mm.model["elements"]:  # type: ignore[index]
            rels = self.mm.get_relationships(elem["id"])
            if not rels:
                issues.append(
                    ValidationIssue(
                        code="W003",
                        message=(
                            "Element has no relationships "
                            f"(name: {elem.get('name', '')}, id: {elem['id']})"
                        ),
                        element_id=elem["id"],
                        severity="warning",
                    )
                )
        return issues

    # ------------------------------------------------------------------
    #  W004: Design element missing requirement trace
    # ------------------------------------------------------------------

    def _check_missing_requirement_trace(self) -> list[ValidationIssue]:
        """Warn when a design element (Part/Item/Action) is not linked to
        a Satisfy or Verify relationship."""
        issues: list[ValidationIssue] = []
        for elem in self.mm.model["elements"]:  # type: ignore[index]
            etype = elem.get("type", "")
            if etype not in _DESIGN_TYPES:
                continue

            rels = self.mm.get_relationships(elem["id"])
            has_requirement_link = any(
                r.get("type") in _REQUIREMENT_LINK_TYPES for r in rels
            )
            if not has_requirement_link:
                issues.append(
                    ValidationIssue(
                        code="W004",
                        message=(
                            "Design element missing requirement trace "
                            f"(name: {elem.get('name', '')}, type: {etype}, "
                            f"id: {elem['id']})"
                        ),
                        element_id=elem["id"],
                        severity="warning",
                    )
                )
        return issues

    # ==================================================================
    #  Rule implementations — single-element
    # ==================================================================

    # ------------------------------------------------------------------
    #  E001 (element-level)
    # ------------------------------------------------------------------

    def _check_empty_name_for_element(
        self, element_id: str
    ) -> list[ValidationIssue]:
        """E001: check a single element for empty name."""
        try:
            elem = self.mm.get_element(element_id)
        except ElementNotFoundError:
            return []
        name = elem.get("name") or ""
        if not name.strip():
            return [
                ValidationIssue(
                    code="E001",
                    message=f"Element name is empty or blank (id: {element_id})",
                    element_id=element_id,
                    severity="error",
                )
            ]
        return []

    # ------------------------------------------------------------------
    #  E002 (element-level)
    # ------------------------------------------------------------------

    def _check_duplicate_qname_for_element(
        self, element_id: str
    ) -> list[ValidationIssue]:
        """E002: check if a single element's qname conflicts with another."""
        try:
            elem = self.mm.get_element(element_id)
        except ElementNotFoundError:
            return []
        qname = elem.get("qualifiedName") or ""
        if not qname:
            return []

        count = sum(
            1
            for e in self.mm.model["elements"]  # type: ignore[index]
            if e.get("qualifiedName") == qname
        )
        if count > 1:
            return [
                ValidationIssue(
                    code="E002",
                    message=(
                        f"Duplicate qualified name '{qname}' "
                        f"(id: {element_id})"
                    ),
                    element_id=element_id,
                    severity="error",
                )
            ]
        return []

    # ------------------------------------------------------------------
    #  E003 (element-level)
    # ------------------------------------------------------------------

    def _check_dangling_ref_for_element(
        self, element_id: str
    ) -> list[ValidationIssue]:
        """E003: check if a single element has a dangling definitionRef."""
        try:
            elem = self.mm.get_element(element_id)
        except ElementNotFoundError:
            return []

        props = elem.get("properties", {})
        def_ref: str = props.get("definitionRef", "")
        if not def_ref:
            return []

        if self.mm.get_element_by_qualified_name(def_ref) is None:
            return [
                ValidationIssue(
                    code="E003",
                    message=(
                        "Element references non-existent definition "
                        f"'{def_ref}' (id: {element_id})"
                    ),
                    element_id=element_id,
                    severity="error",
                )
            ]
        return []

    # ------------------------------------------------------------------
    #  W001 (element-level)
    # ------------------------------------------------------------------

    def _check_no_description_for_element(
        self, element_id: str
    ) -> list[ValidationIssue]:
        """W001: check if a single element lacks a description."""
        try:
            elem = self.mm.get_element(element_id)
        except ElementNotFoundError:
            return []
        if elem.get("type") == "Comment":
            return []
        desc = elem.get("description")
        if not desc or not str(desc).strip():
            return [
                ValidationIssue(
                    code="W001",
                    message=(
                        "Element has no description "
                        f"(name: {elem.get('name', '')}, id: {element_id})"
                    ),
                    element_id=element_id,
                    severity="warning",
                )
            ]
        return []

    # ------------------------------------------------------------------
    #  W002 (element-level)
    # ------------------------------------------------------------------

    def _check_partdef_no_ports_for_element(
        self, element_id: str
    ) -> list[ValidationIssue]:
        """W002: check if a single PartDef lacks ports."""
        try:
            elem = self.mm.get_element(element_id)
        except ElementNotFoundError:
            return []
        if elem.get("type") != "PartDefinition":
            return []
        if not self._element_has_ports(element_id):
            return [
                ValidationIssue(
                    code="W002",
                    message=(
                        "PartDefinition has no ports "
                        f"(name: {elem.get('name', '')}, id: {element_id})"
                    ),
                    element_id=element_id,
                    severity="warning",
                )
            ]
        return []

    # ------------------------------------------------------------------
    #  W003 (element-level)
    # ------------------------------------------------------------------

    def _check_orphan_for_element(
        self, element_id: str
    ) -> list[ValidationIssue]:
        """W003: check if a single element is orphan (has no relationships)."""
        rels = self.mm.get_relationships(element_id)
        if not rels:
            try:
                elem = self.mm.get_element(element_id)
                return [
                    ValidationIssue(
                        code="W003",
                        message=(
                            "Element has no relationships "
                            f"(name: {elem.get('name', '')}, id: {element_id})"
                        ),
                        element_id=element_id,
                        severity="warning",
                    )
                ]
            except ElementNotFoundError:
                pass
        return []

    # ------------------------------------------------------------------
    #  W004 (element-level)
    # ------------------------------------------------------------------

    def _check_requirement_trace_for_element(
        self, element_id: str
    ) -> list[ValidationIssue]:
        """W004: check if a single design element lacks requirement trace."""
        try:
            elem = self.mm.get_element(element_id)
        except ElementNotFoundError:
            return []
        etype = elem.get("type", "")
        if etype not in _DESIGN_TYPES:
            return []

        rels = self.mm.get_relationships(element_id)
        has_requirement_link = any(
            r.get("type") in _REQUIREMENT_LINK_TYPES for r in rels
        )
        if not has_requirement_link:
            return [
                ValidationIssue(
                    code="W004",
                    message=(
                        "Design element missing requirement trace "
                        f"(name: {elem.get('name', '')}, type: {etype}, "
                        f"id: {element_id})"
                    ),
                    element_id=element_id,
                    severity="warning",
                )
            ]
        return []


# =============================================================================
#  Formatting
# =============================================================================


def format_validation_result(result: ValidationResult) -> str:
    """Format a :class:`ValidationResult` as a human-readable string.

    Issues are sorted by severity (errors first) then by error code.

    Args:
        result: The validation result to format.

    Returns:
        A multi-line human-readable string.
    """
    lines: list[str] = []

    if result.is_valid:
        lines.append("Validation passed.")
    else:
        lines.append("Validation FAILED.")

    if result.errors:
        lines.append(f"\nErrors ({len(result.errors)}):")
        for issue in sorted(result.errors, key=lambda i: i.code):
            loc = f" [{issue.source_location}]" if issue.source_location else ""
            lines.append(f"  {issue.code}: {issue.message}{loc}")

    if result.warnings:
        lines.append(f"\nWarnings ({len(result.warnings)}):")
        for issue in sorted(result.warnings, key=lambda i: i.code):
            loc = f" [{issue.source_location}]" if issue.source_location else ""
            lines.append(f"  {issue.code}: {issue.message}{loc}")

    if not result.errors and not result.warnings:
        lines.append("\nNo issues found.")

    return "\n".join(lines)
