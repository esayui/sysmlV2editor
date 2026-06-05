"""Debug raw def_body children without transformer."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import lark

parser = lark.Lark.open(
    'app/services/parser/grammar/sysml2.lark',
    parser='lalr',
    debug=False
)

text = "part def Child :> Parent {}"
tree = parser.parse(text)

def walk_raw(node, indent=0):
    prefix = "  " * indent
    if isinstance(node, lark.Tree):
        print(f"{prefix}Tree('{node.data}', [")
        for child in node.children:
            walk_raw(child, indent + 1)
        print(f"{prefix}])")
    elif isinstance(node, lark.Token):
        print(f"{prefix}Token({node.type!r}, {node.value!r})")

walk_raw(tree)
