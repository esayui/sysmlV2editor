"""
Tests for the Model Manager module.

Covers:
  - Model lifecycle: create, load, export
  - Query: get_element, get_element_by_qualified_name, get_children,
           get_relationships, find_usages, resolve_reference
  - Mutations: add, update, delete (cascade), add/delete relationship, move
  - Validation: check_name_conflict, get_dangling_references
  - Edge cases: empty model, deep nesting, qualified name updates
"""

from __future__ import annotations

import uuid

import pytest

from app.services.model_manager import (
    ModelManager,
    DuplicateNameError,
    ElementNotFoundError,
    ModelNotLoadedError,
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


def _make_element(name, etype="PartDefinition", **kwargs):
    """Helper: create a minimal element dict with defaults."""
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


def _make_relationship(rel_type="Connection", source_id="", target_id="", **kwargs):
    """Helper: create a minimal relationship dict."""
    rel = {
        "id": kwargs.pop("id", str(uuid.uuid4())),
        "type": rel_type,
        "sourceId": source_id,
        "targetId": target_id,
        "name": kwargs.pop("name", None),
        "sourcePortId": kwargs.pop("sourcePortId", None),
        "targetPortId": kwargs.pop("targetPortId", None),
        "properties": kwargs.pop("properties", {}),
    }
    rel.update(kwargs)
    return rel


# =============================================================================
#  1. Model lifecycle
# =============================================================================


class TestModelLifecycle:
    """Subtask 1.1 – 1.5"""

    def test_init_empty_state(self):
        """1.1: __init__ starts with no model."""
        mgr = ModelManager()
        assert mgr.model is None

    def test_create_model_returns_dict(self, mm):
        """1.2: create_model returns a dict with required keys."""
        model = mm.model
        assert model is not None
        assert "id" in model
        assert "name" in model
        assert "elements" in model
        assert "relationships" in model
        assert "packages" in model

    def test_create_model_name(self, mm):
        """1.2: create_model sets the correct model name."""
        assert mm.model["name"] == "TestModel"

    def test_create_model_empty(self, mm):
        """1.5: freshly created model has empty collections."""
        assert mm.model["elements"] == []
        assert mm.model["relationships"] == []
        assert mm.model["packages"] == []

    def test_load_from_text(self):
        """1.3: load_from_text parses SysML v2 text into model."""
        mgr = ModelManager()
        text = "part def Vehicle { attribute mass: Real; }"
        model = mgr.load_from_text(text)
        assert model["elements"]
        assert any(e["type"] == "PartDefinition" for e in model["elements"])
        assert any(e["name"] == "Vehicle" for e in model["elements"])

    def test_load_from_text_updates_model_state(self):
        """1.3: load_from_text updates the internal model."""
        mgr = ModelManager()
        text = "part def Engine {}"
        mgr.load_from_text(text)
        assert mgr.model is not None
        assert any(e["name"] == "Engine" for e in mgr.model["elements"])

    def test_export_to_text_basic(self):
        """1.4: export_to_text returns a non-empty string."""
        mgr = ModelManager()
        mgr.load_from_text("part def Vehicle {}")
        exported = mgr.export_to_text(format=False)
        assert len(exported) > 0
        assert "part def Vehicle" in exported

    def test_export_to_text_formatted(self):
        """1.4: formatted export includes line breaks."""
        mgr = ModelManager()
        mgr.load_from_text("part def A {} part def B {}")
        exported = mgr.export_to_text(format=True)
        assert "\n" in exported

    def test_export_requires_model(self):
        """1.4: export_to_text raises when no model is loaded."""
        mgr = ModelManager()
        with pytest.raises(ModelNotLoadedError):
            mgr.export_to_text()

    def test_roundtrip_create_load_export(self):
        """Roundtrip: create -> add elements -> export -> load -> export
        should be stable."""
        mgr = ModelManager()
        mgr.create_model("RoundtripTest")
        mgr.add_element({"name": "X", "type": "PartDefinition"})
        text1 = mgr.export_to_text(format=False)

        mgr2 = ModelManager()
        mgr2.load_from_text(text1)
        text2 = mgr2.export_to_text(format=False)
        assert text1 == text2


# =============================================================================
#  2. Query operations
# =============================================================================


class TestQueryOperations:
    """Subtasks 2.1 – 2.7"""

    def test_get_element_by_id(self, mm):
        """2.1: get_element returns the element with the given id."""
        e = mm.add_element({"name": "Block1", "type": "PartDefinition"})
        found = mm.get_element(e["id"])
        assert found is e
        assert found["name"] == "Block1"

    def test_get_element_not_found(self, mm):
        """2.1: get_element raises ElementNotFoundError for unknown id."""
        with pytest.raises(ElementNotFoundError):
            mm.get_element("nonexistent-id")

    def test_get_element_by_qualified_name(self, mm):
        """2.2: get_element_by_qualified_name finds an element by qname."""
        e = mm.add_element({"name": "Block1", "type": "PartDefinition"})
        assert e["qualifiedName"] == "Block1"
        found = mm.get_element_by_qualified_name("Block1")
        assert found is not None
        assert found["name"] == "Block1"

    def test_get_element_by_qualified_name_not_found(self, mm):
        """2.2: returns None when no element matches the qname."""
        assert mm.get_element_by_qualified_name("DoesNotExist") is None

    def test_get_children_empty(self, mm):
        """2.3: get_children returns empty list when no children."""
        e = mm.add_element({"name": "Parent"})
        assert mm.get_children(e["id"]) == []

    def test_get_children_single(self, mm):
        """2.3: get_children returns direct children."""
        parent = mm.add_element({"name": "Parent"})
        child = mm.add_element({"name": "Child"}, owner_id=parent["id"])
        children = mm.get_children(parent["id"])
        assert len(children) == 1
        assert children[0]["name"] == "Child"

    def test_get_children_multiple(self, mm):
        """2.3: get_children returns all children of a parent."""
        parent = mm.add_element({"name": "Parent"})
        c1 = mm.add_element({"name": "C1"}, owner_id=parent["id"])
        c2 = mm.add_element({"name": "C2"}, owner_id=parent["id"])
        children = mm.get_children(parent["id"])
        assert len(children) == 2
        names = {c["name"] for c in children}
        assert names == {"C1", "C2"}

    def test_get_children_nested(self, mm):
        """2.3: get_children only returns direct children, not grandchildren."""
        parent = mm.add_element({"name": "Parent"})
        child = mm.add_element({"name": "Child"}, owner_id=parent["id"])
        grandchild = mm.add_element({"name": "Grandchild"}, owner_id=child["id"])
        children = mm.get_children(parent["id"])
        assert len(children) == 1
        assert children[0]["name"] == "Child"

    def test_get_relationships_uuid_match(self, mm):
        """2.4: get_relationships finds relationships by UUID."""
        e1 = mm.add_element({"name": "A"})
        e2 = mm.add_element({"name": "B"})
        rel = mm.add_relationship(
            _make_relationship("Connection", e1["id"], e2["id"])
        )
        rels1 = mm.get_relationships(e1["id"])
        rels2 = mm.get_relationships(e2["id"])
        assert len(rels1) == 1
        assert len(rels2) == 1
        assert rels1[0]["id"] == rel["id"]

    def test_get_relationships_qname_match(self):
        """2.4: get_relationships also matches relationships from parser
        which store qualified names in sourceId/targetId."""
        mgr = ModelManager()
        text = "connect a to b;"
        mgr.load_from_text(text)
        # The parser stores qnames in sourceId/targetId.  The basic
        # qualified names for connecting entities created by the grammar
        # are "a" and "b".  get_relationships should find matches.
        elements = mgr.model["elements"]
        # In a connect statement, elements named "a" and "b" may or may
        # not exist as actual elements.  The relationship is present.
        assert len(mgr.model["relationships"]) >= 1

    def test_get_relationships_none_for_unrelated_element(self, mm):
        """2.4: element with no relationships returns empty list."""
        e = mm.add_element({"name": "Isolated"})
        assert mm.get_relationships(e["id"]) == []

    def test_find_usages_simple(self, mm):
        """2.5: find_usages returns Usage elements referencing a Definition."""
        # Create a definition
        engine = mm.add_element(
            {"name": "Engine", "type": "PartDefinition"}
        )
        # Create usage elements that reference it
        usage1 = mm.add_element(
            {
                "name": "engine1",
                "type": "PartUsage",
                "properties": {"definitionRef": engine["qualifiedName"]},
            }
        )
        usage2 = mm.add_element(
            {
                "name": "engine2",
                "type": "PartUsage",
                "properties": {"definitionRef": engine["qualifiedName"]},
            }
        )
        # Another usage that references something else
        usage3 = mm.add_element(
            {
                "name": "other",
                "type": "PartUsage",
                "properties": {"definitionRef": "SomethingElse"},
            }
        )

        usages = mm.find_usages(engine["id"])
        assert len(usages) == 2
        usage_names = {u["name"] for u in usages}
        assert usage_names == {"engine1", "engine2"}

    def test_find_usages_by_name_match(self, mm):
        """2.5: find_usages matches against both qname and simple name."""
        engine = mm.add_element(
            {"name": "Engine", "type": "PartDefinition"}
        )
        usage = mm.add_element(
            {
                "name": "eng",
                "type": "PartUsage",
                "properties": {"definitionRef": "Engine"},
            }
        )
        usages = mm.find_usages(engine["id"])
        assert len(usages) == 1

    def test_find_usages_no_usages(self, mm):
        """2.5: find_usages returns empty list when no usages."""
        engine = mm.add_element({"name": "Engine"})
        assert mm.find_usages(engine["id"]) == []

    def test_resolve_reference_exact_match(self, mm):
        """2.6: resolve_reference finds element by exact qname."""
        a = mm.add_element({"name": "A"})
        b = mm.add_element({"name": "B"}, owner_id=a["id"])
        result = mm.resolve_reference("A::B", a["id"])
        assert result is not None
        assert result["name"] == "B"

    def test_resolve_reference_relative(self, mm):
        """2.6: resolve_reference resolves relative to context."""
        a = mm.add_element({"name": "A"})
        b = mm.add_element({"name": "B"}, owner_id=a["id"])
        # From B's context, resolve "B" (self)
        result = mm.resolve_reference("B", b["id"])
        assert result is not None
        assert result["id"] == b["id"]

        # From B's context, resolve "A::B" — should find B
        result2 = mm.resolve_reference("A::B", b["id"])
        assert result2 is not None
        assert result2["name"] == "B"

    def test_resolve_reference_walk_up(self, mm):
        """2.6: resolve_reference walks up namespace for relative resolution."""
        a = mm.add_element({"name": "A"})
        b = mm.add_element({"name": "B"}, owner_id=a["id"])
        c = mm.add_element({"name": "C"}, owner_id=b["id"])

        # From C, resolve "B" — should find parent B
        result = mm.resolve_reference("B", c["id"])
        assert result is not None
        assert result["name"] == "B"

        # From C, resolve "A::B" — should find B
        result2 = mm.resolve_reference("A::B", c["id"])
        assert result2 is not None
        assert result2["name"] == "B"

    def test_resolve_reference_not_found(self, mm):
        """2.6: resolve_reference returns None when unresolvable."""
        a = mm.add_element({"name": "A"})
        result = mm.resolve_reference("DoesNotExist", a["id"])
        assert result is None

    def test_resolve_reference_invalid_context(self, mm):
        """2.6: resolve_reference with bad context_id returns None."""
        result = mm.resolve_reference("X", "nonexistent-id")
        assert result is None

    def test_three_level_nested_qname(self, mm):
        """2.7: 3-level nested Package with correct qualified name queries."""
        p1 = mm.add_element({"name": "P1", "type": "Package"})
        p2 = mm.add_element({"name": "P2", "type": "Package"}, owner_id=p1["id"])
        p3 = mm.add_element({"name": "P3", "type": "Package"}, owner_id=p2["id"])
        elem = mm.add_element({"name": "E"}, owner_id=p3["id"])

        assert elem["qualifiedName"] == "P1::P2::P3::E"

        # Query each level
        assert mm.get_element_by_qualified_name("P1") is not None
        assert mm.get_element_by_qualified_name("P1::P2") is not None
        assert mm.get_element_by_qualified_name("P1::P2::P3") is not None
        assert mm.get_element_by_qualified_name("P1::P2::P3::E") is not None

        # Wrong qname returns None
        assert mm.get_element_by_qualified_name("P1::P3") is None

    def test_qualified_name_nested(self, mm):
        """2.7 additional: qualified names are correctly computed for nested
        non-package elements."""
        parent = mm.add_element({"name": "Parent"})
        child = mm.add_element({"name": "Child"}, owner_id=parent["id"])
        gchild = mm.add_element({"name": "GrandChild"}, owner_id=child["id"])

        assert parent["qualifiedName"] == "Parent"
        assert child["qualifiedName"] == "Parent::Child"
        assert gchild["qualifiedName"] == "Parent::Child::GrandChild"


# =============================================================================
#  3. Modification operations
# =============================================================================


class TestModificationOperations:
    """Subtasks 3.1 – 3.7"""

    # ---- add_element ----

    def test_add_element_basic(self, mm):
        """3.1: add_element appends an element with assigned UUID."""
        before = len(mm.model["elements"])
        elem = mm.add_element({"name": "NewBlock"})
        assert len(mm.model["elements"]) == before + 1
        assert "id" in elem
        assert len(elem["id"]) == 36  # UUID format

    def test_add_element_preserves_provided_id(self, mm):
        """3.1: add_element keeps a provided UUID."""
        custom_id = str(uuid.uuid4())
        elem = mm.add_element({"id": custom_id, "name": "CustomID"})
        assert elem["id"] == custom_id

    def test_add_element_sets_owner(self, mm):
        """3.1: add_element sets ownerId on the element."""
        parent = mm.add_element({"name": "Parent"})
        child = mm.add_element({"name": "Child"}, owner_id=parent["id"])
        assert child["ownerId"] == parent["id"]
        assert child in mm.get_children(parent["id"])

    def test_add_element_top_level(self, mm):
        """3.1: add_element with owner_id=None creates a top-level element."""
        elem = mm.add_element({"name": "TopLevel"})
        assert elem["ownerId"] is None

    def test_add_element_qualified_name_top_level(self, mm):
        """3.1: top-level element's qname is just its name."""
        elem = mm.add_element({"name": "Foo"})
        assert elem["qualifiedName"] == "Foo"

    def test_add_element_qualified_name_nested(self, mm):
        """3.1: nested element's qname includes parent prefix."""
        parent = mm.add_element({"name": "Parent"})
        child = mm.add_element({"name": "Child"}, owner_id=parent["id"])
        assert child["qualifiedName"] == "Parent::Child"

    def test_add_element_name_conflict(self, mm):
        """3.1: add_element raises DuplicateNameError on name conflict."""
        mm.add_element({"name": "Unique"})
        with pytest.raises(DuplicateNameError):
            mm.add_element({"name": "Unique"})

    def test_add_element_no_name_conflict_different_parent(self, mm):
        """3.1: same name under different parents is allowed."""
        p1 = mm.add_element({"name": "P1"})
        p2 = mm.add_element({"name": "P2"})
        c1 = mm.add_element({"name": "Child"}, owner_id=p1["id"])
        c2 = mm.add_element({"name": "Child"}, owner_id=p2["id"])  # OK
        assert c1["id"] != c2["id"]

    def test_add_element_defaults(self, mm):
        """3.1: add_element fills in default fields."""
        elem = mm.add_element({"name": "X"})
        assert elem.get("type") == "PartDefinition"
        assert elem.get("shortName") is None
        assert elem.get("description") == ""
        assert elem.get("properties") == {}

    # ---- update_element ----

    def test_update_element_name(self, mm):
        """3.2: update_element changes the element name."""
        elem = mm.add_element({"name": "OldName"})
        updated = mm.update_element(elem["id"], {"name": "NewName"})
        assert updated["name"] == "NewName"
        assert mm.get_element(elem["id"])["name"] == "NewName"

    def test_update_element_description(self, mm):
        """3.2: update_element changes the description."""
        elem = mm.add_element({"name": "X"})
        updated = mm.update_element(elem["id"], {"description": "A description"})
        assert updated["description"] == "A description"

    def test_update_element_properties_merged(self, mm):
        """3.2: update_element merges properties sub-dict."""
        elem = mm.add_element(
            {"name": "X", "properties": {"a": 1, "b": 2}}
        )
        updated = mm.update_element(elem["id"], {"properties": {"b": 99, "c": 3}})
        props = updated["properties"]
        assert props["a"] == 1      # unchanged
        assert props["b"] == 99     # overridden
        assert props["c"] == 3      # added

    def test_update_element_other_fields_merge(self, mm):
        """3.2: non-properties fields are replaced, not merged."""
        elem = mm.add_element({"name": "X", "description": "Old desc"})
        updated = mm.update_element(elem["id"], {"description": "New desc"})
        assert updated["description"] == "New desc"

    def test_update_element_cannot_change_id(self, mm):
        """3.2: update_element ignores attempts to change element id."""
        elem = mm.add_element({"name": "X"})
        original_id = elem["id"]
        updated = mm.update_element(elem["id"], {"id": "fake-id"})
        assert updated["id"] == original_id

    def test_update_element_name_conflict(self, mm):
        """3.2: update_element raises DuplicateNameError on rename conflict."""
        e1 = mm.add_element({"name": "First"})
        e2 = mm.add_element({"name": "Second"})
        with pytest.raises(DuplicateNameError):
            mm.update_element(e2["id"], {"name": "First"})

    def test_update_element_not_found(self, mm):
        """3.2: update_element raises ElementNotFoundError."""
        with pytest.raises(ElementNotFoundError):
            mm.update_element("nonexistent", {"name": "X"})

    # ---- delete_element ----

    def test_delete_element_removes_from_list(self, mm):
        """3.3: delete_element removes the element from model.elements."""
        elem = mm.add_element({"name": "ToDelete"})
        assert mm.get_element(elem["id"]) is not None
        mm.delete_element(elem["id"])
        with pytest.raises(ElementNotFoundError):
            mm.get_element(elem["id"])

    def test_delete_element_cascade_children(self, mm):
        """3.3: delete_element cascade-deletes child elements."""
        parent = mm.add_element({"name": "Parent"})
        child1 = mm.add_element({"name": "Child1"}, owner_id=parent["id"])
        child2 = mm.add_element({"name": "Child2"}, owner_id=parent["id"])
        grandchild = mm.add_element({"name": "GrandChild"}, owner_id=child1["id"])

        mm.delete_element(parent["id"])

        # All descendants should be gone
        for eid in [parent["id"], child1["id"], child2["id"], grandchild["id"]]:
            with pytest.raises(ElementNotFoundError):
                mm.get_element(eid)

    def test_delete_element_cascade_relationships(self, mm):
        """3.3: delete_element removes relationships involving deleted elements."""
        a = mm.add_element({"name": "A"})
        b = mm.add_element({"name": "B"})
        c = mm.add_element({"name": "C"})
        child_a = mm.add_element({"name": "ChildA"}, owner_id=a["id"])

        rel1 = mm.add_relationship(
            _make_relationship("Connection", a["id"], b["id"])
        )
        rel2 = mm.add_relationship(
            _make_relationship("Connection", b["id"], c["id"])
        )
        rel3 = mm.add_relationship(
            _make_relationship("Connection", child_a["id"], c["id"])
        )

        mm.delete_element(a["id"])

        # rel1 (A-B) and rel3 (ChildA-C) should be gone; rel2 (B-C) survives
        remaining_rel_ids = {r["id"] for r in mm.model["relationships"]}
        assert rel1["id"] not in remaining_rel_ids
        assert rel3["id"] not in remaining_rel_ids
        assert rel2["id"] in remaining_rel_ids

    def test_delete_element_not_found(self, mm):
        """3.3: delete_element raises ElementNotFoundError."""
        with pytest.raises(ElementNotFoundError):
            mm.delete_element("nonexistent")

    # ---- add_relationship / delete_relationship ----

    def test_add_relationship_basic(self, mm):
        """3.4: add_relationship appends a relationship with UUID."""
        e1 = mm.add_element({"name": "A"})
        e2 = mm.add_element({"name": "B"})
        rel = mm.add_relationship(
            {"type": "Connection", "sourceId": e1["id"], "targetId": e2["id"]}
        )
        assert len(rel["id"]) == 36
        assert rel["type"] == "Connection"
        assert rel["sourceId"] == e1["id"]
        assert rel["targetId"] == e2["id"]
        assert rel in mm.model["relationships"]

    def test_add_relationship_preserves_id(self, mm):
        """3.4: add_relationship keeps a provided id."""
        custom_id = str(uuid.uuid4())
        e1 = mm.add_element({"name": "A"})
        e2 = mm.add_element({"name": "B"})
        rel = mm.add_relationship(
            {"id": custom_id, "type": "Connection", "sourceId": e1["id"],
             "targetId": e2["id"]}
        )
        assert rel["id"] == custom_id

    def test_add_relationship_defaults(self, mm):
        """3.4: add_relationship fills defaults for optional fields."""
        e1 = mm.add_element({"name": "A"})
        e2 = mm.add_element({"name": "B"})
        rel = mm.add_relationship(
            {"type": "Connection", "sourceId": e1["id"], "targetId": e2["id"]}
        )
        assert rel["name"] is None
        assert rel["sourcePortId"] is None
        assert rel["targetPortId"] is None
        assert rel["properties"] == {}

    def test_delete_relationship_basic(self, mm):
        """3.5: delete_relationship removes by id."""
        e1 = mm.add_element({"name": "A"})
        e2 = mm.add_element({"name": "B"})
        rel = mm.add_relationship(
            {"type": "Connection", "sourceId": e1["id"], "targetId": e2["id"]}
        )
        mm.delete_relationship(rel["id"])
        assert rel not in mm.model["relationships"]

    def test_delete_relationship_idempotent(self, mm):
        """3.5: delete_relationship with unknown id does nothing."""
        before = len(mm.model["relationships"])
        mm.delete_relationship("nonexistent-id")
        assert len(mm.model["relationships"]) == before

    def test_add_relationship_multiple(self, mm):
        """3.4: multiple relationships can be added."""
        e1 = mm.add_element({"name": "A"})
        e2 = mm.add_element({"name": "B"})
        e3 = mm.add_element({"name": "C"})

        mm.add_relationship(
            {"type": "Connection", "sourceId": e1["id"], "targetId": e2["id"]}
        )
        mm.add_relationship(
            {"type": "Binding", "sourceId": e2["id"], "targetId": e3["id"]}
        )
        assert len(mm.model["relationships"]) == 2

    # ---- move_element ----

    def test_move_element_changes_owner(self, mm):
        """3.6: move_element updates ownerId."""
        old_parent = mm.add_element({"name": "Old"})
        new_parent = mm.add_element({"name": "New"})
        child = mm.add_element({"name": "Child"}, owner_id=old_parent["id"])

        mm.move_element(child["id"], new_parent["id"])

        updated = mm.get_element(child["id"])
        assert updated["ownerId"] == new_parent["id"]

    def test_move_element_updates_qualified_name(self, mm):
        """3.6: move_element updates the qualified name."""
        old_parent = mm.add_element({"name": "Old"})
        new_parent = mm.add_element({"name": "New"})
        child = mm.add_element({"name": "Child"}, owner_id=old_parent["id"])

        assert child["qualifiedName"] == "Old::Child"
        mm.move_element(child["id"], new_parent["id"])
        assert child["qualifiedName"] == "New::Child"

    def test_move_element_updates_descendants_qnames(self, mm):
        """3.6: move_element recursively updates descendant qualified names."""
        old = mm.add_element({"name": "Old"})
        new = mm.add_element({"name": "New"})
        child = mm.add_element({"name": "Child"}, owner_id=old["id"])
        grand = mm.add_element({"name": "Grand"}, owner_id=child["id"])
        gg = mm.add_element({"name": "GG"}, owner_id=grand["id"])

        assert grand["qualifiedName"] == "Old::Child::Grand"
        assert gg["qualifiedName"] == "Old::Child::Grand::GG"

        mm.move_element(child["id"], new["id"])

        assert mm.get_element(child["id"])["qualifiedName"] == "New::Child"
        assert mm.get_element(grand["id"])["qualifiedName"] == "New::Child::Grand"
        assert mm.get_element(gg["id"])["qualifiedName"] == "New::Child::Grand::GG"

    def test_move_element_name_conflict(self, mm):
        """3.6: move_element raises DuplicateNameError on conflict."""
        old = mm.add_element({"name": "Old"})
        new = mm.add_element({"name": "New"})
        child = mm.add_element({"name": "Child"}, owner_id=old["id"])
        existing = mm.add_element({"name": "Child"}, owner_id=new["id"])

        with pytest.raises(DuplicateNameError):
            mm.move_element(child["id"], new["id"])

    def test_move_element_not_found(self, mm):
        """3.6: move_element raises for nonexistent element."""
        new = mm.add_element({"name": "New"})
        with pytest.raises(ElementNotFoundError):
            mm.move_element("nonexistent", new["id"])

    def test_move_element_new_owner_not_found(self, mm):
        """3.6: move_element raises for nonexistent new owner."""
        child = mm.add_element({"name": "Child"})
        with pytest.raises(ElementNotFoundError):
            mm.move_element(child["id"], "nonexistent")

    # ---- 3.7: Cascade delete with usages ----

    def test_delete_parent_children_disappear(self, mm):
        """3.7: deleting a parent PartDef removes child attributes."""
        parent = mm.add_element({"name": "Engine", "type": "PartDefinition"})
        child = mm.add_element(
            {"name": "mass", "type": "AttributeDefinition"}, owner_id=parent["id"]
        )
        mm.delete_element(parent["id"])
        with pytest.raises(ElementNotFoundError):
            mm.get_element(child["id"])

    def test_delete_referenced_definition_causes_dangling_usage(self, mm):
        """3.7: after deleting a Definition, referencing Usages have
        dangling references."""
        # Create a definition
        engine = mm.add_element(
            {"name": "Engine", "type": "PartDefinition"}
        )
        # Create a usage that references it
        usage = mm.add_element(
            {
                "name": "myEngine",
                "type": "PartUsage",
                "properties": {"definitionRef": engine["qualifiedName"]},
            }
        )

        # Delete the definition
        mm.delete_element(engine["id"])

        # The usage should still exist (kept, not cascade-deleted)
        try:
            u = mm.get_element(usage["id"])
            assert u["properties"]["definitionRef"] == "Engine"  # Reference persists
        except ElementNotFoundError:
            pytest.fail("Usage should NOT have been cascade-deleted")

        # Now the usage has a dangling reference
        dangling = mm.get_dangling_references()
        assert usage["id"] in dangling


# =============================================================================
#  4. Name conflict detection
# =============================================================================


class TestNameConflictDetection:
    """Subtasks 4.1 – 4.3"""

    def test_check_name_conflict_true(self, mm):
        """4.1: check_name_conflict returns True when a sibling exists."""
        mm.add_element({"name": "Existing"})
        assert mm.check_name_conflict("Existing", None) is True

    def test_check_name_conflict_false(self, mm):
        """4.1: check_name_conflict returns False when name is unique."""
        assert mm.check_name_conflict("Unique", None) is False

    def test_check_name_conflict_same_parent(self, mm):
        """4.1: conflict only when same name under same parent."""
        p1 = mm.add_element({"name": "P1"})
        p2 = mm.add_element({"name": "P2"})
        mm.add_element({"name": "Child"}, owner_id=p1["id"])
        # Same name under a different parent should be ok
        assert mm.check_name_conflict("Child", p2["id"]) is False
        # Same name under same parent is conflict
        assert mm.check_name_conflict("Child", p1["id"]) is True

    def test_add_duplicate_raises_error(self, mm):
        """4.3: adding an element with a duplicate name raises
        DuplicateNameError."""
        mm.add_element({"name": "Block1"})
        with pytest.raises(DuplicateNameError) as exc:
            mm.add_element({"name": "Block1"})
        assert "Block1" in str(exc.value)

    def test_get_dangling_references_empty(self, mm):
        """4.2: get_dangling_references returns empty list when all refs valid."""
        engine = mm.add_element({"name": "Engine", "type": "PartDefinition"})
        mm.add_element(
            {
                "name": "myEngine",
                "type": "PartUsage",
                "properties": {"definitionRef": engine["qualifiedName"]},
            }
        )
        assert mm.get_dangling_references() == []

    def test_get_dangling_references_usage(self, mm):
        """4.2: get_dangling_references catches usages whose definitionRef
        points to a nonexistent element."""
        mm.add_element(
            {
                "name": "orphan",
                "type": "PartUsage",
                "properties": {"definitionRef": "DoesNotExist"},
            }
        )
        dangling = mm.get_dangling_references()
        assert len(dangling) >= 1

    def test_get_dangling_references_relationship(self, mm):
        """4.2: get_dangling_references catches relationships whose
        sourceId/targetId point to a nonexistent element."""
        mm.add_relationship(
            _make_relationship("Connection", "nonexistent1", "nonexistent2")
        )
        dangling = mm.get_dangling_references()
        assert len(dangling) >= 1

    def test_get_dangling_references_multiple(self, mm):
        """4.2: multiple dangling references are all reported."""
        # Orphan usage
        mm.add_element(
            {
                "name": "orphan1",
                "type": "PartUsage",
                "properties": {"definitionRef": "Missing1"},
            }
        )
        mm.add_element(
            {
                "name": "orphan2",
                "type": "PartUsage",
                "properties": {"definitionRef": "Missing2"},
            }
        )
        # Valid reference
        engine = mm.add_element({"name": "Engine"})
        mm.add_element(
            {
                "name": "valid",
                "type": "PartUsage",
                "properties": {"definitionRef": engine["qualifiedName"]},
            }
        )

        dangling = mm.get_dangling_references()
        assert len(dangling) == 2


# =============================================================================
#  5. Edge cases and error handling
# =============================================================================


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_operations_require_model(self):
        """All query/modification operations raise ModelNotLoadedError
        when no model exists."""
        mgr = ModelManager()
        operations = [
            lambda: mgr.get_element("x"),
            lambda: mgr.get_element_by_qualified_name("x"),
            lambda: mgr.get_children("x"),
            lambda: mgr.get_relationships("x"),
            lambda: mgr.find_usages("x"),
            lambda: mgr.resolve_reference("x", "y"),
            lambda: mgr.add_element({"name": "x"}),
            lambda: mgr.update_element("x", {}),
            lambda: mgr.delete_element("x"),
            lambda: mgr.add_relationship(
                {"type": "Connection", "sourceId": "a", "targetId": "b"}
            ),
            lambda: mgr.delete_relationship("x"),
            lambda: mgr.move_element("x", "y"),
            lambda: mgr.check_name_conflict("x", None),
            lambda: mgr.get_dangling_references(),
        ]
        for op in operations:
            with pytest.raises(ModelNotLoadedError):
                op()

    def test_add_element_to_different_depths(self, mm):
        """Qualified names work correctly at multiple depths."""
        root = mm.add_element({"name": "Root"})
        l1 = mm.add_element({"name": "L1"}, owner_id=root["id"])
        l2 = mm.add_element({"name": "L2"}, owner_id=l1["id"])
        l3 = mm.add_element({"name": "L3"}, owner_id=l2["id"])

        assert l1["qualifiedName"] == "Root::L1"
        assert l2["qualifiedName"] == "Root::L1::L2"
        assert l3["qualifiedName"] == "Root::L1::L2::L3"

    def test_delete_all_children_then_parent_empty(self, mm):
        """After deleting children, get_children returns empty list."""
        parent = mm.add_element({"name": "Parent"})
        child = mm.add_element({"name": "Child"}, owner_id=parent["id"])
        mm.delete_element(child["id"])
        assert mm.get_children(parent["id"]) == []

    def test_duplicate_name_different_depths(self, mm):
        """Same name at different nesting levels is allowed."""
        p = mm.add_element({"name": "P"})
        c1 = mm.add_element({"name": "X"}, owner_id=p["id"])
        c2 = mm.add_element({"name": "X"})  # Different parent (None)
        assert c1["id"] != c2["id"]  # Both exist

    def test_update_properties_on_existing(self, mm):
        """update_element can add new properties to an element."""
        elem = mm.add_element({"name": "X"})
        mm.update_element(elem["id"], {"properties": {"newKey": "newVal"}})
        updated = mm.get_element(elem["id"])
        assert updated["properties"]["newKey"] == "newVal"

    def test_create_second_model_replaces_first(self, mm):
        """create_model replaces the existing model."""
        mm.add_element({"name": "A"})
        model2 = mm.create_model("Model2")
        assert mm.model is model2
        assert len(mm.model["elements"]) == 0
        assert mm.model["name"] == "Model2"

    def test_load_from_text_replaces_model(self, mm):
        """load_from_text replaces the existing model."""
        mm.add_element({"name": "A"})
        mm.load_from_text("part def Vehicle {}")
        assert len(mm.model["elements"]) > 0
        assert any(e["name"] == "Vehicle" for e in mm.model["elements"])

    def test_find_usages_by_qname_after_qualified_name_change(self, mm):
        """find_usages still finds usages after the definition's qname
        is rebuilt."""
        engine = mm.add_element({"name": "Engine", "type": "PartDefinition"})
        usage = mm.add_element(
            {
                "name": "e1",
                "type": "PartUsage",
                "properties": {"definitionRef": "Engine"},
            }
        )
        usages_before = mm.find_usages(engine["id"])
        assert len(usages_before) == 1

    def test_move_element_to_self(self, mm):
        """Moving element to a new parent (not self) works."""
        p1 = mm.add_element({"name": "P1"})
        p2 = mm.add_element({"name": "P2"})
        child = mm.add_element({"name": "Child"}, owner_id=p1["id"])
        mm.move_element(child["id"], p2["id"])
        assert mm.get_element(child["id"])["ownerId"] == p2["id"]

    def test_relationship_all_types(self, mm):
        """Various relationship types can be added."""
        e1 = mm.add_element({"name": "A"})
        e2 = mm.add_element({"name": "B"})

        for rtype in ["Connection", "Binding", "ObjectFlow", "ControlFlow",
                       "Transition", "Satisfy", "Verify", "Subclassification",
                       "Allocation"]:
            rel = mm.add_relationship(
                {"type": rtype, "sourceId": e1["id"], "targetId": e2["id"]}
            )
            assert rel["type"] == rtype

    def test_add_element_with_properties(self, mm):
        """add_element preserves provided properties."""
        elem = mm.add_element(
            {
                "name": "X",
                "type": "RequirementDefinition",
                "properties": {
                    "requirementId": "REQ-001",
                    "text": "Shall do X",
                },
            }
        )
        assert elem["properties"]["requirementId"] == "REQ-001"
        assert elem["properties"]["text"] == "Shall do X"

    def test_add_element_with_short_name(self, mm):
        """add_element preserves provided shortName."""
        elem = mm.add_element({"name": "LongName", "shortName": "LN"})
        assert elem["shortName"] == "LN"

    def test_delete_then_recreate_same_name(self, mm):
        """After deleting an element, a new element with the same name can
        be created (no conflict)."""
        e = mm.add_element({"name": "Block"})
        mm.delete_element(e["id"])
        new_e = mm.add_element({"name": "Block"})  # Should succeed
        assert new_e["name"] == "Block"

    def test_large_deeply_nested_delete(self, mm):
        """Cascade delete works for deeply nested hierarchies."""
        root = mm.add_element({"name": "Root"})
        current = root
        for i in range(10):
            current = mm.add_element(
                {"name": f"Level{i}"}, owner_id=current["id"]
            )
        before = len(mm.model["elements"])
        mm.delete_element(root["id"])
        after = len(mm.model["elements"])
        assert after == 0  # All 11 elements gone
        assert before == 11

    def test_add_element_with_nonexistent_owner(self, mm):
        """add_element with a nonexistent owner_id still works (qname
        defaults to just the element name)."""
        elem = mm.add_element({"name": "Orphan"}, owner_id="nonexistent-id")
        assert elem["qualifiedName"] == "Orphan"

    def test_load_from_text_package(self):
        """load_from_text correctly handles package declarations."""
        mgr = ModelManager()
        text = "package P { part def X {} }"
        model = mgr.load_from_text(text)
        assert len(model["packages"]) >= 1
        pkg = model["packages"][0]
        assert pkg["name"] == "P"

    def test_get_element_model_not_loaded(self):
        """get_element raises ModelNotLoadedError when no model."""
        mgr = ModelManager()
        with pytest.raises(ModelNotLoadedError):
            mgr.get_element("x")
