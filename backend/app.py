from flask import Flask, jsonify, request
from flask_cors import CORS
import json

app = Flask(__name__)
CORS(app)   # allow frontend access


# ---------------- LOAD JSON FILES ---------------- #

def load_json(filename):
    with open(filename, "r", encoding="utf-8") as f:
        return json.load(f)

definitions = load_json("class1_definitions.json")
analogies = load_json("class1_analogies.json")
dialects = load_json("dialect_templates.json")
gamify = load_json("gamification.json")


# ---------------- HELPER FUNCTIONS ---------------- #

def get_definition(concept_id):
    """Find a definition by concept ID."""
    for item in definitions:
        if item["id"] == concept_id:
            return item
    return None


def get_analogy(concept_id, persona):
    """Get analogy for specific persona."""
    for item in analogies:
        if item["concept_id"] == concept_id:
            key = f"analogy_{persona}"
            return item.get(key)
    return None


def apply_dialect(template, definition, analogy):
    """Apply dialect template."""
    if not template:
        template = "{definition_simplified}. {analogy}"
    text = template.replace("{definition_simplified}", definition)
    text = text.replace("{analogy}", analogy)
    return text


# ---------------- ROUTES ---------------- #

@app.route("/")
def home():
    return jsonify({"status": "running", "message": "Backend OK"})


@app.route("/definition_list")
def definition_list():
    return jsonify({"status": "ok", "data": definitions})


@app.route("/analogy_list")
def analogy_list():
    return jsonify({"status": "ok", "data": analogies})


@app.route("/dialect_templates")
def dialect_templates():
    return jsonify(dialects)


@app.route("/gamify")
def gamify_route():
    return jsonify(gamify)


@app.route("/definition/<concept_id>")
def route_definition(concept_id):
    data = get_definition(concept_id)
    if data:
        return jsonify({"status": "ok", "data": data})
    return jsonify({"status": "error", "message": "Concept not found"}), 404


@app.route("/analogy/<concept_id>")
def route_analogy(concept_id):
    persona = request.args.get("persona", "farmer")
    analogy = get_analogy(concept_id, persona)
    if analogy:
        return jsonify({"status": "ok", "analogy": analogy})
    return jsonify({"status": "error", "message": "Analogy not found"}), 404


@app.route("/explain/<concept_id>")
def explain(concept_id):
    persona = request.args.get("persona", "farmer")
    dialect = request.args.get("dialect", "bhojpuri")

    # Step 1: get definition
    def_data = get_definition(concept_id)
    if not def_data:
        return jsonify({"status": "error", "message": "Concept not found"}), 404
    definition = def_data["definition"]

    # Step 2: get analogy
    analogy = get_analogy(concept_id, persona) or "No example available."

    # Step 3: get template
    template = dialects["templates"].get(dialect, {}).get("simple_pattern")

    # Step 4: combine
    dialect_text = apply_dialect(template, definition, analogy)

    return jsonify({
        "status": "ok",
        "definition": definition,
        "analogy": analogy,
        "dialect_output": dialect_text
    })


@app.route("/gain_xp", methods=["POST"])
def gain_xp():
    data = request.get_json()
    current = data.get("current_xp", 0)
    add = data.get("add", 10)

    new_xp = current + add
    new_level = 1

    for lvl in gamify["levels"]:
        if new_xp >= lvl["xp_required"]:
            new_level = lvl["level"]

    return jsonify({
        "status": "ok",
        "new_xp": new_xp,
        "level": new_level
    })


if __name__ == "__main__":
    print("🚀 Backend running on http://127.0.0.1:5000")
    app.run(debug=True)
