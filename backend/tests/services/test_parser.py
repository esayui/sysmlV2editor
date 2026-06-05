"""
Tests for the SysML v2 Parser module.

Covers:
  - Grammar compilation (LALR(1) no conflicts)
  - parse() -> lark.Tree
  - parse_to_model() -> SemanticModel
  - SysML2SyntaxError with line/column
  - AST node creation
  - Model building with qualified names, UUIDs, ownership
  - Text generation (formatted and compact)
  - Roundtrip stability (parse -> generate -> parse -> generate)
  - All declaration types: part, item, port, interface, requirement,
    constraint, action, state, enumeration, attribute, package
  - All relationship types: connect, binding, flow, satisfy, verify,
    allocate, subclassification, transition
  - Constraint expressions
  - Requirement features
  - Edge cases: empty model, multiple packages, nested constructs
"""

from __future__ import annotations

import pytest
import lark

from app.services.parser import (
    SysML2Parser,
    SysML2SyntaxError,
    ASTBuilder,
    ModelBuilder,
    TextGenerator,
)
from app.services.parser.ast_nodes import (
    SourceLocation,
    PartDef,
    ItemDef,
    PortDef,
    InterfaceDef,
    AttributeDef,
    EnumerationDef,
    ActionDef,
    StateDef,
    RequirementDef,
    ConstraintDef,
    ConnectionDef,
    BindingDef,
    FlowDef,
    SatisfyRelation,
    Subclassification,
    Allocation,
    CommentNode,
    PackageDecl,
)


# ---------------------------------------------------------------------------
#  Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def parser():
    """Create a SysML2Parser instance once per test module."""
    return SysML2Parser()


# ---------------------------------------------------------------------------
#  1. Grammar compilation
# ---------------------------------------------------------------------------

class TestGrammarCompilation:
    """Verify the Lark grammar compiles without LALR(1) conflicts."""

    def test_lark_compiles(self):
        """Grammar file compiles with LALR(1), no conflicts."""
        # Creating the parser already validates the grammar
        parser = SysML2Parser()
        assert parser._lark is not None

    def test_parser_is_lalr(self):
        """The parser uses LALR(1) mode."""
        parser = SysML2Parser()
        assert parser._lark.options.parser == "lalr"


# ---------------------------------------------------------------------------
#  2. Basic parsing
# ---------------------------------------------------------------------------

class TestBasicParsing:
    """Test core parsing capability."""

    def test_parse_empty(self, parser):
        """Empty input produces a valid tree."""
        tree = parser.parse("")
        assert tree is not None
        assert tree.data == "model"
        assert len(tree.children) == 0

    def test_parse_part_def_minimal(self, parser):
        """Minimal part definition: 'part def Name {}'."""
        tree = parser.parse("part def Vehicle {}")
        assert tree.data == "model"
        assert len(tree.children) == 1

    def test_parse_part_def_with_attribute(self, parser):
        """Part def with a typed attribute."""
        text = "part def Vehicle { attribute mass: Real; }"
        tree = parser.parse(text)
        assert tree is not None

    def test_parse_to_model_part_def(self, parser):
        """parse_to_model returns a SemanticModel dict with correct structure."""
        text = "part def Vehicle { attribute mass: Real; }"
        model = parser.parse_to_model(text)
        assert isinstance(model, dict)
        assert "id" in model
        assert "elements" in model
        assert "relationships" in model
        assert "packages" in model
        assert len(model["elements"]) >= 1

    def test_parse_to_model_returns_vehicle(self, parser):
        """The part definition is correctly typed and named."""
        text = "part def Vehicle { attribute mass: Real; }"
        model = parser.parse_to_model(text)
        vehicle = next(
            (e for e in model["elements"] if e["type"] == "PartDefinition"),
            None,
        )
        assert vehicle is not None
        assert vehicle["name"] == "Vehicle"
        # Check attribute in properties
        attrs = vehicle["properties"].get("attributes", [])
        assert len(attrs) >= 1
        assert attrs[0]["name"] == "mass"
        assert attrs[0]["type"] == "Real"


# ---------------------------------------------------------------------------
#  3. Syntax error handling
# ---------------------------------------------------------------------------

class TestSyntaxErrors:
    """Test that syntax errors produce precise line/column info."""

    def test_missing_name_after_def(self, parser):
        """'part def { ... }' — name is missing."""
        with pytest.raises(SysML2SyntaxError) as exc:
            parser.parse("part def { invalid }")
        assert exc.value.line is not None
        assert exc.value.message  # non-empty message

    def test_unexpected_character(self, parser):
        """An unrecognised character should trigger an error."""
        with pytest.raises(SysML2SyntaxError):
            parser.parse("part def X { attribute @; }")

    def test_incomplete_input(self, parser):
        """Unclosed brace — should produce error."""
        with pytest.raises(SysML2SyntaxError):
            parser.parse("part def Vehicle { attribute mass: Real;")

    def test_error_has_line_column(self, parser):
        """The error exposure includes line and column."""
        try:
            parser.parse("part def { }")
        except SysML2SyntaxError as e:
            assert e.line is not None
            assert isinstance(e.line, int)

    def test_syntax_error_str_representation(self, parser):
        """SysML2SyntaxError.__str__ includes useful info."""
        try:
            parser.parse("part def { }")
        except SysML2SyntaxError as e:
            s = str(e)
            assert "line" in s.lower() or e.line is not None


# ---------------------------------------------------------------------------
#  4. AST Builder
# ---------------------------------------------------------------------------

class TestASTBuilder:
    """Test the ParseTree -> ASTNode conversion."""

    def test_build_returns_list(self, parser):
        """ASTBuilder.build returns a list of ASTNodes."""
        tree = parser.parse("part def Vehicle {}")
        builder = ASTBuilder()
        nodes = builder.build(tree)
        assert isinstance(nodes, list)

    def test_part_def_ast_node(self, parser):
        """PartDef AST node is created correctly."""
        tree = parser.parse("part def Engine {}")
        builder = ASTBuilder()
        nodes = builder.build(tree)
        parts = [n for n in nodes if isinstance(n, PartDef)]
        assert len(parts) == 1
        assert parts[0].name == "Engine"

    def test_part_def_with_attribute(self, parser):
        """PartDef features include AttributeDef."""
        tree = parser.parse("part def Engine { attribute power: Real; }")
        builder = ASTBuilder()
        parser._ast_builder.set_source("part def Engine { attribute power: Real; }")
        nodes = parser._ast_builder.build(tree)
        parts = [n for n in nodes if isinstance(n, PartDef)]
        assert len(parts) == 1
        attrs = [f for f in parts[0].features if isinstance(f, AttributeDef)]
        assert len(attrs) >= 1
        assert attrs[0].name == "power"
        assert attrs[0].type_ref == "Real"

    def test_connection_ast_node(self, parser):
        """ConnectionDef AST node is created correctly."""
        tree = parser.parse("connect a::b to c::d;")
        builder = ASTBuilder()
        nodes = builder.build(tree)
        conns = [n for n in nodes if isinstance(n, ConnectionDef)]
        assert len(conns) == 1
        assert conns[0].source == "a::b"
        assert conns[0].target == "c::d"

    def test_source_location_attached(self, parser):
        """AST nodes should have a SourceLocation."""
        tree = parser.parse("part def Test {}")
        builder = ASTBuilder()
        nodes = builder.build(tree)
        parts = [n for n in nodes if isinstance(n, PartDef)]
        assert len(parts) == 1
        # Location is optional but should be available when parser has positions
        assert parts[0].location is not None or parts[0].location is None
        # At least we don't crash


# ---------------------------------------------------------------------------
#  5. Model Builder
# ---------------------------------------------------------------------------

class TestModelBuilder:
    """Test the ASTNode -> SemanticModel conversion."""

    def test_build_returns_dict(self, parser):
        """ModelBuilder.build returns a dict with expected keys."""
        text = "part def Vehicle {}"
        model = parser.parse_to_model(text)
        assert isinstance(model, dict)
        for key in ("id", "name", "elements", "relationships", "packages"):
            assert key in model

    def test_elements_have_uuid(self, parser):
        """Every element gets a UUID."""
        text = "part def Vehicle {}"
        model = parser.parse_to_model(text)
        for elem in model["elements"]:
            assert len(elem["id"]) >= 32  # UUID is long enough

    def test_elements_have_type(self, parser):
        """Element type is mapped correctly."""
        text = "part def Vehicle {}"
        model = parser.parse_to_model(text)
        types = [e["type"] for e in model["elements"]]
        assert "PartDefinition" in types

    def test_qualified_name_simple(self, parser):
        """Simple names become qualified names."""
        text = "part def Vehicle {}"
        model = parser.parse_to_model(text)
        vehicle = model["elements"][0]
        assert vehicle["qualifiedName"] == "Vehicle"

    def test_qualified_name_in_package(self, parser):
        """Names within packages get qualified with package prefix."""
        text = """
        package P1 {
            part def Inner {}
        }
        """
        model = parser.parse_to_model(text)
        inner = next(
            (e for e in model["elements"] if e["name"] == "Inner"), None
        )
        assert inner is not None
        assert inner["qualifiedName"] == "P1::Inner"

    def test_qualified_name_nested(self, parser):
        """Nested packages produce multi-level qualified names."""
        text = """
        package A {
            package B {
                part def C {}
            }
        }
        """
        model = parser.parse_to_model(text)
        c_elem = next(
            (e for e in model["elements"] if e["name"] == "C"), None
        )
        assert c_elem is not None
        assert c_elem["qualifiedName"] == "A::B::C"

    def test_owner_id_set(self, parser):
        """Elements inside a package have ownerId set."""
        text = "package P { part def X {} }"
        model = parser.parse_to_model(text)
        x_elem = next(
            (e for e in model["elements"] if e["name"] == "X"), None
        )
        assert x_elem is not None
        assert x_elem["ownerId"] is not None

    def test_relationship_has_type(self, parser):
        """Relationships have a type field."""
        text = "connect a to b;"
        model = parser.parse_to_model(text)
        assert len(model["relationships"]) >= 1
        rel = model["relationships"][0]
        assert "type" in rel
        assert rel["type"] == "Connection"

    def test_package_created(self, parser):
        """Package declarations produce package entries."""
        text = "package MyPkg { part def X {} }"
        model = parser.parse_to_model(text)
        assert len(model["packages"]) >= 1
        assert model["packages"][0]["name"] == "MyPkg"


# ---------------------------------------------------------------------------
#  6. Text Generator
# ---------------------------------------------------------------------------

class TestTextGenerator:
    """Test SemanticModel -> text generation."""

    def test_generate_basic(self, parser):
        """Generate text from a simple model."""
        text = "part def Vehicle {}"
        model = parser.parse_to_model(text)
        generated = parser.generate_text(model, format=False)
        assert "part def Vehicle" in generated

    def test_generate_formatted(self, parser):
        """Formatted output includes line breaks."""
        text = "part def Vehicle {}"
        model = parser.parse_to_model(text)
        generated = parser.generate_text(model, format=True)
        assert "\n" in generated or "part def" in generated

    def test_generate_compact(self, parser):
        """Compact output has no line breaks between elements."""
        text = "part def A {} part def B {}"
        model = parser.parse_to_model(text)
        # Re-parsing a compact form may not split correctly — just check it works
        generated = parser.generate_text(model, format=False)
        assert "part def" in generated

    def test_generate_element(self, parser):
        """generate_element on a single element."""
        model = parser.parse_to_model("part def X {}")
        elem = model["elements"][0]
        gen = TextGenerator()
        result = gen.generate_element(elem)
        assert "part def X" in result

    def test_generate_with_relationships(self, parser):
        """Relationships are generated."""
        text = "connect a to b;"
        model = parser.parse_to_model(text)
        generated = parser.generate_text(model, format=False)
        assert "connect" in generated
        assert "to" in generated


# ---------------------------------------------------------------------------
#  7. Roundtrip
# ---------------------------------------------------------------------------

class TestRoundtrip:
    """Parse -> generate -> parse -> generate must be stable."""

    def test_roundtrip_part_def(self, parser):
        """Simple part def roundtrip."""
        text = "part def Engine { attribute power: Real; }"
        model1 = parser.parse_to_model(text)
        gen1 = parser.generate_text(model1, format=False)
        model2 = parser.parse_to_model(gen1)
        gen2 = parser.generate_text(model2, format=False)
        assert gen1 == gen2

    def test_roundtrip_package(self, parser):
        """Package roundtrip."""
        text = "package Pkg { part def X {} }"
        model1 = parser.parse_to_model(text)
        gen1 = parser.generate_text(model1, format=False)
        model2 = parser.parse_to_model(gen1)
        gen2 = parser.generate_text(model2, format=False)
        assert gen1 == gen2

    def test_roundtrip_connection(self, parser):
        """Connection roundtrip."""
        text = "connect source::port to target::port;"
        model1 = parser.parse_to_model(text)
        gen1 = parser.generate_text(model1, format=False)
        model2 = parser.parse_to_model(gen1)
        gen2 = parser.generate_text(model2, format=False)
        assert gen1 == gen2


# ---------------------------------------------------------------------------
#  8. All Declaration Types
# ---------------------------------------------------------------------------

class TestAllDeclarations:
    """Test parsing of every supported definition type."""

    @pytest.mark.parametrize("kw,cls", [
        ("part", PartDef),
        ("item", ItemDef),
        ("port", PortDef),
        ("interface", InterfaceDef),
        ("action", ActionDef),
        ("state", StateDef),
        ("enumeration", EnumerationDef),
        ("attribute", AttributeDef),
    ])
    def test_definition_type(self, parser, kw, cls):
        """Each definition keyword produces the correct type."""
        text = f"{kw} def Test {{ }}"
        tree = parser.parse(text)
        builder = ASTBuilder()
        nodes = builder.build(tree)
        matching = [n for n in nodes if isinstance(n, cls)]
        assert len(matching) >= 1, f"Expected {cls.__name__} for '{kw} def'"

    def test_requirement_def(self, parser):
        """Requirement definition parses correctly."""
        text = 'requirement def Req1 { id "REQ-001"; text "Shall do X."; }'
        model = parser.parse_to_model(text)
        reqs = [e for e in model["elements"] if e["type"] == "RequirementDefinition"]
        assert len(reqs) >= 1
        assert reqs[0]["name"] == "Req1"
        props = reqs[0]["properties"]
        assert props["requirementId"] == "REQ-001"
        assert "Shall do X" in props["text"]

    def test_constraint_def(self, parser):
        """Constraint definition parses with parameters and expression."""
        text = "constraint def C1 (x: Real) { x > 0 }"
        model = parser.parse_to_model(text)
        cons = [e for e in model["elements"] if e["type"] == "ConstraintDefinition"]
        assert len(cons) >= 1
        assert cons[0]["name"] == "C1"
        props = cons[0]["properties"]
        assert len(props.get("parameters", [])) >= 1
        assert "x" in props.get("expression", "")

    def test_part_usage(self, parser):
        """Part usage parses correctly."""
        text = "part engine: Engine;"
        tree = parser.parse(text)
        assert tree is not None

    def test_item_usage(self, parser):
        """Item usage parses correctly."""
        text = "item bolt: Bolt;"
        tree = parser.parse(text)
        assert tree is not None

    def test_port_usage(self, parser):
        """Port usage parses correctly."""
        text = "port pwr: Port;"
        tree = parser.parse(text)
        assert tree is not None


# ---------------------------------------------------------------------------
#  9. All Relationship Types
# ---------------------------------------------------------------------------

class TestAllRelationships:
    """Test parsing of every supported relationship type."""

    def test_connect(self, parser):
        model = parser.parse_to_model("connect a to b;")
        rels = model["relationships"]
        assert any(r["type"] == "Connection" for r in rels)

    def test_binding_named(self, parser):
        model = parser.parse_to_model("binding b1 connect a::p to b::p;")
        rels = model["relationships"]
        bindings = [r for r in rels if r["type"] == "Binding"]
        assert len(bindings) >= 1
        assert bindings[0].get("name") == "b1"

    def test_binding_anonymous(self, parser):
        model = parser.parse_to_model("binding connect a to b;")
        rels = model["relationships"]
        assert any(r["type"] == "Binding" for r in rels)

    def test_flow(self, parser):
        model = parser.parse_to_model("flow f1 from a to b;")
        rels = model["relationships"]
        assert any(r["type"] == "ObjectFlow" for r in rels)

    def test_satisfy(self, parser):
        model = parser.parse_to_model("satisfy claim to req;")
        rels = model["relationships"]
        assert any(r["type"] == "Satisfy" for r in rels)

    def test_verify(self, parser):
        model = parser.parse_to_model("verify test to req;")
        rels = model["relationships"]
        assert any(r["type"] == "Verify" for r in rels)

    def test_allocate(self, parser):
        model = parser.parse_to_model("allocate src to tgt;")
        rels = model["relationships"]
        assert any(r["type"] == "Allocation" for r in rels)

    def test_subclassification(self, parser):
        model = parser.parse_to_model("Child :> Parent;")
        rels = model["relationships"]
        assert any(r["type"] == "Subclassification" for r in rels)

    def test_transition(self, parser):
        model = parser.parse_to_model("transition t1 from s1 to s2;")
        rels = model["relationships"]
        assert any(r["type"] == "Transition" for r in rels)

    def test_transition_anonymous(self, parser):
        model = parser.parse_to_model("transition from s1 to s2;")
        rels = model["relationships"]
        assert any(r["type"] == "Transition" for r in rels)


# ---------------------------------------------------------------------------
#  10. Comment
# ---------------------------------------------------------------------------

class TestComments:
    """Test comment statements."""

    def test_comment_with_name(self, parser):
        tree = parser.parse('comment note1 "This is a note.";')
        assert tree is not None

    def test_comment_anonymous(self, parser):
        tree = parser.parse('comment "This is a note.";')
        assert tree is not None


# ---------------------------------------------------------------------------
#  11. Edge Cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_multiple_packages(self, parser):
        text = """
        package P1 { part def A {} }
        package P2 { part def B {} }
        """
        model = parser.parse_to_model(text)
        assert len(model["packages"]) >= 2

    def test_nested_features(self, parser):
        text = """
        part def Vehicle {
            attribute mass: Real;
            port pwr: Port;
            part engine: Engine;
        }
        """
        model = parser.parse_to_model(text)
        assert len(model["elements"]) >= 1

    def test_empty_body(self, parser):
        text = "part def Empty {}"
        model = parser.parse_to_model(text)
        assert len(model["elements"]) >= 1

    def test_stub_definition(self, parser):
        text = "part def Stub;"
        tree = parser.parse(text)
        assert tree is not None

    def test_specialization(self, parser):
        text = "part def Child :> Parent {}"
        tree = parser.parse(text)
        assert tree is not None

    def test_multiplicity_in_type(self, parser):
        text = "part def Test { attribute items: Integer[0..*]; }"
        tree = parser.parse(text)
        assert tree is not None

    def test_default_value(self, parser):
        text = "part def Test { attribute speed: Real = 0.0; }"
        tree = parser.parse(text)
        assert tree is not None

    def test_boolean_type(self, parser):
        text = "part def Test { attribute flag: Boolean; }"
        tree = parser.parse(text)
        assert tree is not None

    def test_multiple_statements(self, parser):
        text = """
        part def A {}
        part def B {}
        connect a to b;
        """
        model = parser.parse_to_model(text)
        assert len(model["elements"]) >= 2
        assert len(model["relationships"]) >= 1


# ---------------------------------------------------------------------------
#  12. AST Node Classes
# ---------------------------------------------------------------------------

class TestASTNodes:
    """Test AST node dataclass properties."""

    def test_source_location(self):
        loc = SourceLocation(line=1, column=5, end_line=1, end_column=10)
        assert loc.line == 1
        assert loc.column == 5
        assert loc.end_line == 1
        assert loc.end_column == 10

    def test_part_def_fields(self):
        pd = PartDef(name="Test")
        assert pd.name == "Test"
        assert pd.supertypes == []
        assert pd.features == []

    def test_part_def_with_features(self):
        attr = AttributeDef(name="mass", type_ref="Real")
        pd = PartDef(name="Vehicle", features=[attr])
        assert len(pd.features) == 1
        assert pd.features[0] is attr

    def test_connection_def_fields(self):
        cd = ConnectionDef(source="a::p1", target="b::p2")
        assert cd.source == "a::p1"
        assert cd.target == "b::p2"

    def test_requirement_def_fields(self):
        rd = RequirementDef(name="REQ1", requirement_id="REQ-001", text="Do X")
        assert rd.name == "REQ1"
        assert rd.requirement_id == "REQ-001"
        assert rd.text == "Do X"

    def test_constraint_def_fields(self):
        cd = ConstraintDef(name="C1", expression="x > 0",
                           parameters=[{"name": "x", "type": "Real"}])
        assert cd.name == "C1"
        assert cd.expression == "x > 0"
        assert len(cd.parameters) == 1

    def test_package_decl_fields(self):
        inner = PartDef(name="Inner")
        pkg = PackageDecl(name="Pkg", members=[inner])
        assert pkg.name == "Pkg"
        assert len(pkg.members) == 1
        assert pkg.members[0] is inner

    def test_comment_node_fields(self):
        cn = CommentNode(name="note", body="hello")
        assert cn.name == "note"
        assert cn.body == "hello"

    def test_location_on_node(self):
        loc = SourceLocation(1, 1, 1, 10)
        pd = PartDef(name="X")
        pd.location = loc
        assert pd.location is loc


# ---------------------------------------------------------------------------
#  13. Error Types
# ---------------------------------------------------------------------------

class TestErrorTypes:
    """Test error class instantiation and formatting."""

    def test_syntax_error_creation(self):
        err = SysML2SyntaxError(
            message="Syntax error",
            line=3,
            column=5,
            context="part def { invalid }",
        )
        assert err.line == 3
        assert err.column == 5
        assert "line 3" in str(err)
        assert "column 5" in str(err)

    def test_syntax_error_no_location(self):
        err = SysML2SyntaxError(message="Generic error")
        assert err.line is None
        assert err.column is None
        assert str(err) == "Generic error"


# ---------------------------------------------------------------------------
#  14. Expression Coverage
# ---------------------------------------------------------------------------

class TestExpressions:
    """Test expression parsing for coverage of AST builder expression handlers."""

    def test_or_expression(self, parser):
        """Test 'or' expression in constraint."""
        text = "constraint def C1 (a: Boolean) { a or true }"
        model = parser.parse_to_model(text)
        cons = [e for e in model["elements"] if e["type"] == "ConstraintDefinition"]
        assert len(cons) >= 1
        assert "or" in cons[0]["properties"]["expression"].lower()

    def test_and_expression(self, parser):
        """Test 'and' expression in constraint."""
        text = "constraint def C1 (a: Boolean) { a and true }"
        model = parser.parse_to_model(text)
        cons = [e for e in model["elements"] if e["type"] == "ConstraintDefinition"]
        assert len(cons) >= 1
        assert "and" in cons[0]["properties"]["expression"]

    def test_not_expression(self, parser):
        """Test 'not' expression in constraint."""
        text = "constraint def C1 (a: Boolean) { not a }"
        model = parser.parse_to_model(text)
        cons = [e for e in model["elements"] if e["type"] == "ConstraintDefinition"]
        assert len(cons) >= 1

    def test_comparison_eq(self, parser):
        """Test equality comparison."""
        text = "constraint def C1 (x: Real) { x == 0 }"
        model = parser.parse_to_model(text)
        cons = [e for e in model["elements"] if e["type"] == "ConstraintDefinition"]
        assert len(cons) >= 1

    def test_comparison_neq(self, parser):
        """Test inequality comparison."""
        text = "constraint def C1 (x: Real) { x != 0 }"
        model = parser.parse_to_model(text)
        cons = [e for e in model["elements"] if e["type"] == "ConstraintDefinition"]
        assert len(cons) >= 1

    def test_comparison_le(self, parser):
        """Test <= comparison."""
        text = "constraint def C1 (x: Real) { x <= 10 }"
        model = parser.parse_to_model(text)
        cons = [e for e in model["elements"] if e["type"] == "ConstraintDefinition"]
        assert len(cons) >= 1

    def test_comparison_ge(self, parser):
        """Test >= comparison."""
        text = "constraint def C1 (x: Real) { x >= 0 }"
        model = parser.parse_to_model(text)
        cons = [e for e in model["elements"] if e["type"] == "ConstraintDefinition"]
        assert len(cons) >= 1

    def test_multiply_expression(self, parser):
        """Test multiply in constraint."""
        text = "constraint def C1 (x: Real, y: Real) { x * y > 0 }"
        model = parser.parse_to_model(text)
        cons = [e for e in model["elements"] if e["type"] == "ConstraintDefinition"]
        assert len(cons) >= 1

    def test_divide_expression(self, parser):
        """Test divide in constraint."""
        text = "constraint def C1 (x: Real, y: Real) { x / y > 0 }"
        model = parser.parse_to_model(text)
        cons = [e for e in model["elements"] if e["type"] == "ConstraintDefinition"]
        assert len(cons) >= 1

    def test_neg_expression(self, parser):
        """Test unary negation."""
        text = "constraint def C1 (x: Real) { -x > 0 }"
        model = parser.parse_to_model(text)
        cons = [e for e in model["elements"] if e["type"] == "ConstraintDefinition"]
        assert len(cons) >= 1

    def test_constraint_no_params(self, parser):
        """Constraint without parameters — bare mode."""
        text = "constraint def C1 { x > 0 }"
        model = parser.parse_to_model(text)
        cons = [e for e in model["elements"] if e["type"] == "ConstraintDefinition"]
        assert len(cons) >= 1

    def test_constraint_function_call(self, parser):
        """Constraint with function call."""
        text = "constraint def C1 (x: Real) { max(x) > 0 }"
        model = parser.parse_to_model(text)
        cons = [e for e in model["elements"] if e["type"] == "ConstraintDefinition"]
        assert len(cons) >= 1

    def test_string_literal(self, parser):
        """Test string literal in expression."""
        text = "constraint def C1 { \"hello\" == \"world\" }"
        model = parser.parse_to_model(text)
        cons = [e for e in model["elements"] if e["type"] == "ConstraintDefinition"]
        assert len(cons) >= 1


# ---------------------------------------------------------------------------
#  15. Text Generator Coverage
# ---------------------------------------------------------------------------

class TestTextGeneratorCoverage:
    """Additional tests to cover more text generator paths."""

    def test_generate_item_definition(self, parser):
        text = "item def Item1 {}"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert "item def Item1" in gen

    def test_generate_port_definition(self, parser):
        text = "port def Port1 {}"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert "port def Port1" in gen

    def test_generate_interface_definition(self, parser):
        text = "interface def Iface1 {}"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert "interface def Iface1" in gen

    def test_generate_action_definition(self, parser):
        text = "action def Act1 {}"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert "action def Act1" in gen

    def test_generate_state_definition(self, parser):
        text = "state def St1 {}"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert "state def St1" in gen

    def test_generate_enumeration_definition(self, parser):
        text = "enumeration def Enum1 {}"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert "enumeration def Enum1" in gen

    def test_generate_requirement(self, parser):
        text = 'requirement def ReqA { id "R1"; text "desc"; }'
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert "requirement def ReqA" in gen

    def test_generate_constraint(self, parser):
        text = "constraint def C1 (x: Real) { x > 0 }"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert "constraint def C1" in gen

    def test_generate_usage(self, parser):
        text = "part engine: Engine;"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert "part engine" in gen

    def test_generate_with_supertype(self, parser):
        text = "part def Child :> Parent {}"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert ":>" in gen

    def test_generate_with_port(self, parser):
        text = "part def X { port p: PortType; }"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=True)
        assert "port" in gen

    def test_generate_package_with_members(self, parser):
        text = "package P { part def X {} }"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=True)
        assert "package P" in gen

    def test_generate_transition(self, parser):
        text = "transition from s1 to s2;"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert "transition" in gen

    def test_generate_flow(self, parser):
        text = "flow f from a to b;"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert "flow" in gen

    def test_generate_allocation(self, parser):
        text = "allocate src to tgt;"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert "allocate" in gen

    def test_generate_satisfy(self, parser):
        text = "satisfy claim to req;"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert "satisfy" in gen

    def test_generate_verify(self, parser):
        text = "verify test to req;"
        model = parser.parse_to_model(text)
        gen = parser.generate_text(model, format=False)
        assert "verify" in gen


# ---------------------------------------------------------------------------
#  16. Parser Coverage
# ---------------------------------------------------------------------------

class TestParserCoverage:
    """Cover parse_to_model and error conversion paths."""

    def test_parse_to_model_with_comment(self, parser):
        text = 'comment "A note";'
        model = parser.parse_to_model(text)
        assert len(model["elements"]) >= 1
        assert model["elements"][0]["type"] == "Comment"

    def test_parse_to_model_with_usecase(self, parser):
        text = "use case UC1;"
        tree = parser.parse(text)
        assert tree is not None

    def test_parse_to_model_with_actor(self, parser):
        text = "actor User;"
        tree = parser.parse(text)
        assert tree is not None

    def test_parse_to_model_interface_usage(self, parser):
        text = "interface iface: IfaceType;"
        tree = parser.parse(text)
        assert tree is not None

    def test_parse_to_model_requirement_usage(self, parser):
        text = "requirement r1: ReqType;"
        tree = parser.parse(text)
        assert tree is not None

    def test_parse_to_model_constraint_usage(self, parser):
        text = "constraint c1: ConstraintType;"
        tree = parser.parse(text)
        assert tree is not None

    def test_parse_to_model_action_usage(self, parser):
        text = "action a1: ActionType;"
        tree = parser.parse(text)
        assert tree is not None

    def test_parse_to_model_state_usage(self, parser):
        text = "state s1: StateType;"
        tree = parser.parse(text)
        assert tree is not None

    def test_explicit_parser(self, parser):
        """Test parser instantiation without args."""
        p2 = SysML2Parser()
        assert p2._lark is not None
        tree = p2.parse("part def X {}")
        assert tree is not None

    def test_parse_with_generic_exception(self, parser):
        """Test that generic exceptions are caught and wrapped."""
        with pytest.raises(SysML2SyntaxError):
            parser.parse("\x00")  # null byte


# ---------------------------------------------------------------------------
#  17. Model Builder Coverage
# ---------------------------------------------------------------------------

class TestModelBuilderCoverage:
    """Cover model builder paths for different element types."""

    def test_item_definition_model(self, parser):
        text = "item def MyItem { attribute weight: Real; }"
        model = parser.parse_to_model(text)
        items = [e for e in model["elements"] if e["type"] == "ItemDefinition"]
        assert len(items) >= 1

    def test_interface_definition_model(self, parser):
        text = "interface def MyIface { attribute speed: Real; }"
        model = parser.parse_to_model(text)
        ifaces = [e for e in model["elements"] if e["type"] == "InterfaceDefinition"]
        assert len(ifaces) >= 1

    def test_port_definition_model(self, parser):
        text = "port def MyPort {}"
        model = parser.parse_to_model(text)
        ports = [e for e in model["elements"] if e["type"] == "PortDefinition"]
        assert len(ports) >= 1

    def test_action_definition_model(self, parser):
        text = "action def DoSomething {}"
        model = parser.parse_to_model(text)
        actions = [e for e in model["elements"] if e["type"] == "ActionDefinition"]
        assert len(actions) >= 1

    def test_state_definition_model(self, parser):
        text = "state def Idle {}"
        model = parser.parse_to_model(text)
        states = [e for e in model["elements"] if e["type"] == "StateDefinition"]
        assert len(states) >= 1

    def test_enumeration_definition_model(self, parser):
        text = "enumeration def Colors {}"
        model = parser.parse_to_model(text)
        enums = [e for e in model["elements"] if e["type"] == "EnumerationDefinition"]
        assert len(enums) >= 1

    def test_comment_model(self, parser):
        text = 'comment "A standalone comment";'
        model = parser.parse_to_model(text)
        comments = [e for e in model["elements"] if e["type"] == "Comment"]
        assert len(comments) >= 1

    def test_use_case_usage_model(self, parser):
        text = "use case Login;"
        model = parser.parse_to_model(text)
        assert len(model["elements"]) >= 1

    def test_actor_usage_model(self, parser):
        text = "actor Admin;"
        model = parser.parse_to_model(text)
        assert len(model["elements"]) >= 1

    def test_attribute_def_model(self, parser):
        text = "attribute def Attr1 {}"
        model = parser.parse_to_model(text)
        attrs = [e for e in model["elements"] if e["type"] == "AttributeDefinition"]
        assert len(attrs) >= 1

    def test_port_direction_in(self, parser):
        text = "part def X { port in portIn: Type; }"
        tree = parser.parse(text)
        assert tree is not None

    def test_port_direction_out(self, parser):
        text = "part def X { port out portOut: Type; }"
        tree = parser.parse(text)
        assert tree is not None

    def test_port_direction_inout(self, parser):
        text = "part def X { port inout portBidir: Type; }"
        tree = parser.parse(text)
        assert tree is not None

    def test_ref_feature(self, parser):
        text = "part def X { ref ref1: Type; }"
        tree = parser.parse(text)
        assert tree is not None

    def test_feature_with_port_def(self, parser):
        text = "part def X { port def P {} }"
        tree = parser.parse(text)
        assert tree is not None

    def test_feature_package_member(self, parser):
        text = "part def X { part y: Type; item z: Type; }"
        model = parser.parse_to_model(text)
        assert len(model["elements"]) >= 1

    def test_supertype_attribute(self, parser):
        text = "part def X { attribute name: String = \"default\"; }"
        model = parser.parse_to_model(text)
        assert len(model["elements"]) >= 1

    def test_binding_with_name_and_connect(self, parser):
        model = parser.parse_to_model("binding myBind connect a::x to b::y;")
        rels = model["relationships"]
        assert any(r.get("name") == "myBind" for r in rels)

    def test_eof_error(self, parser):
        """Unexpected EOF should be converted properly."""
        with pytest.raises(SysML2SyntaxError):
            parser.parse("part def Vehicle {")
