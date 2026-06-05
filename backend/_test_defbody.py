"""Debug def_body handler."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.services.parser import SysML2Parser

parser = SysML2Parser()

text = "part def Child :> Parent {}"
tree = parser.parse(text)

# Walk to def_body
from lark import Tree
def find_defbody(node, path=""):
    if isinstance(node, Tree):
        if node.data == "def_body":
            print(f"def_body children ({len(node.children)}):")
            for i, c in enumerate(node.children):
                print(f"  [{i}] type={type(c).__name__}, str={str(c)!r}")
                if hasattr(c, 'type'):
                    print(f"       token_type={c.type!r}")
        for child in node.children:
            find_defbody(child)

find_defbody(tree)
