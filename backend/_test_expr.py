"""Debug expression parsing."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import lark

parser = lark.Lark.open(
    'app/services/parser/grammar/sysml2.lark',
    parser='lalr',
    debug=False
)

text = 'constraint def C1 (x: Real) { x + y > 0 }'
tree = parser.parse(text)
print("=== Raw Tree ===")
print(tree.pretty())

from app.services.parser.ast_builder import ASTBuilder
builder = ASTBuilder()
nodes = builder.build(tree)
for n in nodes:
    if hasattr(n, 'expression'):
        print(f"\nExpression stored: '{n.expression}'")
    if hasattr(n, 'parameters'):
        print(f"Parameters: {n.parameters}")
