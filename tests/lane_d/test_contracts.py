"""Contract schema validation tests for Lane D.

Validates that all JSON schemas in contracts/ are valid Draft 2020-12 schemas
and that all example fixtures in contracts/examples/ strictly validate against them.
"""

from pathlib import Path
import json
import pytest
import jsonschema
from jsonschema import Draft202012Validator
from referencing import Registry, Resource


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CONTRACTS_DIR = REPO_ROOT / "contracts"
EXAMPLES_DIR = CONTRACTS_DIR / "examples"


def load_json(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="session")
def schema_registry() -> Registry:
    """Builds a schema registry resolving all schema files in contracts/."""
    registry = Registry()
    for schema_file in CONTRACTS_DIR.glob("*.schema.json"):
        schema_data = load_json(schema_file)
        resource = Resource.from_contents(schema_data)
        # Register both by canonical $id and by filename
        registry = registry.with_resource(schema_file.name, resource)
        if "$id" in schema_data:
            registry = registry.with_resource(schema_data["$id"], resource)
    return registry


SCHEMA_EXAMPLE_PAIRS = [
    ("state.schema.json", "state.json"),
    ("decision.schema.json", "decision.json"),
    ("event.schema.json", "event.json"),
    ("summary.schema.json", "summary.json"),
    ("autopsy_item.schema.json", "autopsy_item.json"),
    ("lab_result.schema.json", "lab_result.json"),
    ("calibration_result.schema.json", "calibration_result.json"),
]


@pytest.mark.parametrize("schema_name,example_name", SCHEMA_EXAMPLE_PAIRS)
def test_schema_validity(schema_name: str, example_name: str):
    schema_path = CONTRACTS_DIR / schema_name
    assert schema_path.exists(), f"Schema file missing: {schema_path}"
    schema_data = load_json(schema_path)
    # Validate the schema itself against the Draft 2020-12 meta-schema
    Draft202012Validator.check_schema(schema_data)


@pytest.mark.parametrize("schema_name,example_name", SCHEMA_EXAMPLE_PAIRS)
def test_example_matches_schema(schema_name: str, example_name: str, schema_registry: Registry):
    schema_path = CONTRACTS_DIR / schema_name
    example_path = EXAMPLES_DIR / example_name
    assert example_path.exists(), f"Example file missing: {example_path}"

    schema_data = load_json(schema_path)
    example_data = load_json(example_path)

    validator = Draft202012Validator(schema_data, registry=schema_registry)
    errors = sorted(validator.iter_errors(example_data), key=lambda e: e.path)
    if errors:
        error_msgs = "\n".join(f"- {list(e.path)}: {e.message}" for e in errors)
        pytest.fail(f"Example {example_name} failed validation against {schema_name}:\n{error_msgs}")


def test_event_schema_version_is_one(schema_registry: Registry):
    event_example = load_json(EXAMPLES_DIR / "event.json")
    assert event_example.get("schema") == 1


def test_invalid_event_raises(schema_registry: Registry):
    schema_data = load_json(CONTRACTS_DIR / "event.schema.json")
    validator = Draft202012Validator(schema_data, registry=schema_registry)
    bad_event = {"schema": 99}
    assert list(validator.iter_errors(bad_event)), "Expected validation errors for incomplete event"
