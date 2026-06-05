"""Debug expression parsing — check raw children."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import lark

parser = lark.Lark.open(
    'app/services/parser/grammar/sysml2.lark',
    parser='lalr',
    debug=False
)

text = 'part def Test { constraint c1 (x: Real) { x + y > 0 } }'
tree = parser.parse(text)
print("=== Raw Tree ===")
print(tree.pretty())

# Walk into the tree and print types
def walk(tree, indent=0):
    prefix = "  " * indent
    if isinstance(tree, lark.Tree):
        print(f"{prefix}Tree(data='{tree.data}', children=[")
        for child in tree.children:
            if isinstance(child, lark.Token):
                print(f"{prefix}  Token(type='{child.type}', value='{child.value}')")
            else:
                walk(child, indent + 2)
        print(f"{prefix}])")
    else:
        print(f"{prefix}{type(tree).__name__}: {tree}")

walk(tree)
