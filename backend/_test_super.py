"""Debug supertype parsing."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.services.parser import SysML2Parser

parser = SysML2Parser()

text = "part def Child :> Parent {}"
print("Input:", repr(text))
tree = parser.parse(text)
print("\nTree:")
print(tree.pretty())

model = parser.parse_to_model(text)
for e in model["elements"]:
    if e["type"] == "PartDefinition":
        print(f"\nElement: {e['name']}")
        print(f"Props keys: {list(e['properties'].keys())}")
        print(f"superTypes: {e['properties'].get('superTypes', [])}")

# Now test generation
gen = parser.generate_text(model, format=False)
print(f"\nGenerated: {repr(gen)}")
gen_f = parser.generate_text(model, format=True)
print(f"Formatted:\n{gen_f}")
