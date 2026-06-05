"""
AST Builder — Lark Transformer that converts a ParseTree into typed AST nodes.

Design:
    Walk the Lark Tree bottom-up, calling a method for each named rule.
    Inline rules (prefixed with ``?``) do NOT trigger their own method;
    their children appear directly in the parent node's child list.

Source locations are extracted from the first and last token of each subtree.
"""

from __future__ import annotations

from lark import Tree, Token, Transformer, v_args

from .ast_nodes import (
    ASTNode,
    SourceLocation,
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
    RequirementDef,
    RequirementUsage,
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
#  Helper — extract qualified name text from a qualified_name subtree
# ---------------------------------------------------------------------------

def _qn_text(node) -> str:
    """Return the dot-joined text of a qualified_name subtree or token."""
    if isinstance(node, Token):
        return str(node)
    if isinstance(node, Tree) and node.data == "qualified_name":
        return "::".join(str(c) for c in node.children)
    return str(node)


def _token_text(node, keep_quotes: bool = False) -> str:
    """Return the string value of a token, stripping quotes from strings."""
    if isinstance(node, Token):
        s = str(node)
        if not keep_quotes and node.type == "ESCAPED_STRING":
            s = s[1:-1]  # strip surrounding double-quotes
        return s
    if isinstance(node, Tree):
        # Try to get the text from children
        return "::".join(_token_text(c) for c in node.children)
    return str(node)


def _expr_text(node) -> str:
    """Recursively convert an expression Tree/subtree to its source text.

    This reconstructs the original expression from the parse tree by visiting
    all leaf tokens and re-inserting operators.  Handles the main expression
    node types (comparison, sum_expr, product_expr, unary_expr, primary_expr,
    and their inline aliases like or_expr, and_expr, etc.).
    """
    if isinstance(node, Token):
        t = node.type
        val = str(node)
        if t == "ESCAPED_STRING":
            return f'"{val[1:-1]}"'
        if t == "COMP_OP":
            return f" {val} "
        return val
    if isinstance(node, str):
        return node
    if isinstance(node, Tree):
        tag = node.data
        # Expression tree types — visit children with appropriate spacing
        if tag == "not_expr":
            return "not " + _expr_text(node.children[-1])
        if tag == "comparison":
            parts = []
            for c in node.children:
                if isinstance(c, Token):
                    val = str(c)
                    if val in ("==", "!=", "<=", ">=", "<", ">"):
                        parts.append(f" {val} ")
                    else:
                        parts.append(val)
                else:
                    parts.append(_expr_text(c))
            return "".join(parts)
        if tag == "sum_expr":
            parts = []
            for c in node.children:
                if isinstance(c, Token):
                    val = str(c)
                    if val in ("+", "-"):
                        parts.append(f" {val} ")
                    else:
                        parts.append(val)
                else:
                    parts.append(_expr_text(c))
            return "".join(parts)
        if tag == "product_expr":
            parts = []
            for c in node.children:
                if isinstance(c, Token):
                    val = str(c)
                    if val in ("*", "/"):
                        parts.append(f" {val} ")
                    else:
                        parts.append(val)
                else:
                    parts.append(_expr_text(c))
            return "".join(parts)
        if tag == "or_expr":
            parts = []
            for c in node.children:
                if isinstance(c, Token) and str(c) == "or":
                    parts.append(" or ")
                else:
                    parts.append(_expr_text(c))
            return "".join(parts)
        if tag == "and_expr":
            parts = []
            for c in node.children:
                if isinstance(c, Token) and str(c) == "and":
                    parts.append(" and ")
                else:
                    parts.append(_expr_text(c))
            return "".join(parts)
        if tag in ("unary_expr",):
            return "-" + _expr_text(node.children[-1])
        if tag in ("primary_expr", "num_literal", "true_literal", "false_literal", "null_literal"):
            return _expr_text(node.children[0]) if node.children else str(node.children[0]) if node.children else ""
        if tag in ("str_literal",):
            val = str(node.children[0]) if node.children else ""
            return f'"{val}"'
        if tag == "function_call":
            name = _expr_text(node.children[0])
            args = ", ".join(_expr_text(c) for c in node.children[1:])
            return f"{name}({args})"
        if tag == "qualified_name":
            return "::".join(str(c) for c in node.children)
        if tag == "neg_expr":
            return "-" + _expr_text(node.children[-1])
        # For unrecognized trees, concat children with spaces
        return " ".join(_expr_text(c) for c in node.children)
    return str(node)


# ---------------------------------------------------------------------------
#  Source location extraction
# ---------------------------------------------------------------------------

def _location(node_or_token) -> SourceLocation | None:
    """Extract a SourceLocation from a Lark Token or Tree."""
    if isinstance(node_or_token, Token):
        return SourceLocation(
            line=node_or_token.line or 0,
            column=node_or_token.column or 0,
            end_line=node_or_token.end_line or 0,
            end_column=node_or_token.end_column or 0,
        )
    if isinstance(node_or_token, Tree) and hasattr(node_or_token, "meta"):
        m = node_or_token.meta
        if m is not None:
            return SourceLocation(
                line=getattr(m, "line", 1) or 1,
                column=getattr(m, "column", 1) or 1,
                end_line=getattr(m, "end_line", 1) or 1,
                end_column=getattr(m, "end_column", 1) or 1,
            )
    return None


def _set_loc(node: ASTNode, source) -> None:
    """Attach a SourceLocation from a tree/token to an ASTNode."""
    loc = _location(source)
    if loc:
        node.location = loc


# ---------------------------------------------------------------------------
#  AST Builder
# ---------------------------------------------------------------------------

class ASTBuilder(Transformer):
    """Lark Transformer that converts ParseTree -> list[ASTNode]."""

    # Keep tokens as-is by default
    def __default_token__(self, token):
        return token

    # Inline expression rules pass through
    def or_expr(self, children):
        return Tree("or_expr", children)

    def and_expr(self, children):
        return Tree("and_expr", children)

    def not_expr(self, children):
        return Tree("not_expr", children)

    def comparison(self, children):
        return Tree("comparison", children)

    def sum_expr(self, children):
        return Tree("sum_expr", children)

    def product_expr(self, children):
        return Tree("product_expr", children)

    def unary_expr(self, children):
        return Tree("unary_expr", children)

    def primary_expr(self, children):
        return Tree("primary_expr", children)


    # ---- Model ----

    def model(self, children):
        return [self._to_astnode(c) for c in children if not isinstance(c, Token)]

    def _to_astnode(self, node):
        """Convert a Tree or Token or ASTNode to an ASTNode if possible."""
        if isinstance(node, ASTNode):
            return node
        return node


    # ---- Package ----

    def package_decl(self, children):
        name = _token_text(children[0])
        members = [self._to_astnode(c) for c in children[1:] if not isinstance(c, Token)]
        pkg = PackageDecl(name=name, members=members)
        _set_loc(pkg, children[0])
        return pkg


    # ---- Definition bodies ----

    def def_body(self, children):
        """Handle the body of a definition: opt specialization + features.

        specialization is now a named node (not inline), so it appears
        as a Tree('specialization', ...) in the children list.
        """
        features = []
        supertypes = []
        for child in children:
            if isinstance(child, Token):
                if str(child) in ("{", "}"):
                    continue
            elif isinstance(child, Tree):
                if child.data == "specialization":
                    # children: [':>', 'Name1', ',', 'Name2', ...]
                    # qualified_name is inline, so names are flat IDENTIFIER tokens
                    for sc in child.children:
                        if isinstance(sc, Token) and sc.type == "IDENTIFIER":
                            supertypes.append(str(sc))
                else:
                    # Might be a feature that wasn't transformed
                    pass
            elif isinstance(child, ASTNode):
                features.append(child)
            elif isinstance(child, dict):
                # Result from a nested transformer
                features.extend(child.get("features", []))
                supertypes.extend(child.get("supertypes", []))
        return {"features": features, "supertypes": supertypes}

    def def_stub(self, children):
        return {"features": [], "supertypes": []}


    # ---- Part Def ----

    def part_def(self, children):
        name = _token_text(children[0])
        body = self._extract_body(children[1:])
        node = PartDef(name=name, **body)
        _set_loc(node, children[0])
        return node

    def item_def(self, children):
        name = _token_text(children[0])
        body = self._extract_body(children[1:])
        node = ItemDef(name=name, **body)
        _set_loc(node, children[0])
        return node

    def port_def(self, children):
        name = _token_text(children[0])
        body = self._extract_body(children[1:])
        node = PortDef(name=name, features=body.get("features", []))
        _set_loc(node, children[0])
        return node

    def interface_def(self, children):
        name = _token_text(children[0])
        body = self._extract_body(children[1:])
        node = InterfaceDef(name=name, **body)
        _set_loc(node, children[0])
        return node

    def action_def(self, children):
        name = _token_text(children[0])
        body = self._extract_body(children[1:])
        node = ActionDef(name=name, **body)
        _set_loc(node, children[0])
        return node

    def state_def(self, children):
        name = _token_text(children[0])
        body = self._extract_body(children[1:])
        node = StateDef(name=name, **body)
        _set_loc(node, children[0])
        return node

    def enumeration_def(self, children):
        name = _token_text(children[0])
        body = self._extract_body(children[1:])
        node = EnumerationDef(name=name, **body)
        _set_loc(node, children[0])
        return node

    def attribute_def(self, children):
        name = _token_text(children[0])
        node = AttributeDef(name=name, type_ref=None)
        _set_loc(node, children[0])
        return node

    def _extract_body(self, rest_children):
        """Extract features and supertypes from the children after the name token.

        Handles both the case where def_body was processed by its transformer
        (returning a dict) and where it was not (raw Trees).
        """
        features = []
        supertypes = []
        for child in rest_children:
            if isinstance(child, dict):
                # Result of the def_body transformer method
                features.extend(child.get("features", []))
                supertypes.extend(child.get("supertypes", []))
            elif isinstance(child, Tree):
                if child.data == "specialization":
                    for sc in child.children:
                        if isinstance(sc, Token) and sc.type == "IDENTIFIER":
                            supertypes.append(str(sc))
                elif child.data == "def_body":
                    # def_body tree not processed yet — extract manually
                    for c in child.children:
                        if isinstance(c, Tree) and c.data == "specialization":
                            for sc in c.children:
                                if isinstance(sc, Token) and sc.type == "IDENTIFIER":
                                    supertypes.append(str(sc))
                        elif isinstance(c, ASTNode):
                            features.append(c)
            elif isinstance(child, ASTNode):
                features.append(child)
            elif isinstance(child, Token) and child.type in ("LBRACE", "RBRACE", "SEMICOLON"):
                continue
        return {"features": features, "supertypes": supertypes}


    # ---- Requirement Def ----

    def requirement_body(self, children):
        req_id = None
        text = ""
        attributes = {}
        for child in children:
            if isinstance(child, Tree):
                tag = child.data
                if tag == "req_id":
                    req_id = _token_text(child.children[0])
                elif tag == "req_text_attr":
                    text = _token_text(child.children[0])
                elif tag == "req_doc":
                    text = _token_text(child.children[0])
                elif tag == "req_attribute":
                    attr_name = _token_text(child.children[0])
                    attr_value = ""
                    for c in child.children[1:]:
                        if isinstance(c, Token) and c.type == "ESCAPED_STRING":
                            attr_value = _token_text(c)
                    attributes[attr_name] = attr_value
        return {"requirement_id": req_id, "text": text, "attributes": attributes}

    def req_id(self, children):
        return Tree("req_id", children)

    def req_text_attr(self, children):
        return Tree("req_text_attr", children)

    def req_doc(self, children):
        return Tree("req_doc", children)

    def req_attribute(self, children):
        return Tree("req_attribute", children)

    def requirement_def(self, children):
        name = _token_text(children[0])
        body_info = {}
        for child in children[1:]:
            if isinstance(child, dict):
                body_info = child
            elif isinstance(child, Tree) and child.data == "requirement_body":
                body_info = child  # processed by requirement_body method
        # Handle case where requirement_body was already converted to dict
        if isinstance(body_info, Tree):
            # process manually
            pass
        node = RequirementDef(
            name=name,
            requirement_id=body_info.get("requirement_id") if isinstance(body_info, dict) else None,
            text=body_info.get("text", "") if isinstance(body_info, dict) else "",
            attributes=body_info.get("attributes", {}) if isinstance(body_info, dict) else {},
        )
        _set_loc(node, children[0])
        return node


    # ---- Constraint Def ----

    def __init__(self):
        super().__init__()
        self._source_text = ""

    def set_source(self, text: str):
        """Store the original source text for expression extraction."""
        self._source_text = text

    def _extract_source_slice(self, node) -> str:
        """Extract the original source text for a tree node, using positions."""
        # Try meta positions first
        if hasattr(node, "meta") and node.meta is not None:
            m = node.meta
            start_pos = getattr(m, "start_pos", None)
            end_pos = getattr(m, "end_pos", None)
            if start_pos is not None and end_pos is not None and self._source_text:
                return self._source_text[start_pos:end_pos].strip()
            # Fall back to line-based
            line = getattr(m, "line", None)
            end_line = getattr(m, "end_line", None)
            if line is not None and end_line is not None and self._source_text:
                lines = self._source_text.split("\n")
                if 1 <= line <= len(lines) and 1 <= end_line <= len(lines):
                    relevant = "\n".join(lines[line - 1 : end_line])
                    return relevant.strip()
        return ""

    @v_args(meta=True)
    def constraint_with_params(self, meta, children):
        params = []
        expr_text = ""
        # Extract parameters: parameter_list is inline (?), so children contain
        # individual parameter Trees directly
        for child in children:
            if isinstance(child, Tree):
                if child.data == "parameter":
                    p_children = child.children
                    if len(p_children) >= 2:
                        params.append({
                            "name": _token_text(p_children[0]),
                            "type": _token_text(p_children[1]),
                        })
        # Try source-based extraction for the expression
        if meta and self._source_text:
            start = getattr(meta, "start_pos", None)
            end = getattr(meta, "end_pos", None)
            if start is not None and end is not None:
                body = self._source_text[start:end]
                brace_start = body.find("{")
                brace_end = body.rfind("}")
                if brace_start >= 0 and brace_end > brace_start:
                    expr_text = body[brace_start + 1 : brace_end].strip()
        # Fall back to tree reconstitution for expression
        if not expr_text:
            for child in children:
                if isinstance(child, Tree) and child.data != "parameter":
                    expr_text = _expr_text(child)
                    break
        return {"parameters": params, "expression": expr_text}

    @v_args(meta=True)
    def constraint_bare(self, meta, children):
        expr_text = ""
        # Try source-based extraction first
        if meta and self._source_text:
            start = getattr(meta, "start_pos", None)
            end = getattr(meta, "end_pos", None)
            if start is not None and end is not None:
                body = self._source_text[start:end]
                brace_start = body.find("{")
                brace_end = body.rfind("}")
                if brace_start >= 0 and brace_end > brace_start:
                    expr_text = body[brace_start + 1 : brace_end].strip()
        if not expr_text:
            expr_parts = []
            for child in children:
                if isinstance(child, Token):
                    t = _token_text(child)
                    if t and t not in ("{", "}", ";"):
                        expr_parts.append(t)
                elif isinstance(child, Tree):
                    expr_parts.append(_expr_text(child))
            expr_text = " ".join(expr_parts)
        return {"parameters": [], "expression": expr_text}

    def constraint_def(self, children):
        name = _token_text(children[0])
        body_info = {"parameters": [], "expression": ""}
        for child in children[1:]:
            if isinstance(child, dict):
                body_info = child
        node = ConstraintDef(
            name=name,
            parameters=body_info.get("parameters", []),
            expression=body_info.get("expression", ""),
        )
        _set_loc(node, children[0])
        return node


    # ---- Usages ----

    def typed_usage(self, children):
        type_ref = ""
        mult = None
        for child in children:
            if isinstance(child, str):
                type_ref = child
            elif isinstance(child, Token):
                t = _token_text(child)
                if t and t not in (":", ";"):
                    type_ref = t
            elif isinstance(child, Tree):
                if child.data == "qualified_name":
                    type_ref = _qn_text(child)
                elif child.data == "multiplicity":
                    mult = _qn_text(child)
        return {"definition_ref": type_ref, "features": [], "multiplicity": mult}

    def block_usage(self, children):
        features = [c for c in children if isinstance(c, ASTNode)]
        return {"definition_ref": "", "features": features}

    def stub_usage(self, children):
        return {"definition_ref": "", "features": []}

    def part_usage(self, children):
        name = _token_text(children[0])
        info = self._extract_usage_info(children[1:])
        node = PartUsage(name=name, definition_ref=info["definition_ref"], features=info["features"])
        _set_loc(node, children[0])
        return node

    def item_usage(self, children):
        name = _token_text(children[0])
        info = self._extract_usage_info(children[1:])
        node = ItemUsage(name=name, definition_ref=info["definition_ref"], features=info["features"])
        _set_loc(node, children[0])
        return node

    def port_usage(self, children):
        name = _token_text(children[0])
        info = self._extract_usage_info(children[1:])
        node = PortUsage(name=name, definition_ref=info["definition_ref"], features=info["features"])
        _set_loc(node, children[0])
        return node

    def interface_usage(self, children):
        name = _token_text(children[0])
        info = self._extract_usage_info(children[1:])
        node = InterfaceUsage(name=name, definition_ref=info["definition_ref"], features=info["features"])
        _set_loc(node, children[0])
        return node

    def requirement_usage(self, children):
        name = _token_text(children[0])
        info = self._extract_usage_info(children[1:])
        node = RequirementUsage(name=name, definition_ref=info["definition_ref"], features=info["features"])
        _set_loc(node, children[0])
        return node

    def constraint_usage(self, children):
        name = _token_text(children[0])
        info = self._extract_usage_info(children[1:])
        node = ConstraintUsage(name=name, definition_ref=info["definition_ref"], features=info["features"])
        _set_loc(node, children[0])
        return node

    def action_usage(self, children):
        name = _token_text(children[0])
        info = self._extract_usage_info(children[1:])
        node = ActionUsage(name=name, definition_ref=info["definition_ref"], features=info["features"])
        _set_loc(node, children[0])
        return node

    def state_usage(self, children):
        name = _token_text(children[0])
        info = self._extract_usage_info(children[1:])
        node = StateUsage(name=name, definition_ref=info["definition_ref"], features=info["features"])
        _set_loc(node, children[0])
        return node

    def actor_usage(self, children):
        name = _token_text(children[0])
        info = self._extract_usage_info(children[1:])
        # ActorUsage reuses ActionDef-like structure
        node = PartUsage(name=name, definition_ref=info["definition_ref"], features=info["features"])
        _set_loc(node, children[0])
        return node

    def usecase_usage(self, children):
        name = _token_text(children[0])
        info = self._extract_usage_info(children[1:])
        node = PartUsage(name=name, definition_ref=info["definition_ref"], features=info["features"])
        _set_loc(node, children[0])
        return node

    def _extract_usage_info(self, rest_children):
        info = {"definition_ref": "", "features": []}
        for child in rest_children:
            if isinstance(child, dict):
                info["definition_ref"] = child.get("definition_ref", "")
                info["features"] = child.get("features", [])
            elif isinstance(child, Tree):
                if child.data in ("typed_usage",):
                    info["definition_ref"] = _qn_text(child.children[0]) if child.children else ""
                elif child.data in ("block_usage",):
                    info["features"] = [c for c in child.children if isinstance(c, ASTNode)]
        return info


    # ---- Features ----

    def typed_attribute(self, children):
        name = _token_text(children[0])
        type_ref = ""
        mult = None
        default = None
        for child in children[1:]:
            if isinstance(child, str):
                # Result from a type-alias rule (e.g., real_type -> "Real")
                type_ref = child
            elif isinstance(child, Token):
                t = _token_text(child)
                if child.type == "ESCAPED_STRING":
                    default = t
                elif t and t not in (":", "=", ";"):
                    type_ref = t
            elif isinstance(child, Tree):
                if child.data == "qualified_name":
                    type_ref = _qn_text(child)
                elif child.data in ("multiplicity",):
                    mult = _qn_text(child)
                else:
                    # Expression tree as default value
                    default = _expr_text(child)
        node = AttributeDef(name=name, type_ref=type_ref, multiplicity=mult, default_value=default)
        _set_loc(node, children[0])
        return node

    def simple_attribute(self, children):
        name = _token_text(children[0])
        default = None
        for child in children[1:]:
            if isinstance(child, Token):
                t = _token_text(child)
                if t and t not in ("=", ";"):
                    default = t
            elif isinstance(child, Tree):
                default = _token_text(child)
        node = AttributeDef(name=name, type_ref=None, default_value=default)
        _set_loc(node, children[0])
        return node

    @staticmethod
    def _extract_type_ref(children, skip_keywords=()):
        """Extract type reference text from children, skipping given keywords."""
        for child in children:
            if isinstance(child, str):
                if child not in skip_keywords:
                    return child
            elif isinstance(child, Token):
                t = str(child)
                if t not in (":", ";") and t not in skip_keywords:
                    return t
            elif isinstance(child, Tree):
                return _qn_text(child)
        return ""

    def port_feature_typed(self, children):
        name = _token_text(children[0])
        type_ref = self._extract_type_ref(children[1:])
        node = PortDef(name=name, type_ref=type_ref)
        _set_loc(node, children[0])
        return node

    def port_feature_bare(self, children):
        name = _token_text(children[0])
        node = PortDef(name=name)
        _set_loc(node, children[0])
        return node

    def port_feature_in(self, children):
        name = _token_text(children[0])
        type_ref = self._extract_type_ref(children[1:], skip_keywords=("in",))
        node = PortDef(name=name, direction="in", type_ref=type_ref)
        _set_loc(node, children[0])
        return node

    def port_feature_out(self, children):
        name = _token_text(children[0])
        type_ref = self._extract_type_ref(children[1:], skip_keywords=("out",))
        node = PortDef(name=name, direction="out", type_ref=type_ref)
        _set_loc(node, children[0])
        return node

    def port_feature_inout(self, children):
        name = _token_text(children[0])
        type_ref = self._extract_type_ref(children[1:], skip_keywords=("inout",))
        node = PortDef(name=name, direction="inout", type_ref=type_ref)
        _set_loc(node, children[0])
        return node

    def ref_feature(self, children):
        name = _token_text(children[0])
        type_ref = self._extract_type_ref(children[1:], skip_keywords=("ref",))
        node = AttributeDef(name=name, type_ref=type_ref)
        _set_loc(node, children[0])
        return node


    # ---- Relationships ----

    def connection_stmt(self, children):
        source = _qn_text(children[0])
        target = _qn_text(children[1]) if len(children) > 1 else ""
        node = ConnectionDef(source=source, target=target, connection_type="Connection")
        if children:
            _set_loc(node, children[0])
        return node

    def binding_stmt(self, children):
        name = _token_text(children[0]) if children else None
        non_name = [c for c in children if not (isinstance(c, Token) and _token_text(c) == name)]
        source = _qn_text(non_name[0]) if len(non_name) > 0 else ""
        target = _qn_text(non_name[1]) if len(non_name) > 1 else ""
        node = BindingDef(name=name, source=source, target=target)
        if children:
            _set_loc(node, children[0])
        return node

    def binding_stmt_anon(self, children):
        source = _qn_text(children[0])
        target = _qn_text(children[1]) if len(children) > 1 else ""
        node = BindingDef(source=source, target=target)
        _set_loc(node, children[0])
        return node

    def flow_stmt(self, children):
        name = _token_text(children[0]) if children else None
        non_name = [c for c in children if not (isinstance(c, Token) and _token_text(c) == name)]
        source = _qn_text(non_name[0]) if len(non_name) > 0 else ""
        target = _qn_text(non_name[1]) if len(non_name) > 1 else ""
        node = FlowDef(name=name, source=source, target=target)
        if children:
            _set_loc(node, children[0])
        return node

    def flow_stmt_anon(self, children):
        source = _qn_text(children[0])
        target = _qn_text(children[1]) if len(children) > 1 else ""
        node = FlowDef(source=source, target=target)
        _set_loc(node, children[0])
        return node

    def satisfy_stmt(self, children):
        source = _qn_text(children[0])
        target = _qn_text(children[1]) if len(children) > 1 else ""
        node = SatisfyRelation(source=source, target=target)
        _set_loc(node, children[0])
        return node

    def verify_stmt(self, children):
        source = _qn_text(children[0])
        target = _qn_text(children[1]) if len(children) > 1 else ""
        node = VerifyRelation(source=source, target=target)
        _set_loc(node, children[0])
        return node

    def allocation_stmt(self, children):
        source = _qn_text(children[0])
        target = _qn_text(children[1]) if len(children) > 1 else ""
        node = Allocation(source=source, target=target)
        _set_loc(node, children[0])
        return node

    def subclassification_stmt(self, children):
        subtype = _qn_text(children[0])
        supertype = _qn_text(children[1]) if len(children) > 1 else ""
        node = Subclassification(subtype=subtype, supertype=supertype)
        _set_loc(node, children[0])
        return node

    def transition_stmt(self, children):
        name = _token_text(children[0]) if children else None
        non_name = [c for c in children if not (isinstance(c, Token) and _token_text(c) == name)]
        source = _qn_text(non_name[0]) if len(non_name) > 0 else ""
        target = _qn_text(non_name[1]) if len(non_name) > 1 else ""
        node = TransitionDef(name=name, source=source, target=target)
        if children:
            _set_loc(node, children[0])
        return node

    def transition_stmt_anon(self, children):
        source = _qn_text(children[0])
        target = _qn_text(children[1]) if len(children) > 1 else ""
        node = TransitionDef(source=source, target=target)
        _set_loc(node, children[0])
        return node


    # ---- Comment ----

    def comment_with_name(self, children):
        name = _token_text(children[0])
        body = _token_text(children[1]) if len(children) > 1 else ""
        node = CommentNode(name=name, body=body)
        _set_loc(node, children[0])
        return node

    def comment_anon(self, children):
        body = _token_text(children[0])
        node = CommentNode(body=body)
        _set_loc(node, children[0])
        return node


    # ---- Type ref aliases (just pass through text) ----

    def real_type(self, _):
        return "Real"

    def integer_type(self, _):
        return "Integer"

    def string_type(self, _):
        return "String"

    def boolean_type(self, _):
        return "Boolean"

    def scalar_type(self, _):
        return "Scalar"

    def complex_type(self, _):
        return "Complex"


    # ---- Convenience ----

    def build(self, tree: Tree) -> list[ASTNode]:
        """Transform a Lark ParseTree into a list of ASTNodes.

        Args:
            tree: The top-level tree from ``SysML2Parser.parse()``.

        Returns:
            Flattened list of all top-level AST nodes.
        """
        result = self.transform(tree)
        if isinstance(result, list):
            return [n for n in result if isinstance(n, ASTNode)]
        if isinstance(result, ASTNode):
            return [result]
        if isinstance(result, Tree):
            return []
        return []
