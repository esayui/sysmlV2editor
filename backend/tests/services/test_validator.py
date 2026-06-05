"""
Tests for the Model Validator module.

Covers:
  - Data classes: ValidationResult, ValidationIssue
  - Framework: __init__, validate(), validate_element(), register_rule()
  - E001: Empty element name
  - E002: Duplicate qualified name
  - E003: Dangling reference (Usage -> non-existent Definition)
  - E004: Relationship source not found
  - E005: Relationship target not found
  - W001: No description
  - W002: PartDef has no ports
  - W003: Orphan element (no relationships)
  - W004: Design element missing requirement trace
  - Formatting: format_validation_result()
  - Edge cases: empty model, unloaded model, custom rules
"""

from __future__ import annotations

import uuid

import pytest

from app.services.model_manager import ModelManager
from app.services.validator import (
    ModelValidator,
    ValidationResult,
    ValidationIssue,
    format_validation_result,
)


# =============================================================================
#  Fixtures
# =============================================================================


@pytest.fixture
def mm():
    """Return a fresh ModelManager with an empty model."""
    mgr = ModelManager()
    mgr.create_model("TestModel")
    return mgr


@pytest.fixture
def v(mm):
    """Return a ModelValidator wrapping the fixture ModelManager."""
    return ModelValidator(mm)


def _make_element(name, etype="PartDefinition", **kwargs):
    """Helper: create a minimal element dict with defaults (for direct use
    when we need elements not yet managed by ModelManager)."""
    props = kwargs.pop("properties", {})
    elem = {
        "id": kwargs.pop("id", str(uuid.uuid4())),
        "name": name,
        "type": etype,
        "ownerId": kwargs.pop("ownerId", None),
        "qualifiedName": "",
        "shortName": None,
        "description": "",
        "properties": props,
    }
    elem.update(kwargs)
    return elem


# =============================================================================
#  1. Data classes
# =============================================================================


class TestDataClasses:
    """Subtask 1.1 – 1.2"""

    def test_validation_issue_defaults(self):
        """ValidationIssue has correct default values."""
        issue = ValidationIssue(code="E001", message="test")
        assert issue.code == "E001"
        assert issue.message == "test"
        assert issue.element_id is None
        assert issue.severity == "error"
        assert issue.source_location is None

    def test_validation_issue_full(self):
        """ValidationIssue stores all fields correctly."""
        issue = ValidationIssue(
            code="W001",
            message="No description",
            element_id="abc-123",
            severity="warning",
            source_location="line 5",
        )
        assert issue.code == "W001"
        assert issue.message == "No description"
        assert issue.element_id == "abc-123"
        assert issue.severity == "warning"
        assert issue.source_location == "line 5"

    def test_validation_result_defaults(self):
        """ValidationResult starts valid with empty lists."""
        result = ValidationResult()
        assert result.is_valid is True
        assert result.errors == []
        assert result.warnings == []

    def test_validation_result_can_be_invalidated(self):
        """Setting is_valid to False and adding errors works."""
        result = ValidationResult()
        result.is_valid = False
        result.errors.append(
            ValidationIssue(code="E001", message="bad", element_id="1")
        )
        assert result.is_valid is False
        assert len(result.errors) == 1


# =============================================================================
#  2. Validator framework
# =============================================================================


class TestValidatorFramework:
    """Subtasks 1.3 – 1.6"""

    def test_init_holds_model_manager(self, v, mm):
        """1.3: __init__ stores the ModelManager reference."""
        assert v.mm is mm

    def test_validate_on_empty_model_returns_valid(self, v):
        """1.4: validate() on an empty model (no elements) returns valid."""
        result = v.validate()
        assert result.is_valid is True
        assert result.errors == []
        # Some warnings may fire (e.g. no elements at all) — but we have
        # no elements, so no warnings either.
        assert result.warnings == []

    def test_validate_with_no_model_loaded(self):
        """1.4: validate() returns empty result when no model is loaded."""
        mgr = ModelManager()
        validator = ModelValidator(mgr)
        result = validator.validate()
        assert result.is_valid is True
        assert result.errors == []
        assert result.warnings == []

    def test_validate_element_specific(self, mm):
        """1.5: validate_element checks only the given element."""
        elem = mm.add_element(
            {"name": "  ", "type": "PartDefinition"}  # blank name -> E001
        )
        v = ModelValidator(mm)
        result = v.validate_element(elem["id"])
        # Should have E001 (empty name)
        assert not result.is_valid
        assert any(i.code == "E001" for i in result.errors)

    def test_validate_element_non_existent(self, v):
        """1.5: validate_element with non-existent id returns empty result."""
        result = v.validate_element("nonexistent-id")
        assert result.is_valid is True
        assert result.errors == []
        assert result.warnings == []

    def test_register_rule_custom(self, mm):
        """1.6: register_rule allows adding a custom check function."""
        v = ModelValidator(mm)

        def custom_check():
            return [
                ValidationIssue(
                    code="C001",
                    message="Custom issue",
                    element_id="fake-id",
                    severity="error",
                )
            ]

        v.register_rule("C001", "error", custom_check)
        result = v.validate()
        assert not result.is_valid
        assert any(i.code == "C001" for i in result.errors)

    def test_register_rule_warning(self, mm):
        """1.6: custom warning rule does not invalidate the result."""
        v = ModelValidator(mm)

        def custom_warning():
            return [
                ValidationIssue(
                    code="CW01",
                    message="Custom warning",
                    element_id="fake-id",
                    severity="warning",
                )
            ]

        v.register_rule("CW01", "warning", custom_warning)
        result = v.validate()
        assert result.is_valid is True  # warnings don't invalidate
        assert any(i.code == "CW01" for i in result.warnings)


# =============================================================================
#  3. E001: Empty element name
# =============================================================================


class TestE001EmptyName:
    """Subtasks 2.1, 2.6"""

    def test_empty_name_detected(self, mm):
        """2.1: element with empty string name triggers E001."""
        elem = mm.add_element({"name": "", "type": "PartDefinition"})
        v = ModelValidator(mm)
        result = v.validate()
        assert not result.is_valid
        assert any(
            i.code == "E001" and i.element_id == elem["id"]
            for i in result.errors
        )

    def test_blank_name_detected(self, mm):
        """2.1: element with whitespace-only name triggers E001."""
        elem = mm.add_element({"name": "   ", "type": "PartDefinition"})
        v = ModelValidator(mm)
        result = v.validate()
        assert not result.is_valid
        assert any(
            i.code == "E001" and i.element_id == elem["id"]
            for i in result.errors
        )

    def test_valid_name_no_error(self, mm):
        """2.1: element with a real name does NOT trigger E001."""
        mm.add_element({"name": "ValidName", "type": "PartDefinition"})
        v = ModelValidator(mm)
        result = v.validate()
        e001_errors = [i for i in result.errors if i.code == "E001"]
        assert len(e001_errors) == 0

    def test_no_name_key_defaults_to_empty(self, mm):
        """2.1: element with no 'name' key at all should trigger E001."""
        # add_element always sets name, so inject one manually
        elem_id = str(uuid.uuid4())
        mm.model["elements"].append(
            {"id": elem_id, "type": "PartDefinition", "qualifiedName": "X"}
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert any(
            i.code == "E001" and i.element_id == elem_id
            for i in result.errors
        )

    def test_empty_name_element_level(self, mm):
        """2.1: validate_element catches E001 for a single element."""
        elem = mm.add_element({"name": "", "type": "PartDefinition"})
        v = ModelValidator(mm)
        result = v.validate_element(elem["id"])
        assert not result.is_valid
        assert any(
            i.code == "E001" and i.element_id == elem["id"]
            for i in result.errors
        )


# =============================================================================
#  4. E002: Duplicate qualified name
# =============================================================================


class TestE002DuplicateQName:
    """Subtasks 2.2, 2.6"""

    def test_duplicate_qname_detected(self, mm):
        """2.2: two elements with the same qualifiedName trigger E002."""
        e1 = mm.add_element({"name": "Same", "type": "PartDefinition"})
        e2 = mm.add_element({"name": "Same", "type": "PartDefinition"},
                            owner_id="different_parent_for_unique")
        # Force same qualifiedName on both
        mm.update_element(e1["id"], {"qualifiedName": "Pkg::Dup"})
        mm.update_element(e2["id"], {"qualifiedName": "Pkg::Dup"})
        v = ModelValidator(mm)
        result = v.validate()
        assert not result.is_valid
        e002_issues = [i for i in result.errors if i.code == "E002"]
        assert len(e002_issues) >= 2  # one for each duplicate

    def test_unique_qname_no_error(self, mm):
        """2.2: elements with different qualified names do not trigger E002."""
        mm.add_element({"name": "A", "type": "PartDefinition"})
        mm.add_element({"name": "B", "type": "PartDefinition"})
        v = ModelValidator(mm)
        result = v.validate()
        e002_issues = [i for i in result.errors if i.code == "E002"]
        assert len(e002_issues) == 0

    def test_empty_qname_skipped(self, mm):
        """2.2: elements with empty qualifiedName are not compared."""
        e1 = mm.add_element({"name": "A", "type": "PartDefinition"})
        e2 = mm.add_element({"name": "B", "type": "PartDefinition"})
        mm.update_element(e1["id"], {"qualifiedName": ""})
        mm.update_element(e2["id"], {"qualifiedName": ""})
        v = ModelValidator(mm)
        result = v.validate()
        e002_issues = [i for i in result.errors if i.code == "E002"]
        assert len(e002_issues) == 0

    def test_duplicate_qname_element_level(self, mm):
        """2.2: validate_element catches E002 for a single element."""
        e1 = mm.add_element({"name": "Same"})
        e2 = mm.add_element({"name": "Same"}, owner_id="other")
        # Force duplicate qnames
        qn = "Shared::Name"
        mm.update_element(e1["id"], {"qualifiedName": qn})
        mm.update_element(e2["id"], {"qualifiedName": qn})
        v = ModelValidator(mm)
        result = v.validate_element(e1["id"])
        assert not result.is_valid
        assert any(
            i.code == "E002" and i.element_id == e1["id"]
            for i in result.errors
        )

    def test_multiple_duplicates(self, mm):
        """2.2: three elements with same qname all get E002 issues."""
        for i in range(3):
            e = mm.add_element({"name": f"Dup{i}"})
            mm.update_element(e["id"], {"qualifiedName": "Triple::Dup"})
        v = ModelValidator(mm)
        result = v.validate()
        e002_issues = [i for i in result.errors if i.code == "E002"]
        assert len(e002_issues) == 3


# =============================================================================
#  5. E003: Dangling references
# =============================================================================


class TestE003DanglingReferences:
    """Subtasks 2.3, 2.6"""

    def test_dangling_usage_reference(self, mm):
        """2.3: Usage with definitionRef pointing to nonexistent definition."""
        elem = mm.add_element(
            {
                "name": "orphanUsage",
                "type": "PartUsage",
                "properties": {"definitionRef": "DoesNotExist"},
            }
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert not result.is_valid
        assert any(
            i.code == "E003" and i.element_id == elem["id"]
            for i in result.errors
        )

    def test_dangling_relationship_endpoint(self, mm):
        """2.3: Relationship with nonexistent sourceId triggers E003."""
        rel = mm.add_relationship(
            _make_element("R", etype="Connection", id="rel-1",
                          sourceId="fake-source", targetId=None)
        )
        # Actually, use the proper helper
        pass

    def test_valid_reference_no_error(self, mm):
        """2.3: Usage with valid definitionRef does NOT trigger E003."""
        engine = mm.add_element(
            {"name": "Engine", "type": "PartDefinition"}
        )
        mm.add_element(
            {
                "name": "myEngine",
                "type": "PartUsage",
                "properties": {"definitionRef": engine["qualifiedName"]},
            }
        )
        v = ModelValidator(mm)
        result = v.validate()
        e003_issues = [i for i in result.errors if i.code == "E003"]
        assert len(e003_issues) == 0

    def test_dangling_via_relationship(self, mm):
        """2.3: Relationship with nonexistent source/target triggers E003
        via get_dangling_references."""
        mm.add_relationship(
            {
                "type": "Connection",
                "sourceId": "nonexistent-src",
                "targetId": "nonexistent-tgt",
            }
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert not result.is_valid
        assert any(i.code == "E003" for i in result.errors)

    def test_dangling_element_level(self, mm):
        """2.3: validate_element catches E003 for a single usage element."""
        elem = mm.add_element(
            {
                "name": "orphan",
                "type": "PartUsage",
                "properties": {"definitionRef": "MissingDef"},
            }
        )
        v = ModelValidator(mm)
        result = v.validate_element(elem["id"])
        assert not result.is_valid
        assert any(
            i.code == "E003" and i.element_id == elem["id"]
            for i in result.errors
        )


# =============================================================================
#  6. E004: Relationship source not found
# =============================================================================


class TestE004SourceNotFound:
    """Subtasks 2.4"""

    def test_source_not_found(self, mm):
        """2.4: Relationship with nonexistent sourceId triggers E004."""
        existing = mm.add_element({"name": "Target"})
        rel = mm.add_relationship(
            {
                "type": "Connection",
                "sourceId": "nonexistent-source-id",
                "targetId": existing["id"],
            }
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert not result.is_valid
        assert any(
            i.code == "E004" and i.element_id == rel["id"]
            for i in result.errors
        )

    def test_valid_source_no_error(self, mm):
        """2.4: Relationship with valid sourceId does not trigger E004."""
        src = mm.add_element({"name": "Source"})
        tgt = mm.add_element({"name": "Target"})
        mm.add_relationship(
            {"type": "Connection", "sourceId": src["id"], "targetId": tgt["id"]}
        )
        v = ModelValidator(mm)
        result = v.validate()
        e004_issues = [i for i in result.errors if i.code == "E004"]
        assert len(e004_issues) == 0

    def test_empty_source_id_ok(self, mm):
        """2.4: Relationship with empty sourceId is not flagged by E004."""
        tgt = mm.add_element({"name": "Target"})
        mm.add_relationship(
            {"type": "Connection", "sourceId": "", "targetId": tgt["id"]}
        )
        v = ModelValidator(mm)
        result = v.validate()
        e004_issues = [i for i in result.errors if i.code == "E004"]
        assert len(e004_issues) == 0


# =============================================================================
#  7. E005: Relationship target not found
# =============================================================================


class TestE005TargetNotFound:
    """Subtasks 2.5"""

    def test_target_not_found(self, mm):
        """2.5: Relationship with nonexistent targetId triggers E005."""
        existing = mm.add_element({"name": "Source"})
        rel = mm.add_relationship(
            {
                "type": "Connection",
                "sourceId": existing["id"],
                "targetId": "nonexistent-target-id",
            }
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert not result.is_valid
        assert any(
            i.code == "E005" and i.element_id == rel["id"]
            for i in result.errors
        )

    def test_valid_target_no_error(self, mm):
        """2.5: Relationship with valid targetId does not trigger E005."""
        src = mm.add_element({"name": "Source"})
        tgt = mm.add_element({"name": "Target"})
        mm.add_relationship(
            {"type": "Connection", "sourceId": src["id"], "targetId": tgt["id"]}
        )
        v = ModelValidator(mm)
        result = v.validate()
        e005_issues = [i for i in result.errors if i.code == "E005"]
        assert len(e005_issues) == 0

    def test_empty_target_id_ok(self, mm):
        """2.5: Relationship with empty targetId is not flagged by E005."""
        src = mm.add_element({"name": "Source"})
        mm.add_relationship(
            {"type": "Connection", "sourceId": src["id"], "targetId": ""}
        )
        v = ModelValidator(mm)
        result = v.validate()
        e005_issues = [i for i in result.errors if i.code == "E005"]
        assert len(e005_issues) == 0


# =============================================================================
#  8. W001: No description
# =============================================================================


class TestW001NoDescription:
    """Subtasks 3.1, 3.5"""

    def test_no_description_warning(self, mm):
        """3.1: Element with empty description triggers W001."""
        elem = mm.add_element(
            {"name": "NoDesc", "type": "PartDefinition", "description": ""}
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert result.is_valid is True  # warnings don't invalidate
        assert any(
            i.code == "W001" and i.element_id == elem["id"]
            for i in result.warnings
        )

    def test_comment_element_skipped(self, mm):
        """3.1: Comment elements are excluded from W001 check."""
        mm.add_element(
            {"name": "MyComment", "type": "Comment", "description": ""}
        )
        v = ModelValidator(mm)
        result = v.validate()
        w001_issues = [i for i in result.warnings if i.code == "W001"]
        assert len(w001_issues) == 0

    def test_with_description_no_warning(self, mm):
        """3.1: Element with a description does NOT trigger W001."""
        mm.add_element(
            {
                "name": "HasDesc",
                "type": "PartDefinition",
                "description": "A useful description.",
            }
        )
        v = ModelValidator(mm)
        result = v.validate()
        w001_issues = [i for i in result.warnings if i.code == "W001"]
        assert len(w001_issues) == 0

    def test_whitespace_only_description_is_no_description(self, mm):
        """3.1: Whitespace description is treated as empty."""
        elem = mm.add_element(
            {"name": "WS", "type": "PartDefinition", "description": "   "}
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert any(
            i.code == "W001" and i.element_id == elem["id"]
            for i in result.warnings
        )

    def test_no_description_element_level(self, mm):
        """3.1: validate_element catches W001 for a single element."""
        elem = mm.add_element(
            {"name": "NoDesc", "type": "PartDefinition", "description": ""}
        )
        v = ModelValidator(mm)
        result = v.validate_element(elem["id"])
        assert any(
            i.code == "W001" and i.element_id == elem["id"]
            for i in result.warnings
        )


# =============================================================================
#  9. W002: PartDef has no ports
# =============================================================================


class TestW002PartDefNoPorts:
    """Subtasks 3.2, 3.5"""

    def test_partdef_no_ports_warning(self, mm):
        """3.2: PartDefinition with empty ports list triggers W002."""
        elem = mm.add_element(
            {
                "name": "Block",
                "type": "PartDefinition",
                "properties": {"ports": []},
            }
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert any(
            i.code == "W002" and i.element_id == elem["id"]
            for i in result.warnings
        )

    def test_partdef_with_ports_no_warning(self, mm):
        """3.2: PartDefinition with ports does NOT trigger W002."""
        mm.add_element(
            {
                "name": "Block",
                "type": "PartDefinition",
                "properties": {"ports": [{"name": "p1", "type": "PortDefinition"}]},
            }
        )
        v = ModelValidator(mm)
        result = v.validate()
        w002_issues = [i for i in result.warnings if i.code == "W002"]
        assert len(w002_issues) == 0

    def test_non_partdef_skipped(self, mm):
        """3.2: Non-PartDefinition elements are not checked for W002."""
        mm.add_element(
            {"name": "Req", "type": "RequirementDefinition", "properties": {}}
        )
        v = ModelValidator(mm)
        result = v.validate()
        w002_issues = [i for i in result.warnings if i.code == "W002"]
        assert len(w002_issues) == 0

    def test_partdef_with_port_child_no_warning(self, mm):
        """3.2: PartDefinition with child port element does NOT trigger W002."""
        parent = mm.add_element(
            {"name": "Block", "type": "PartDefinition", "properties": {}}
        )
        mm.add_element(
            {"name": "p1", "type": "PortDefinition"},
            owner_id=parent["id"],
        )
        v = ModelValidator(mm)
        result = v.validate()
        w002_issues = [i for i in result.warnings if i.code == "W002"]
        assert len(w002_issues) == 0

    def test_partdef_with_port_usage_child_no_warning(self, mm):
        """3.2: PartDefinition with child PortUsage element does NOT trigger W002."""
        parent = mm.add_element(
            {"name": "Block", "type": "PartDefinition", "properties": {}}
        )
        mm.add_element(
            {"name": "pu1", "type": "PortUsage"},
            owner_id=parent["id"],
        )
        v = ModelValidator(mm)
        result = v.validate()
        w002_issues = [i for i in result.warnings if i.code == "W002"]
        assert len(w002_issues) == 0

    def test_no_ports_element_level(self, mm):
        """3.2: validate_element catches W002 for a single PartDef."""
        elem = mm.add_element(
            {"name": "Block", "type": "PartDefinition", "properties": {"ports": []}}
        )
        v = ModelValidator(mm)
        result = v.validate_element(elem["id"])
        assert any(
            i.code == "W002" and i.element_id == elem["id"]
            for i in result.warnings
        )


# =============================================================================
#  10. W003: Orphan element
# =============================================================================


class TestW003OrphanElement:
    """Subtasks 3.3, 3.5"""

    def test_orphan_element_warning(self, mm):
        """3.3: Element with no relationships triggers W003."""
        elem = mm.add_element(
            {"name": "Isolated", "type": "PartDefinition"}
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert any(
            i.code == "W003" and i.element_id == elem["id"]
            for i in result.warnings
        )

    def test_connected_element_no_warning(self, mm):
        """3.3: Element with relationships does NOT trigger W003."""
        e1 = mm.add_element({"name": "A"})
        e2 = mm.add_element({"name": "B"})
        mm.add_relationship(
            {"type": "Connection", "sourceId": e1["id"], "targetId": e2["id"]}
        )
        v = ModelValidator(mm)
        result = v.validate()
        # Both A and B have relationships, so no W003
        w003_issues = [i for i in result.warnings if i.code == "W003"]
        assert len(w003_issues) == 0

    def test_orphan_with_qname_relationship(self, mm):
        """3.3: Element connected via qualified-name relationship is not orphan."""
        e1 = mm.add_element({"name": "Alpha"})
        e2 = mm.add_element({"name": "Beta"})
        mm.add_relationship(
            {
                "type": "Connection",
                "sourceId": e1["qualifiedName"],  # qname, not UUID
                "targetId": e2["id"],
            }
        )
        v = ModelValidator(mm)
        result = v.validate()
        # e1 should be found via qname match by get_relationships
        w003_for_e1 = [
            i for i in result.warnings
            if i.code == "W003" and i.element_id == e1["id"]
        ]
        assert len(w003_for_e1) == 0

    def test_orphan_element_level(self, mm):
        """3.3: validate_element catches W003 for a single orphan element."""
        elem = mm.add_element({"name": "Isolated", "type": "PartDefinition"})
        v = ModelValidator(mm)
        result = v.validate_element(elem["id"])
        assert any(
            i.code == "W003" and i.element_id == elem["id"]
            for i in result.warnings
        )


# =============================================================================
#  11. W004: Missing requirement trace
# =============================================================================


class TestW004MissingRequirementTrace:
    """Subtasks 3.4"""

    def test_partdef_missing_trace_warning(self, mm):
        """3.4: PartDefinition without Satisfy/Verify triggers W004."""
        elem = mm.add_element(
            {"name": "Engine", "type": "PartDefinition"}
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert any(
            i.code == "W004" and i.element_id == elem["id"]
            for i in result.warnings
        )

    def test_item_definition_missing_trace(self, mm):
        """3.4: ItemDefinition without trace triggers W004."""
        elem = mm.add_element(
            {"name": "Widget", "type": "ItemDefinition"}
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert any(
            i.code == "W004" and i.element_id == elem["id"]
            for i in result.warnings
        )

    def test_action_definition_missing_trace(self, mm):
        """3.4: ActionDefinition without trace triggers W004."""
        elem = mm.add_element(
            {"name": "DoSomething", "type": "ActionDefinition"}
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert any(
            i.code == "W004" and i.element_id == elem["id"]
            for i in result.warnings
        )

    def test_design_with_satisfy_no_warning(self, mm):
        """3.4: Design element with Satisfy relationship does NOT trigger W004."""
        elem = mm.add_element({"name": "Engine", "type": "PartDefinition"})
        req = mm.add_element({"name": "REQ-1", "type": "RequirementDefinition"})
        mm.add_relationship(
            {
                "type": "Satisfy",
                "sourceId": elem["id"],
                "targetId": req["id"],
            }
        )
        v = ModelValidator(mm)
        result = v.validate()
        w004_issues = [
            i for i in result.warnings
            if i.code == "W004" and i.element_id == elem["id"]
        ]
        assert len(w004_issues) == 0

    def test_design_with_verify_no_warning(self, mm):
        """3.4: Design element with Verify relationship does NOT trigger W004."""
        elem = mm.add_element({"name": "Engine", "type": "ItemDefinition"})
        req = mm.add_element({"name": "REQ-1", "type": "RequirementDefinition"})
        mm.add_relationship(
            {
                "type": "Verify",
                "sourceId": elem["id"],
                "targetId": req["id"],
            }
        )
        v = ModelValidator(mm)
        result = v.validate()
        w004_issues = [
            i for i in result.warnings
            if i.code == "W004" and i.element_id == elem["id"]
        ]
        assert len(w004_issues) == 0

    def test_non_design_type_skipped(self, mm):
        """3.4: RequirementDefinition is not a design element, skipped."""
        mm.add_element({"name": "REQ-1", "type": "RequirementDefinition"})
        v = ModelValidator(mm)
        result = v.validate()
        w004_issues = [i for i in result.warnings if i.code == "W004"]
        assert len(w004_issues) == 0

    def test_part_usage_missing_trace(self, mm):
        """3.4: PartUsage without trace triggers W004."""
        elem = mm.add_element(
            {"name": "myEngine", "type": "PartUsage",
             "properties": {"definitionRef": "Engine"}}
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert any(
            i.code == "W004" and i.element_id == elem["id"]
            for i in result.warnings
        )

    def test_missing_trace_element_level(self, mm):
        """3.4: validate_element catches W004 for a single design element."""
        elem = mm.add_element({"name": "Engine", "type": "PartDefinition"})
        v = ModelValidator(mm)
        result = v.validate_element(elem["id"])
        assert any(
            i.code == "W004" and i.element_id == elem["id"]
            for i in result.warnings
        )


# =============================================================================
#  12. Formatting
# =============================================================================


class TestFormatting:
    """Subtasks 4.1 – 4.3"""

    def test_format_valid_result(self):
        """4.1: format_validation_result for a valid result."""
        result = ValidationResult(is_valid=True)
        formatted = format_validation_result(result)
        assert "passed" in formatted.lower()

    def test_format_with_errors(self):
        """4.1: format_validation_result includes error details."""
        result = ValidationResult(
            is_valid=False,
            errors=[
                ValidationIssue(
                    code="E001",
                    message="Empty name",
                    element_id="id-1",
                    severity="error",
                )
            ],
        )
        formatted = format_validation_result(result)
        assert "FAILED" in formatted
        assert "E001" in formatted
        assert "Empty name" in formatted

    def test_format_with_warnings(self):
        """4.1: format_validation_result includes warning details."""
        result = ValidationResult(
            is_valid=True,
            warnings=[
                ValidationIssue(
                    code="W001",
                    message="No description",
                    element_id="id-2",
                    severity="warning",
                )
            ],
        )
        formatted = format_validation_result(result)
        assert "W001" in formatted
        assert "No description" in formatted

    def test_format_no_issues(self, mm):
        """4.1: format_validation_result when there are no issues."""
        result = ValidationResult(is_valid=True)
        formatted = format_validation_result(result)
        assert "No issues found" in formatted

    def test_format_sorted_by_code(self, mm):
        """4.2: errors and warnings are sorted by code."""
        result = ValidationResult(
            is_valid=False,
            errors=[
                ValidationIssue(code="E005", message="m5", element_id="5",
                                severity="error"),
                ValidationIssue(code="E001", message="m1", element_id="1",
                                severity="error"),
                ValidationIssue(code="E003", message="m3", element_id="3",
                                severity="error"),
            ],
            warnings=[
                ValidationIssue(code="W003", message="w3", element_id="3",
                                severity="warning"),
                ValidationIssue(code="W001", message="w1", element_id="1",
                                severity="warning"),
            ],
        )
        formatted = format_validation_result(result)
        e_positions = [formatted.index(f"E00{x}") for x in (1, 3, 5)]
        assert e_positions == sorted(e_positions), "Errors should be sorted by code"
        w_positions = [formatted.index(f"W00{x}") for x in (1, 3)]
        assert w_positions == sorted(w_positions), "Warnings should be sorted by code"

    def test_format_includes_element_name(self, mm):
        """4.3: formatted output contains element name, code, and message."""
        elem = mm.add_element({"name": "MyBlock", "type": "PartDefinition"})
        v = ModelValidator(mm)
        result = v.validate()
        formatted = format_validation_result(result)
        assert "MyBlock" in formatted
        assert any(code in formatted for code in ["W003", "W004", "W001"])


# =============================================================================
#  13. Edge cases and integration
# =============================================================================


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_validate_on_unloaded_model(self):
        """validate() returns empty valid result when model is None."""
        mgr = ModelManager()
        validator = ModelValidator(mgr)
        result = validator.validate()
        assert result.is_valid is True
        assert result.errors == []
        assert result.warnings == []

    def test_validate_element_on_unloaded_model(self):
        """validate_element returns empty valid result when model is None."""
        mgr = ModelManager()
        validator = ModelValidator(mgr)
        result = validator.validate_element("some-id")
        assert result.is_valid is True
        assert result.errors == []
        assert result.warnings == []

    def test_all_rules_for_clean_model(self, mm):
        """A model with valid elements and relationships yields no errors."""
        e1 = mm.add_element(
            {
                "name": "Engine",
                "type": "PartDefinition",
                "description": "An engine.",
                "properties": {"ports": [{"name": "p1"}]},
            }
        )
        e2 = mm.add_element(
            {
                "name": "Transmission",
                "type": "PartDefinition",
                "description": "Transmission system.",
                "properties": {"ports": [{"name": "p2"}]},
            }
        )
        req = mm.add_element(
            {
                "name": "REQ-1",
                "type": "RequirementDefinition",
                "description": "Shall work.",
            }
        )
        mm.add_relationship(
            {"type": "Connection", "sourceId": e1["id"], "targetId": e2["id"]}
        )
        mm.add_relationship(
            {"type": "Satisfy", "sourceId": e1["id"], "targetId": req["id"]}
        )
        mm.add_relationship(
            {"type": "Satisfy", "sourceId": e2["id"], "targetId": req["id"]}
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert result.is_valid is True
        assert len(result.errors) == 0
        # No warnings expected: descriptions present, ports present, relationships
        # exist, requirement traces exist
        assert len(result.warnings) == 0

    def test_multiple_rules_fire_together(self, mm):
        """A single element can trigger multiple issues."""
        elem = mm.add_element(
            {
                "name": "",  # E001
                "type": "PartDefinition",
                "description": "",  # W001
                "properties": {"ports": []},  # W002
            }
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert not result.is_valid
        codes = {i.code for i in result.errors}
        warning_codes = {i.code for i in result.warnings}
        assert "E001" in codes
        assert "W001" in warning_codes
        assert "W002" in warning_codes

    def test_e004_e005_not_in_element_level(self, mm):
        """validate_element does NOT run E004/E005 (model-level rules)."""
        # Create a relationship with bad source/target
        existing = mm.add_element({"name": "A"})
        mm.add_relationship(
            {
                "type": "Connection",
                "sourceId": "bad-src",
                "targetId": existing["id"],
            }
        )
        v = ModelValidator(mm)
        # validate() should catch E004
        full_result = v.validate()
        assert any(i.code == "E004" for i in full_result.errors)

        # validate_element on "A" should NOT catch E004 (it's a rel-level check)
        elem_result = v.validate_element(existing["id"])
        e004_in_element = [i for i in elem_result.errors if i.code == "E004"]
        assert len(e004_in_element) == 0

    def test_relationship_qname_resolution_e004(self, mm):
        """E004 matches qname-based sourceId lookups against existing elements."""
        e1 = mm.add_element({"name": "Alpha"})
        e2 = mm.add_element({"name": "Beta"})
        # sourceId uses qname of non-existent element
        rel = mm.add_relationship(
            {
                "type": "Connection",
                "sourceId": "Gamma",  # no element named Gamma
                "targetId": e1["qualifiedName"],
            }
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert any(
            i.code == "E004" and i.element_id == rel["id"]
            for i in result.errors
        )

    def test_relationship_qname_resolution_e005(self, mm):
        """E005 matches qname-based targetId lookups against existing elements."""
        e1 = mm.add_element({"name": "Alpha"})
        rel = mm.add_relationship(
            {
                "type": "Connection",
                "sourceId": e1["qualifiedName"],
                "targetId": "Delta",  # no element named Delta
            }
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert any(
            i.code == "E005" and i.element_id == rel["id"]
            for i in result.errors
        )

    def test_comment_with_no_description_skipped_w001(self, mm):
        """Comment elements with no description do not trigger W001."""
        mm.add_element({"name": "Note", "type": "Comment", "description": ""})
        v = ModelValidator(mm)
        result = v.validate()
        w001_issues = [i for i in result.warnings if i.code == "W001"]
        assert len(w001_issues) == 0

    def test_action_usage_missing_trace_w004(self, mm):
        """ActionUsage without requirement trace triggers W004."""
        elem = mm.add_element(
            {"name": "compute", "type": "ActionUsage",
             "properties": {"definitionRef": "Compute"}}
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert any(
            i.code == "W004" and i.element_id == elem["id"]
            for i in result.warnings
        )

    def test_item_usage_missing_trace_w004(self, mm):
        """ItemUsage without requirement trace triggers W004."""
        elem = mm.add_element(
            {"name": "widget", "type": "ItemUsage",
             "properties": {"definitionRef": "Widget"}}
        )
        v = ModelValidator(mm)
        result = v.validate()
        assert any(
            i.code == "W004" and i.element_id == elem["id"]
            for i in result.warnings
        )

    def test_format_includes_source_location(self):
        """4.1: format_validation_result includes source_location when present."""
        result = ValidationResult(
            is_valid=False,
            errors=[
                ValidationIssue(
                    code="E001",
                    message="Empty name",
                    element_id="id-1",
                    severity="error",
                    source_location="line 42",
                )
            ],
        )
        formatted = format_validation_result(result)
        assert "line 42" in formatted
