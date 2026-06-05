"""
Model Manager — Semantic model CRUD, query, namespace resolution, and
cross-reference maintenance.

Implements the interface specified in detailed-design.md §4.2.

Depends on:
    - M-BE-01 SysML v2 Parser (for load_from_text / export_to_text)
"""

from __future__ import annotations

import uuid
from typing import Any

from app.services.parser import SysML2Parser, TextGenerator


class DuplicateNameError(Exception):
    """Raised when an element name conflicts with an existing element
    in the same namespace."""

    def __init__(self, message: str):
        super().__init__(message)


class ElementNotFoundError(Exception):
    """Raised when an element cannot be found by its ID."""

    def __init__(self, message: str):
        super().__init__(message)


class ModelNotLoadedError(RuntimeError):
    """Raised when an operation requires a loaded model but none exists."""

    def __init__(self):
        super().__init__(
            "No model loaded. Call create_model() or load_from_text() first."
        )


class ModelManager:
    """Semantic model manager — CRUD, query, namespace resolution.

    Internally stores a ``SemanticModel`` dictionary (as defined in
    detailed-design.md §5.1) and provides methods to manipulate it.

    Usage::

        mm = ModelManager()
        mm.create_model("MyModel")
        mm.add_element({"name": "Engine", "type": "PartDefinition"})
        children = mm.get_children(owner_id)
        mm.delete_element(element_id)  # cascade
    """

    def __init__(self):
        """Initialise with empty state; model must be created or loaded
        before any operation that requires it."""
        self.model: dict[str, Any] | None = None
        self._parser: SysML2Parser | None = None

    # ------------------------------------------------------------------
    #  Lazy parser access
    # ------------------------------------------------------------------

    def _get_parser(self) -> SysML2Parser:
        """Return (and lazily create) a SysML2Parser instance."""
        if self._parser is None:
            self._parser = SysML2Parser()
        return self._parser

    # ------------------------------------------------------------------
    #  Internal helpers
    # ------------------------------------------------------------------

    def _require_model(self) -> dict[str, Any]:
        """Return the current model or raise ModelNotLoadedError."""
        if self.model is None:
            raise ModelNotLoadedError()
        return self.model

    # ==================================================================
    #  Lifecycle
    # ==================================================================

    def create_model(self, name: str) -> dict:
        """Create a new empty semantic model.

        Args:
            name: Human-readable model name.

        Returns:
            The newly created model dictionary.
        """
        self.model = {
            "id": str(uuid.uuid4()),
            "name": name,
            "elements": [],
            "relationships": [],
            "packages": [],
        }
        return self.model

    def load_from_text(self, text: str) -> dict:
        """Parse ``.sysml2`` text and replace the current model.

        Args:
            text: SysML v2 source text.

        Returns:
            The parsed model dictionary.

        Raises:
            SysML2SyntaxError: When the text contains a syntax error.
        """
        parser = self._get_parser()
        self.model = parser.parse_to_model(text)
        return self.model

    def export_to_text(self, format: bool = True) -> str:
        """Export the current model as ``.sysml2`` text.

        Args:
            format: If True, produce indented multi-line output.

        Returns:
            SysML v2 text string.
        """
        model = self._require_model()
        generator = TextGenerator()
        return generator.generate(model, format=format)

    # ==================================================================
    #  Queries
    # ==================================================================

    def get_element(self, element_id: str) -> dict:
        """Look up an element by its UUID.

        Args:
            element_id: The element's unique identifier.

        Returns:
            The element dictionary.

        Raises:
            ElementNotFoundError: When no element with *element_id* exists.
        """
        model = self._require_model()
        for elem in model["elements"]:
            if elem["id"] == element_id:
                return elem
        raise ElementNotFoundError(f"Element with id '{element_id}' not found")

    def get_element_by_qualified_name(self, qname: str) -> dict | None:
        """Look up an element by its fully qualified name (e.g. "A::B::C").

        Args:
            qname: The qualified name to search for.

        Returns:
            The element dictionary or *None* if not found.
        """
        model = self._require_model()
        for elem in model["elements"]:
            if elem.get("qualifiedName") == qname:
                return elem
        return None

    def get_children(self, element_id: str) -> list[dict]:
        """Return all elements whose *ownerId* is *element_id*.

        Args:
            element_id: The parent element UUID.

        Returns:
            List of child element dictionaries (may be empty).
        """
        model = self._require_model()
        return [e for e in model["elements"] if e.get("ownerId") == element_id]

    def get_relationships(self, element_id: str) -> list[dict]:
        """Return all relationships where *element_id* participates as
        source or target.

        Matching is done on UUID as well as qualified name (to support
        relationships that were produced by the parser, which store
        qualified names in *sourceId* / *targetId*).

        Args:
            element_id: Element UUID.

        Returns:
            List of relationship dictionaries (may be empty).
        """
        model = self._require_model()
        # Build a set of identifiers that represent this element, so we
        # catch both UUID-based and qname-based relationship endpoints.
        candidates: set[str] = {element_id}
        try:
            elem = self.get_element(element_id)
            candidates.add(elem.get("qualifiedName", ""))
            candidates.add(elem.get("name", ""))
        except ElementNotFoundError:
            pass

        return [
            r
            for r in model.get("relationships", [])
            if r.get("sourceId") in candidates or r.get("targetId") in candidates
        ]

    def find_usages(self, definition_id: str) -> list[dict]:
        """Find all Usage elements whose *definitionRef* property references
        the given Definition.

        Matching is performed against both the definition's qualified name
        and its simple name.

        Args:
            definition_id: UUID of a Definition element.

        Returns:
            List of Usage element dictionaries that reference the definition.
        """
        model = self._require_model()
        definition = self.get_element(definition_id)
        def_qname = definition.get("qualifiedName", "")
        def_name = definition.get("name", "")

        results: list[dict] = []
        for elem in model["elements"]:
            props = elem.get("properties", {})
            ref = props.get("definitionRef", "")
            if ref and (ref == def_qname or ref == def_name):
                results.append(elem)
        return results

    def resolve_reference(self, ref_text: str, context_id: str) -> dict | None:
        """Resolve a textual reference like "a::b::c" to an actual element,
        searching relative to *context_id*.

        Algorithm:
            1. Exact qualified-name match.
            2. Walk up the context's namespace (its qualified name prefix),
               trying each prefix-level combination.

        Args:
            ref_text: The reference text to resolve (e.g. "a::b::c").
            context_id: UUID of the element whose scope is used for
                relative resolution.

        Returns:
            The resolved element dictionary, or *None*.
        """
        model = self._require_model()

        # 1. Exact match
        exact = self.get_element_by_qualified_name(ref_text)
        if exact is not None:
            return exact

        # 2. Relative resolution
        try:
            context = self.get_element(context_id)
        except ElementNotFoundError:
            return None

        context_qname: str = context.get("qualifiedName", "")
        parts = context_qname.split("::")
        for i in range(len(parts) + 1):
            prefix = "::".join(parts[:i])
            candidate = f"{prefix}::{ref_text}" if prefix else ref_text
            result = self.get_element_by_qualified_name(candidate)
            if result is not None:
                return result

        return None

    # ==================================================================
    #  Mutations
    # ==================================================================

    def add_element(self, element: dict, owner_id: str | None = None) -> dict:
        """Add an element to the model.

        - Assigns a UUID if none is provided.
        - Sets *ownerId* and computes *qualifiedName*.
        - Checks for name conflicts under the same parent.

        Args:
            element: Element dict with at least ``name`` and ``type``.
            owner_id: UUID of the owning element (or *None* for top-level).

        Returns:
            The element dict (now with *id*, *ownerId*, *qualifiedName*).

        Raises:
            DuplicateNameError: When a sibling element with the same name
                already exists under *owner_id*.
        """
        model = self._require_model()

        # Assign UUID
        if not element.get("id"):
            element["id"] = str(uuid.uuid4())

        elem_name = element.get("name", "")
        element["ownerId"] = owner_id

        # Name conflict check
        if self.check_name_conflict(elem_name, owner_id):
            raise DuplicateNameError(
                f"Element name '{elem_name}' already exists under parent "
                f"'{owner_id}'"
            )

        # Compute qualified name
        if owner_id is not None:
            try:
                owner = self.get_element(owner_id)
                element["qualifiedName"] = (
                    f"{owner['qualifiedName']}::{elem_name}"
                )
            except ElementNotFoundError:
                element["qualifiedName"] = elem_name
        else:
            element["qualifiedName"] = elem_name

        # Defaults
        element.setdefault("type", "PartDefinition")
        element.setdefault("shortName", None)
        element.setdefault("description", "")
        element.setdefault("properties", {})

        model["elements"].append(element)

        # If owner is a tracked package, add to its elementIds
        self._add_to_package(owner_id, element["id"])

        return element

    def update_element(self, element_id: str, patch: dict) -> dict:
        """Merge *patch* into the element identified by *element_id*.

        *id* may not be changed via patch.  The *properties* sub-dict is
        merged rather than replaced.

        Args:
            element_id: UUID of the element to update.
            patch: Dictionary of key-value pairs to apply.

        Returns:
            The updated element dict.

        Raises:
            ElementNotFoundError: When *element_id* does not exist.
            DuplicateNameError: When a name change creates a conflict.
        """
        elem = self.get_element(element_id)

        patch_copy = {k: v for k, v in patch.items() if k != "id"}

        # Name conflict check on rename
        if "name" in patch_copy:
            new_name = patch_copy["name"]
            effective_owner = patch_copy.get("ownerId", elem.get("ownerId"))
            if new_name != elem.get("name") and self.check_name_conflict(
                new_name, effective_owner
            ):
                raise DuplicateNameError(
                    f"Element name '{new_name}' already exists under parent "
                    f"'{effective_owner}'"
                )

        # Merge
        for key, value in patch_copy.items():
            if key == "properties" and isinstance(value, dict):
                elem.setdefault("properties", {}).update(value)
            else:
                elem[key] = value

        return elem

    def delete_element(self, element_id: str) -> None:
        """Delete an element and perform cascade cleanup:

        1. Recursively collect all descendant elements.
        2. Remove all relationships involving the deleted elements.
        3. Remove the elements from the model.
        4. Update package membership lists.

        Usage elements that referenced the deleted definition are kept
        (their *definitionRef* becomes dangling).  Use
        :meth:`get_dangling_references` to detect them.

        Args:
            element_id: UUID of the element to delete.

        Raises:
            ElementNotFoundError: When *element_id* does not exist.
        """
        model = self._require_model()
        self.get_element(element_id)  # validate existence

        # Collect all IDs to be deleted (element + descendants)
        ids_to_delete: set[str] = {element_id}
        descendants = self._collect_descendants(element_id)
        ids_to_delete.update(c["id"] for c in descendants)

        # Remove relationships that involve any deleted element
        model["relationships"] = [
            r
            for r in model.get("relationships", [])
            if r.get("sourceId") not in ids_to_delete
            and r.get("targetId") not in ids_to_delete
        ]

        # Remove elements
        model["elements"] = [
            e
            for e in model.get("elements", [])
            if e["id"] not in ids_to_delete
        ]

        # Update packages — purge deleted element IDs
        for pkg in model.get("packages", []):
            pkg["elementIds"] = [
                eid
                for eid in pkg.get("elementIds", [])
                if eid not in ids_to_delete
            ]

    def _collect_descendants(self, element_id: str) -> list[dict]:
        """Return all descendants (children, grandchildren, …) of *element_id*."""
        result: list[dict] = []
        children = self.get_children(element_id)
        for child in children:
            result.append(child)
            result.extend(self._collect_descendants(child["id"]))
        return result

    def add_relationship(self, rel: dict) -> dict:
        """Add a relationship to the model.

        Assigns a UUID if none is provided.  *sourceId* and *targetId*
        should be element UUIDs.

        Args:
            rel: Relationship dict with at least *type*, *sourceId*,
                *targetId*.

        Returns:
            The relationship dict (now guaranteed to have an *id*).
        """
        model = self._require_model()

        if not rel.get("id"):
            rel["id"] = str(uuid.uuid4())

        rel.setdefault("name", None)
        rel.setdefault("sourcePortId", None)
        rel.setdefault("targetPortId", None)
        rel.setdefault("properties", {})

        model.setdefault("relationships", []).append(rel)
        return rel

    def delete_relationship(self, rel_id: str) -> None:
        """Remove a relationship from the model by its ID.

        Args:
            rel_id: UUID of the relationship to remove.
        """
        model = self._require_model()
        model["relationships"] = [
            r for r in model.get("relationships", []) if r["id"] != rel_id
        ]

    def move_element(self, element_id: str, new_owner_id: str) -> None:
        """Move an element under a new owner, updating its (and all
        descendants') *ownerId* and *qualifiedName*.

        Args:
            element_id: UUID of the element to move.
            new_owner_id: UUID of the new parent element.

        Raises:
            ElementNotFoundError: When *element_id* or *new_owner_id*
                does not exist.
            DuplicateNameError: When a name conflict exists under
                *new_owner_id*.
        """
        elem = self.get_element(element_id)
        new_owner = self.get_element(new_owner_id)
        name = elem.get("name", "")

        old_owner_id = elem.get("ownerId")
        old_qname = elem.get("qualifiedName", "")

        # Conflict check in destination
        if self.check_name_conflict(name, new_owner_id):
            raise DuplicateNameError(
                f"Element name '{name}' already exists under parent "
                f"'{new_owner_id}'"
            )

        # Update the moved element
        elem["ownerId"] = new_owner_id
        new_qname = f"{new_owner['qualifiedName']}::{name}"
        elem["qualifiedName"] = new_qname

        # Recursively update qualified names of all descendants
        children = self.get_children(element_id)
        for child in children:
            self._reparent_descendants(child["id"], old_qname, new_qname)

        # Update package membership
        if old_owner_id:
            self._remove_from_package(old_owner_id, element_id)
        self._add_to_package(new_owner_id, element_id)

    def _reparent_descendants(
        self, element_id: str, old_prefix: str, new_prefix: str
    ) -> None:
        """Recursively update qualified names for descendants after a move."""
        try:
            elem = self.get_element(element_id)
        except ElementNotFoundError:
            return

        cur_qname = elem.get("qualifiedName", "")
        if cur_qname.startswith(old_prefix):
            elem["qualifiedName"] = new_prefix + cur_qname[len(old_prefix):]

        children = self.get_children(element_id)
        for child in children:
            self._reparent_descendants(child["id"], old_prefix, new_prefix)

    # ==================================================================
    #  Validation helpers
    # ==================================================================

    def check_name_conflict(self, name: str, parent_id: str | None) -> bool:
        """Return True if *name* already exists under *parent_id*.

        Args:
            name: The element name to check.
            parent_id: The *ownerId* to scope the check to (or *None*
                for global top-level).

        Returns:
            True if a conflict exists.
        """
        model = self._require_model()
        for elem in model["elements"]:
            if elem.get("name") == name and elem.get("ownerId") == parent_id:
                return True
        return False

    def get_dangling_references(self) -> list[str]:
        """Return element IDs whose *definitionRef* (Usage elements) or
        *sourceId*/*targetId* (Relationships) point to a non-existent
        element.

        Returns:
            List of element/relationship IDs with unresolved references.
        """
        model = self._require_model()

        # Build lookup sets
        element_ids: set[str] = {e["id"] for e in model["elements"]}
        qname_to_id: dict[str, str] = {
            e["qualifiedName"]: e["id"] for e in model["elements"]
        }

        dangling: list[str] = []

        # Check usage references
        for elem in model["elements"]:
            props = elem.get("properties", {})
            def_ref: str = props.get("definitionRef", "")
            if def_ref and def_ref not in qname_to_id:
                dangling.append(elem["id"])

        # Check relationship endpoints
        for rel in model.get("relationships", []):
            src: str = rel.get("sourceId", "")
            tgt: str = rel.get("targetId", "")
            if src and src not in element_ids and src not in qname_to_id:
                dangling.append(rel["id"])
            if tgt and tgt not in element_ids and tgt not in qname_to_id:
                if rel["id"] not in dangling:
                    dangling.append(rel["id"])

        return dangling

    # ------------------------------------------------------------------
    #  Package helpers
    # ------------------------------------------------------------------

    def _add_to_package(self, owner_id: str | None, element_id: str) -> None:
        """If *owner_id* is a tracked package, add *element_id* to its
        *elementIds* list."""
        if owner_id is None:
            return
        model = self._require_model()
        for pkg in model.get("packages", []):
            if pkg["id"] == owner_id:
                pkg.setdefault("elementIds", []).append(element_id)
                return

    def _remove_from_package(self, owner_id: str, element_id: str) -> None:
        """Remove *element_id* from the *elementIds* of the package
        whose id is *owner_id*."""
        model = self._require_model()
        for pkg in model.get("packages", []):
            if pkg["id"] == owner_id:
                pkg["elementIds"] = [
                    eid
                    for eid in pkg.get("elementIds", [])
                    if eid != element_id
                ]
                return
